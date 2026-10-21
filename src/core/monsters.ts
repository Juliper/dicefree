// Monsters from the SRD 5.2 (2024) API, reduced to what a DM needs to run them at the table.

import { ABILITIES, isDie, normalizePool, type Ability, type BonusDice, type DiceGroup, type Flat } from "./dice";
import { abilityMod, type SheetRoll } from "./character";
import { ABILITY_LABEL } from "./effects";
import { damageTypeLabel } from "./spells";

export interface MonsterDamage {
  dice: DiceGroup[];
  bonus: number;
  type: string;
}

export type ActionSection = "trait" | "action" | "bonus" | "reaction" | "legendary";

export interface MonsterAction {
  section: ActionSection;
  name: string;
  desc: string;
  attackBonus?: number;
  damage: MonsterDamage[];
  dc?: { ability: Ability; value: number; success: "half" | "none" };
  /** Recharge on a d6 roll of at least this value (Recharge 5–6 → 5). */
  recharge?: number;
  perDay?: number;
}

export interface MonsterSpellcasting {
  ability?: Ability;
  dc?: number;
  attack?: number;
  spells: string[];
}

export interface Monster {
  index: string;
  name: string;
  size: string;
  type: string;
  cr: number;
  xp: number;
  ac: number;
  hp: number;
  hitDice: string;
  speed: string;
  scores: Record<Ability, number>;
  /** Saving throw bonuses the statblock lists; other saves use the plain modifier. */
  saves: Partial<Record<Ability, number>>;
  skills: { name: string; value: number }[];
  senses: string;
  languages: string;
  resistances: string[];
  immunities: string[];
  vulnerabilities: string[];
  conditionImmunities: string[];
  actions: MonsterAction[];
  spellcasting?: MonsterSpellcasting;
}

export interface MonsterIndexEntry {
  index: string;
  name: string;
}

const SECTION_FIELDS: [string, ActionSection][] = [
  ["special_abilities", "trait"],
  ["actions", "action"],
  ["bonus_actions", "bonus"],
  ["reactions", "reaction"],
  ["legendary_actions", "legendary"],
];

export const SECTION_LABEL: Record<ActionSection, string> = {
  trait: "Traits",
  action: "Actions",
  bonus: "Bonus Actions",
  reaction: "Reactions",
  legendary: "Legendary Actions",
};

export const sizeLabel = (s: string) => s;
/** "dragon" → "Dragon" (the API gives lower-case types). */
export const typeLabel = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** 0.125 → "1/8", 0.25 → "1/4", 0.5 → "1/2". */
export function crLabel(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

/** "1d10+8", "2d6", "1d4-1", "7" → dice + flat bonus. */
export function parseDamageDice(text: string): { dice: DiceGroup[]; bonus: number } | null {
  const t = text.replace(/\s+/g, "");
  if (/^\d+$/.test(t)) return { dice: [], bonus: Number(t) };
  const dice: DiceGroup[] = [];
  let bonus = 0;
  const re = /([+-]?)(?:(\d+)d(\d+)|(\d+))/gy;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(t))) {
    consumed = re.lastIndex;
    const sign = m[1] === "-" ? -1 : 1;
    if (m[2]) {
      const die = Number(m[3]);
      if (!isDie(die) || sign < 0) return null;
      dice.push({ die, count: Number(m[2]) });
    } else bonus += sign * Number(m[4]);
  }
  if (consumed !== t.length || (!dice.length && !bonus)) return null;
  return { dice: normalizePool(dice), bonus };
}

const ABILITY_IDS = new Set<string>(ABILITIES);
const asAbility = (x: unknown): Ability | undefined =>
  typeof x === "string" && ABILITY_IDS.has(x.toLowerCase()) ? (x.toLowerCase() as Ability) : undefined;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const names = (list: unknown) =>
  Array.isArray(list) ? list.map((x) => (typeof x === "string" ? x : str((x as any)?.index ?? (x as any)?.name))).filter(Boolean) : [];

