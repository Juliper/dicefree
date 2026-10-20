// Spells from the SRD 5.2 (2024) API, reduced to what the sheet needs to roll them.
// The 2024 data only structures attack spells and base damage; saving throws, healing,
// upcasting and cantrip scaling are read from the (very uniform) SRD wording.

import { ABILITIES, isDie, normalizePool, type Ability, type DiceGroup } from "./dice";

export interface SpellSave {
  ability: Ability;
  /** "half" = half damage on a successful save. */
  onSuccess?: "half";
}

export interface SpellAmount {
  /** Dice at the spell's own level (or for a cantrip at character level 1–4). */
  base: DiceGroup[];
  /** Extra dice per spell slot above the spell's level. */
  perSlot?: DiceGroup[];
  /** Cantrip dice at character levels 5, 11 and 17. */
  cantripTiers?: [DiceGroup[], DiceGroup[], DiceGroup[]];
}

export interface Spell {
  index: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  attack?: "melee" | "ranged";
  save?: SpellSave;
  damage?: SpellAmount & { type: string };
  heal?: SpellAmount & { addMod: boolean };
  description: string;
}

export interface SpellIndexEntry {
  index: string;
  name: string;
  level: number;
}

const ABILITY_WORD: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

export const DAMAGE_TYPE_DE: Record<string, string> = {
  acid: "Säure",
  bludgeoning: "Wucht",
  cold: "Kälte",
  fire: "Feuer",
  force: "Energie",
  lightning: "Blitz",
  necrotic: "Nekrotisch",
  piercing: "Stich",
  poison: "Gift",
  psychic: "Psychisch",
  radiant: "Gleißend",
  slashing: "Hieb",
  thunder: "Schall",
};

/** All "NdM" groups in a string, e.g. "1d10 + 1d6" or "8d6". */
export function diceIn(text: string): DiceGroup[] {
  const groups: DiceGroup[] = [];
  for (const m of text.matchAll(/(\d+)d(\d+)/gi)) {
    const count = Number(m[1]);
    const die = Number(m[2]);
    if (isDie(die) && count > 0 && count <= 50) groups.push({ die, count });
  }
  return normalizePool(groups);
}

const firstDice = (text: string | undefined) => (text ? diceIn(text) : []);

function parseSave(text: string): SpellSave | undefined {
  const m = /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(text);
  if (!m) return undefined;
  const save: SpellSave = { ability: ABILITY_WORD[m[1].toLowerCase()] };
  if (/half as much damage/i.test(text)) save.onSuccess = "half";
  return save;
}

function perSlot(text: string, what: "damage" | "healing"): DiceGroup[] | undefined {
  const m = new RegExp(`${what} increases by (\\d+d\\d+) for each spell slot level above`, "i").exec(text);
  return m ? diceIn(m[1]) : undefined;
}

