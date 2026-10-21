// Player character sheet (2024 rules / SRD 5.2) and the values derived from it.

import { ABILITIES, isDie, normalizePool, type Ability, type DiceGroup, type RollKind } from "./dice";
import { amountAt, damageTypeLabel, parseStoredSpell, type Spell } from "./spells";
import { ABILITY_LABEL } from "./effects";

export const SKILLS = [
  { id: "acrobatics", name: "Acrobatics", ability: "dex" },
  { id: "animal-handling", name: "Animal Handling", ability: "wis" },
  { id: "arcana", name: "Arcana", ability: "int" },
  { id: "athletics", name: "Athletics", ability: "str" },
  { id: "deception", name: "Deception", ability: "cha" },
  { id: "history", name: "History", ability: "int" },
  { id: "insight", name: "Insight", ability: "wis" },
  { id: "intimidation", name: "Intimidation", ability: "cha" },
  { id: "investigation", name: "Investigation", ability: "int" },
  { id: "medicine", name: "Medicine", ability: "wis" },
  { id: "nature", name: "Nature", ability: "int" },
  { id: "perception", name: "Perception", ability: "wis" },
  { id: "performance", name: "Performance", ability: "cha" },
  { id: "persuasion", name: "Persuasion", ability: "cha" },
  { id: "religion", name: "Religion", ability: "int" },
  { id: "sleight-of-hand", name: "Sleight of Hand", ability: "dex" },
  { id: "stealth", name: "Stealth", ability: "dex" },
  { id: "survival", name: "Survival", ability: "wis" },
] as const satisfies readonly { id: string; name: string; ability: Ability }[];

export type SkillId = (typeof SKILLS)[number]["id"];

/** 0 = untrained, 1 = proficient, 2 = expertise (double proficiency bonus). */
export type Proficiency = 0 | 1 | 2;

export interface Attack {
  id: string;
  name: string;
  /** Ability used for attack and damage (Finesse weapons pick Dex, spells use the casting ability). */
  ability: Ability;
  proficient: boolean;
  /** Magic weapon bonus (+1 … +3), added to attack and damage. */
  magic: number;
  damage: DiceGroup[];
  /** Whether the ability modifier is added to damage (off for e.g. many cantrips or off-hand attacks). */
  addModToDamage: boolean;
  damageType: string;
}

export interface Character {
  id: string;
  name: string;
  level: number;
  scores: Record<Ability, number>;
  saves: Ability[];
  skills: Partial<Record<SkillId, Proficiency>>;
  spellAbility?: Ability;
  armorClass?: number;
  attacks: Attack[];
  spells: Spell[];
}

export const LEVEL_RANGE = [1, 20] as const;
export const SCORE_RANGE = [1, 30] as const;
const NAME_MAX = 40;
const ATTACKS_MAX = 20;
export const SPELLS_MAX = 100;

const clamp = (v: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, v));
const newId = () =>
  typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

export function newCharacter(name = "New Character"): Character {
  return {
    id: newId(),
    name,
    level: 1,
    scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: [],
    skills: {},
    attacks: [],
    spells: [],
  };
}

export function newAttack(): Attack {
  return {
    id: newId(),
    name: "New Attack",
    ability: "str",
    proficient: true,
    magic: 0,
    damage: [{ die: 8, count: 1 }],
    addModToDamage: true,
    damageType: "",
  };
}

// --- Derived values ---

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) => 2 + Math.floor((clamp(level, LEVEL_RANGE) - 1) / 4);

export const modOf = (c: Character, a: Ability) => abilityMod(c.scores[a]);
export const pbOf = (c: Character) => proficiencyBonus(c.level);

export const saveMod = (c: Character, a: Ability) => modOf(c, a) + (c.saves.includes(a) ? pbOf(c) : 0);

export function skillMod(c: Character, id: SkillId): number {
  const skill = SKILLS.find((s) => s.id === id)!;
  return modOf(c, skill.ability) + pbOf(c) * (c.skills[id] ?? 0);
}

export const initiativeMod = (c: Character) => modOf(c, "dex");
export const passivePerception = (c: Character) => 10 + skillMod(c, "perception");