function parseAction(raw: any, section: ActionSection): MonsterAction | null {
  if (!raw || typeof raw.name !== "string") return null;
  const a: MonsterAction = { section, name: raw.name, desc: str(raw.desc), damage: [] };
  if (Number.isInteger(raw.attack_bonus)) a.attackBonus = raw.attack_bonus;
  for (const d of Array.isArray(raw.damage) ? raw.damage : []) {
    const parsed = typeof d?.damage_dice === "string" ? parseDamageDice(d.damage_dice) : null;
    if (parsed) a.damage.push({ ...parsed, type: str(d.damage_type?.index) });
  }
  const dcAbility = asAbility(raw.dc?.dc_type?.index);
  if (dcAbility && Number.isInteger(raw.dc?.dc_value)) {
    a.dc = { ability: dcAbility, value: raw.dc.dc_value, success: raw.dc.success_type === "half" ? "half" : "none" };
  }
  if (raw.usage?.type === "recharge on roll" && Number.isInteger(raw.usage.min_value)) a.recharge = raw.usage.min_value;
  if (raw.usage?.type === "per day" && Number.isInteger(raw.usage.times)) a.perDay = raw.usage.times;
  return a;
}

function speedText(speed: unknown): string {
  if (!speed || typeof speed !== "object") return "";
  return Object.entries(speed as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => (k === "walk" ? v : `${k} ${v}`))
    .join(", ") as string;
}

function sensesText(senses: unknown): string {
  if (!senses || typeof senses !== "object") return "";
  return Object.entries(senses as Record<string, unknown>)
    .filter(([k]) => k !== "passive_perception")
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
    .join(", ");
}

/** Converts a raw /api/2024/monsters/{index} response; returns null if it isn't a monster. */
export function parseMonster(raw: unknown): Monster | null {
  const d = raw as Record<string, any> | null;
  if (!d || typeof d.index !== "string" || typeof d.name !== "string" || !Number.isInteger(d.hit_points)) return null;
  const scores = Object.fromEntries(
    ABILITIES.map((a) => [a, Number.isInteger(d[ABILITY_FIELD[a]]) ? d[ABILITY_FIELD[a]] : 10]),
  ) as Record<Ability, number>;

  const saves: Monster["saves"] = {};
  const skills: Monster["skills"] = [];
  for (const p of Array.isArray(d.proficiencies) ? d.proficiencies : []) {
    const id = str(p?.proficiency?.index);
    if (!Number.isInteger(p?.value)) continue;
    if (id.startsWith("saving-throw-")) {
      const ab = asAbility(id.slice("saving-throw-".length));
      if (ab) saves[ab] = p.value;
    } else if (id.startsWith("skill-")) {
      skills.push({ name: str(p.proficiency.name).replace(/^Skill:\s*/, ""), value: p.value });
    }
  }

  const actions: MonsterAction[] = [];
  for (const [field, section] of SECTION_FIELDS) {
    for (const a of Array.isArray(d[field]) ? d[field] : []) {
      const parsed = parseAction(a, section);
      if (parsed) actions.push(parsed);
    }
  }

  const m: Monster = {
    index: d.index,
    name: d.name,
    size: str(d.size),
    type: str(d.type),
    cr: typeof d.challenge_rating === "number" ? d.challenge_rating : 0,
    xp: Number.isInteger(d.xp) ? d.xp : 0,
    ac: Number.isInteger(d.armor_class?.[0]?.value) ? d.armor_class[0].value : 10,
    hp: d.hit_points,
    hitDice: str(d.hit_points_roll) || str(d.hit_dice),
    speed: speedText(d.speed),
    scores,
    saves,
    skills,
    senses: sensesText(d.senses),
    languages: str(d.languages),
    resistances: names(d.damage_resistances),
    immunities: names(d.damage_immunities),
    vulnerabilities: names(d.damage_vulnerabilities),
    conditionImmunities: names(d.condition_immunities),
    actions,
  };

  const sc = (d.actions ?? []).find((a: any) => a?.spellcasting)?.spellcasting ?? d.special_abilities?.find((a: any) => a?.spellcasting)?.spellcasting;
  if (sc) {
    m.spellcasting = { spells: Array.isArray(sc.spells) ? sc.spells.map((s: any) => str(s?.name)).filter(Boolean) : [] };
    const ab = asAbility(sc.ability?.index);
    if (ab) m.spellcasting.ability = ab;
    if (Number.isInteger(sc.dc)) m.spellcasting.dc = sc.dc;
    if (Number.isInteger(sc.modifier)) m.spellcasting.attack = sc.modifier;
  }
  return m;
}