function cantripTiers(text: string): SpellAmount["cantripTiers"] {
  const m = /levels 5 \((\d+d\d+)\), 11 \((\d+d\d+)\), and 17 \((\d+d\d+)\)/i.exec(text);
  return m ? [diceIn(m[1]), diceIn(m[2]), diceIn(m[3])] : undefined;
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/** Converts a raw /api/2024/spells/{index} response; returns null if it isn't a spell. */
export function parseSpell(raw: unknown): Spell | null {
  const d = raw as Record<string, any> | null;
  if (!d || typeof d.index !== "string" || typeof d.name !== "string" || !Number.isInteger(d.level)) return null;
  const description = str(d.description) || (Array.isArray(d.desc) ? d.desc.join("\n") : "");
  const higher = str(d.higher_level) || (Array.isArray(d.higher_level) ? d.higher_level.join("\n") : "");
  const all = `${description}\n${higher}`;

  const spell: Spell = {
    index: d.index,
    name: d.name,
    level: d.level,
    school: str(d.school?.name),
    castingTime: str(d.casting_time),
    range: str(d.range),
    duration: str(d.duration),
    concentration: d.concentration === true,
    ritual: d.ritual === true,
    description,
  };

  const attack = str(d.attack_type).toLowerCase() || /\b(melee|ranged) spell attack/i.exec(description)?.[1]?.toLowerCase();
  if (attack === "melee" || attack === "ranged") spell.attack = attack;

  const save = parseSave(description);
  if (save) spell.save = save;

  const bySlot = d.damage?.damage_at_slot_level as Record<string, string> | undefined;
  const byLevel = d.damage?.damage_at_character_level as Record<string, string> | undefined;
  const baseText = bySlot?.[String(d.level)] ?? (bySlot ? Object.values(bySlot)[0] : undefined) ?? byLevel?.["1"];
  const base = firstDice(baseText);
  if (base.length) {
    const type = str(d.damage?.damage_type?.index);
    spell.damage = { base, type };
    const extra = perSlot(all, "damage");
    if (extra?.length) spell.damage.perSlot = extra;
    const tiers =
      spell.level === 0
        ? (cantripTiers(all) ??
          (byLevel?.["5"] && byLevel["11"] && byLevel["17"]
            ? ([firstDice(byLevel["5"]), firstDice(byLevel["11"]), firstDice(byLevel["17"])] as SpellAmount["cantripTiers"])
            : undefined))
        : undefined;
    if (tiers) spell.damage.cantripTiers = tiers;
  }

  const heal =
    /regains?(?: a number of)? Hit Points equal to (\d+d\d+)( plus your spellcasting ability modifier)?/i.exec(description) ??
    /regains? (\d+d\d+)() Hit Points/i.exec(description);
  if (heal) {
    spell.heal = { base: diceIn(heal[1]), addMod: !!heal[2] };
    const extra = perSlot(all, "healing");
    if (extra?.length) spell.heal.perSlot = extra;
  }
  return spell;
}

/** Dice for a given slot level (leveled spells) or character level (cantrips). */
export function amountAt(a: SpellAmount, spellLevel: number, slot: number, characterLevel: number): DiceGroup[] {
  if (spellLevel === 0) {
    if (!a.cantripTiers) return a.base;
    const [l5, l11, l17] = a.cantripTiers;
    return characterLevel >= 17 ? l17 : characterLevel >= 11 ? l11 : characterLevel >= 5 ? l5 : a.base;
  }
  const above = Math.max(0, slot - spellLevel);
  if (!above || !a.perSlot) return a.base;
  return normalizePool([...a.base, ...a.perSlot.map((g) => ({ die: g.die, count: g.count * above }))]);
}

export const levelLabel = (level: number) => (level === 0 ? "Zaubertrick" : `Grad ${level}`);

export function damageTypeLabel(type: string): string {
  return DAMAGE_TYPE_DE[type] ?? type;
}

// --- Tolerant parsing for spells stored inside characters ---

const isAbility = (a: unknown): a is Ability => ABILITIES.includes(a as Ability);

function parseGroups(raw: unknown): DiceGroup[] {
  if (!Array.isArray(raw)) return [];
  return normalizePool(
    raw.filter((g) => isDie(g?.die) && Number.isInteger(g?.count) && g.count > 0).map((g) => ({ die: g.die, count: Math.min(50, g.count) })),
  );
}

function parseAmount(raw: any): SpellAmount | null {
  const base = parseGroups(raw?.base);
  if (!base.length) return null;
  const a: SpellAmount = { base };
  const per = parseGroups(raw.perSlot);
  if (per.length) a.perSlot = per;
  if (Array.isArray(raw.cantripTiers) && raw.cantripTiers.length === 3) {
    const t = raw.cantripTiers.map(parseGroups);
    if (t.every((x: DiceGroup[]) => x.length)) a.cantripTiers = t as SpellAmount["cantripTiers"];
  }
  return a;
}

export function parseStoredSpell(raw: unknown): Spell | null {
  const d = raw as Record<string, any> | null;
  if (!d || typeof d.index !== "string" || typeof d.name !== "string" || !Number.isInteger(d.level)) return null;
  const s: Spell = {
    index: d.index.slice(0, 80),
    name: d.name.slice(0, 80),
    level: Math.min(9, Math.max(0, d.level)),
    school: str(d.school).slice(0, 40),
    castingTime: str(d.castingTime).slice(0, 80),
    range: str(d.range).slice(0, 80),
    duration: str(d.duration).slice(0, 80),
    concentration: d.concentration === true,
    ritual: d.ritual === true,
    description: str(d.description).slice(0, 10_000),
  };
  if (d.attack === "melee" || d.attack === "ranged") s.attack = d.attack;
  if (isAbility(d.save?.ability)) s.save = d.save.onSuccess === "half" ? { ability: d.save.ability, onSuccess: "half" } : { ability: d.save.ability };
  const dmg = parseAmount(d.damage);
  if (dmg) s.damage = { ...dmg, type: str(d.damage.type).slice(0, 40) };
  const heal = parseAmount(d.heal);
  if (heal) s.heal = { ...heal, addMod: d.heal.addMod === true };
  return s;
}