export const spellSaveDC = (c: Character) => (c.spellAbility ? 8 + modOf(c, c.spellAbility) + pbOf(c) : null);
export const spellAttackMod = (c: Character) => (c.spellAbility ? modOf(c, c.spellAbility) + pbOf(c) : null);

export const attackMod = (c: Character, a: Attack) => modOf(c, a.ability) + (a.proficient ? pbOf(c) : 0) + a.magic;
export const damageMod = (c: Character, a: Attack) => (a.addModToDamage ? modOf(c, a.ability) : 0) + a.magic;

/** Concentration save DC after taking damage: 10 or half the damage, whichever is higher (max 30). */
export const concentrationDC = (damage: number) => Math.min(30, Math.max(10, Math.floor(damage / 2)));

/** Death saving throw: 10+ succeeds; a natural 20 restores 1 HP, a natural 1 counts as two failures. */
export function deathSaveOutcome(natural: number, total: number): string {
  if (natural === 20) return "Natural 20: you regain 1 HP and wake up!";
  if (natural === 1) return "Natural 1: counts as two failures";
  return total >= 10 ? "Success" : "Failure";
}

// --- Dice notation ---

/** Parses "1d8", "2d6 + 1d4" (also "d6", German "2W6"); returns null for anything else. */
export function parseDice(text: string): DiceGroup[] | null {
  const parts = text.toLowerCase().replace(/\s+/g, "").split("+").filter(Boolean);
  if (!parts.length) return null;
  const groups: DiceGroup[] = [];
  for (const p of parts) {
    const m = /^(\d{0,2})[dw](\d{1,3})$/.exec(p);
    if (!m) return null;
    const count = m[1] ? Number(m[1]) : 1;
    const die = Number(m[2]);
    if (!isDie(die) || count < 1 || count > 50) return null;
    groups.push({ die, count });
  }
  return normalizePool(groups);
}

export const formatDice = (dice: DiceGroup[]) => dice.map((g) => `${g.count}d${g.die}`).join(" + ");

// --- Roll requests built from the sheet ---

export interface SheetRoll {
  kind: RollKind;
  ability?: Ability;
  dice: DiceGroup[];
  modifier: number;
  label: string;
  /** Marks a death saving throw so the result can be evaluated. */
  deathSave?: boolean;
  notes?: string[];
}

const d20: DiceGroup[] = [{ die: 20, count: 1 }];

export const abilityCheckRoll = (c: Character, a: Ability, label: string): SheetRoll => ({
  kind: "check",
  ability: a,
  dice: d20,
  modifier: modOf(c, a),
  label,
});

export const saveRoll = (c: Character, a: Ability, label: string): SheetRoll => ({
  kind: "save",
  ability: a,
  dice: d20,
  modifier: saveMod(c, a),
  label,
});

export function skillRoll(c: Character, id: SkillId): SheetRoll {
  const skill = SKILLS.find((s) => s.id === id)!;
  return { kind: "check", ability: skill.ability, dice: d20, modifier: skillMod(c, id), label: skill.name };
}

export const initiativeRoll = (c: Character): SheetRoll => ({
  kind: "check",
  ability: "dex",
  dice: d20,
  modifier: initiativeMod(c),
  label: "Initiative",
});

export const concentrationRoll = (c: Character): SheetRoll => ({
  kind: "save",
  ability: "con",
  dice: d20,
  modifier: saveMod(c, "con"),
  label: "Concentration",
  notes: ["DC = 10 or half the damage taken, whichever is higher (max 30)"],
});

export const deathSaveRoll = (): SheetRoll => ({
  kind: "save",
  dice: d20,
  modifier: 0,
  label: "Death Saving Throw",
  deathSave: true,
});

export const attackRoll = (c: Character, a: Attack): SheetRoll => ({
  kind: "attack",
  dice: d20,
  modifier: attackMod(c, a),
  label: a.name,
});

export const damageRoll = (c: Character, a: Attack): SheetRoll => ({
  kind: "damage",
  dice: a.damage,
  modifier: damageMod(c, a),
  label: a.damageType ? `${a.name} (${a.damageType})` : a.name,
});

// --- Spells ---

export function spellAttackRoll(c: Character, spell: Spell): SheetRoll {
  return { kind: "attack", dice: d20, modifier: spellAttackMod(c) ?? 0, label: spell.name };
}