const ABILITY_FIELD: Record<Ability, string> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

// --- Derived values and rolls ---

export const monsterMod = (m: Monster, a: Ability) => abilityMod(m.scores[a]);
export const monsterSave = (m: Monster, a: Ability) => m.saves[a] ?? monsterMod(m, a);

export function damageText(dmg: MonsterDamage[]): string {
  return dmg
    .map((d) => {
      const dice = d.dice.map((g) => `${g.count}d${g.die}`).join(" + ");
      const bonus = d.bonus ? `${dice ? (d.bonus > 0 ? " + " : " − ") : ""}${dice ? Math.abs(d.bonus) : d.bonus}` : "";
      return `${dice}${bonus}${d.type ? ` ${damageTypeLabel(d.type)}` : ""}`;
    })
    .join(" + ");
}

/** Monster rolls may carry extra damage types as sourced dice/flats, or a recharge threshold to evaluate. */
export type MonsterRoll = SheetRoll & { bonusDice?: BonusDice[]; flats?: Flat[]; rechargeAt?: number };

export const rechargeOutcome = (total: number, at: number) => (total >= at ? "Recharged!" : "Not recharged");

const d20: DiceGroup[] = [{ die: 20, count: 1 }];

export const monsterCheckRoll = (m: Monster, label: string, a: Ability): MonsterRoll => ({
  kind: "check",
  ability: a,
  dice: d20,
  modifier: monsterMod(m, a),
  label,
});

export const monsterSaveRoll = (m: Monster, label: string, a: Ability): MonsterRoll => ({
  kind: "save",
  ability: a,
  dice: d20,
  modifier: monsterSave(m, a),
  label,
});

export const monsterSkillRoll = (label: string, value: number): MonsterRoll => ({
  kind: "check",
  dice: d20,
  modifier: value,
  label,
});

export const monsterAttackRoll = (label: string, action: MonsterAction): MonsterRoll => ({
  kind: "attack",
  dice: d20,
  modifier: action.attackBonus ?? 0,
  label,
});

/**
 * Damage of an action: the first damage type is the main roll, further types
 * (e.g. "+ 2d4 Fire") are added as sourced dice so the result shows each type.
 */
export function monsterDamageRoll(label: string, action: MonsterAction): MonsterRoll | null {
  const [first, ...rest] = action.damage;
  if (!first) return null;
  const notes: string[] = [];
  if (action.dc) {
    notes.push(
      `${ABILITY_LABEL[action.dc.ability]} saving throw DC ${action.dc.value}` +
        (action.dc.success === "half" ? " – half damage on a success" : ""),
    );
  }
  return {
    kind: "damage",
    dice: first.dice,
    modifier: first.bonus,
    label: first.type ? `${label} (${damageTypeLabel(first.type)})` : label,
    bonusDice: rest.flatMap((d) =>
      d.dice.map((g) => ({ source: damageTypeLabel(d.type) || "Damage", die: g.die, count: g.count, sign: 1 as const })),
    ),
    flats: rest.filter((d) => d.bonus).map((d) => ({ source: damageTypeLabel(d.type) || "Damage", value: d.bonus })),
    notes,
  };
}

export const rechargeRoll = (label: string, action: MonsterAction): MonsterRoll => ({
  kind: "free",
  dice: [{ die: 6, count: 1 }],
  modifier: 0,
  label: `${label}: Recharge ${action.recharge}${action.recharge === 6 ? "" : "–6"}`,
  rechargeAt: action.recharge,
});

/** Rolls the hit dice ("18d12+90") for individual hit points. */
export function hitPointsRoll(m: Monster): MonsterRoll | null {
  const parsed = parseDamageDice(m.hitDice);
  if (!parsed?.dice.length) return null;
  return { kind: "free", dice: parsed.dice, modifier: parsed.bonus, label: `${m.name}: Hit Points` };
}


// --- Tolerant parsing for monsters stored on the device ---

export function parseStoredMonster(raw: unknown): Monster | null {
  const d = raw as Record<string, any> | null;
  if (!d || typeof d.index !== "string" || typeof d.name !== "string" || !Number.isInteger(d.hp)) return null;
  const clampInt = (v: unknown, min: number, max: number, fb: number) =>
    Number.isInteger(v) ? Math.min(max, Math.max(min, v as number)) : fb;
  const groups = (g: unknown): DiceGroup[] =>
    Array.isArray(g)
      ? normalizePool(g.filter((x) => isDie(x?.die) && Number.isInteger(x?.count) && x.count > 0).map((x) => ({ die: x.die, count: Math.min(99, x.count) })))
      : [];
  const sections = new Set(SECTION_FIELDS.map(([, s]) => s));
  const actions: MonsterAction[] = (Array.isArray(d.actions) ? d.actions : [])
    .filter((a: any) => a && typeof a.name === "string" && sections.has(a.section))
    .slice(0, 60)
    .map((a: any) => {
      const out: MonsterAction = {
        section: a.section,
        name: a.name.slice(0, 80),
        desc: str(a.desc).slice(0, 4000),
        damage: (Array.isArray(a.damage) ? a.damage : [])
          .map((x: any) => ({ dice: groups(x?.dice), bonus: clampInt(x?.bonus, -99, 999, 0), type: str(x?.type).slice(0, 40) }))
          .filter((x: MonsterDamage) => x.dice.length || x.bonus),
      };
      if (Number.isInteger(a.attackBonus)) out.attackBonus = clampInt(a.attackBonus, -20, 50, 0);
      const ab = asAbility(a.dc?.ability);
      if (ab && Number.isInteger(a.dc?.value)) out.dc = { ability: ab, value: clampInt(a.dc.value, 1, 40, 10), success: a.dc.success === "half" ? "half" : "none" };
      if (Number.isInteger(a.recharge)) out.recharge = clampInt(a.recharge, 2, 6, 6);
      if (Number.isInteger(a.perDay)) out.perDay = clampInt(a.perDay, 1, 10, 1);
      return out;
    });
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, clampInt(d.scores?.[a], 1, 30, 10)])) as Record<Ability, number>;
  const saves: Monster["saves"] = {};
  for (const a of ABILITIES) if (Number.isInteger(d.saves?.[a])) saves[a] = clampInt(d.saves[a], -10, 30, 0);
  const strList = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 200)).slice(0, 20) : []);
  const m: Monster = {
    index: d.index.slice(0, 80),
    name: d.name.slice(0, 80),
    size: str(d.size).slice(0, 20),
    type: str(d.type).slice(0, 40),
    cr: typeof d.cr === "number" && d.cr >= 0 && d.cr <= 30 ? d.cr : 0,
    xp: clampInt(d.xp, 0, 1_000_000, 0),
    ac: clampInt(d.ac, 0, 40, 10),
    hp: clampInt(d.hp, 1, 9999, 1),
    hitDice: str(d.hitDice).slice(0, 40),
    speed: str(d.speed).slice(0, 120),
    scores,
    saves,
    skills: (Array.isArray(d.skills) ? d.skills : [])
      .filter((s: any) => typeof s?.name === "string" && Number.isInteger(s?.value))
      .slice(0, 20)
      .map((s: any) => ({ name: s.name.slice(0, 40), value: clampInt(s.value, -10, 30, 0) })),
    senses: str(d.senses).slice(0, 200),
    languages: str(d.languages).slice(0, 200),
    resistances: strList(d.resistances),
    immunities: strList(d.immunities),
    vulnerabilities: strList(d.vulnerabilities),
    conditionImmunities: strList(d.conditionImmunities),
    actions,
  };
  if (d.spellcasting && typeof d.spellcasting === "object") {
    const sc: MonsterSpellcasting = { spells: strList(d.spellcasting.spells) };
    const ab = asAbility(d.spellcasting.ability);
    if (ab) sc.ability = ab;
    if (Number.isInteger(d.spellcasting.dc)) sc.dc = clampInt(d.spellcasting.dc, 1, 40, 10);
    if (Number.isInteger(d.spellcasting.attack)) sc.attack = clampInt(d.spellcasting.attack, -10, 30, 0);
    m.spellcasting = sc;
  }
  return m;
}