export function spellDamageRoll(c: Character, spell: Spell, slot: number): SheetRoll | null {
  if (!spell.damage) return null;
  const dice = amountAt(spell.damage, spell.level, slot, c.level);
  const type = spell.damage.type ? ` (${damageTypeLabel(spell.damage.type)})` : "";
  const notes: string[] = [];
  if (spell.save) {
    const dc = spellSaveDC(c);
    notes.push(
      `Target: ${ABILITY_LABEL[spell.save.ability]} saving throw${dc !== null ? ` vs. DC ${dc}` : ""}` +
        (spell.save.onSuccess === "half" ? " – half damage on a success" : ""),
    );
  }
  return {
    kind: "damage",
    dice,
    modifier: 0,
    label: `${spell.name}${slot > spell.level && spell.level > 0 ? ` (level ${slot})` : ""}${type}`,
    notes,
  };
}

export function spellHealRoll(c: Character, spell: Spell, slot: number): SheetRoll | null {
  if (!spell.heal) return null;
  const mod = spell.heal.addMod && c.spellAbility ? modOf(c, c.spellAbility) : 0;
  return {
    kind: "free",
    dice: amountAt(spell.heal, spell.level, slot, c.level),
    modifier: mod,
    label: `${spell.name}${slot > spell.level ? ` (level ${slot})` : ""}: Healing`,
  };
}


// --- Parsing (tolerant, for import and device storage) ---

const isAbility = (a: unknown): a is Ability => ABILITIES.includes(a as Ability);
const int = (v: unknown, range: readonly [number, number], fallback: number) =>
  Number.isInteger(v) ? clamp(v as number, range) : fallback;
const str = (v: unknown, fallback: string, max = NAME_MAX) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;

function parseAttack(raw: unknown): Attack | null {
  const a = raw as Record<string, unknown> | null;
  if (!a || typeof a !== "object") return null;
  const damage = Array.isArray(a.damage)
    ? normalizePool(
        a.damage
          .filter((g) => isDie(g?.die) && Number.isInteger(g?.count) && g.count > 0)
          .map((g) => ({ die: g.die, count: clamp(g.count, [1, 50]) })),
      )
    : [];
  return {
    id: str(a.id, newId(), 64),
    name: str(a.name, "Attack"),
    ability: isAbility(a.ability) ? a.ability : "str",
    proficient: a.proficient !== false,
    magic: int(a.magic, [-5, 5], 0),
    damage: damage.length ? damage : [{ die: 4, count: 1 }],
    addModToDamage: a.addModToDamage !== false,
    damageType: str(a.damageType, ""),
  };
}

export function parseCharacter(raw: unknown): Character | null {
  const c = raw as Record<string, unknown> | null;
  if (!c || typeof c !== "object" || typeof c.name !== "string") return null;
  const rawScores = (c.scores ?? {}) as Record<string, unknown>;
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, int(rawScores[a], SCORE_RANGE, 10)])) as Record<
    Ability,
    number
  >;
  const rawSkills = (c.skills ?? {}) as Record<string, unknown>;
  const skills: Character["skills"] = {};
  for (const s of SKILLS) {
    const v = rawSkills[s.id];
    if (v === 1 || v === 2) skills[s.id] = v;
  }
  const out: Character = {
    id: str(c.id, newId(), 64),
    name: str(c.name, "Character"),
    level: int(c.level, LEVEL_RANGE, 1),
    scores,
    saves: Array.isArray(c.saves) ? ABILITIES.filter((a) => (c.saves as unknown[]).includes(a)) : [],
    skills,
    attacks: (Array.isArray(c.attacks) ? c.attacks : [])
      .map(parseAttack)
      .filter((a): a is Attack => a !== null)
      .slice(0, ATTACKS_MAX),
    spells: (Array.isArray(c.spells) ? c.spells : [])
      .map(parseStoredSpell)
      .filter((s): s is Spell => s !== null)
      .slice(0, SPELLS_MAX),
  };
  if (isAbility(c.spellAbility)) out.spellAbility = c.spellAbility;
  if (Number.isInteger(c.armorClass)) out.armorClass = clamp(c.armorClass as number, [0, 40]);
  return out;
}
