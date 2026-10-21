// Toggleable effects (spells, conditions, situations) and how they change a roll.
// Rules follow the 2024 Player's Handbook / SRD 5.2. Effects describe the roller's own
// situation – what the *target* has (e.g. its cover vs. your attack) is the DM's business.

import {
  ABILITIES,
  isD20Test,
  type Ability,
  type BonusDice,
  type Flat,
  type RollKind,
  type RollMode,
  type RollRequest,
} from "./dice";

export const ABILITY_LABEL: Record<Ability, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

export interface RollContext {
  kind: RollKind;
  ability?: Ability;
}

/** What one effect contributes to a roll. */
export interface Impact {
  dice?: Omit<BonusDice, "source">;
  flat?: number;
  advantage?: boolean;
  disadvantage?: boolean;
  autoFail?: boolean;
}

export type EffectGroup = "spell" | "condition" | "situation";
/** Whether an effect helps or hurts the one it is on (used for colouring). */
export type EffectTone = "positive" | "negative";

export interface EffectDef {
  id: string;
  name: string;
  group: EffectGroup;
  tone: EffectTone;
  /** Short rules summary shown in the UI. */
  summary: string;
  /** Stacking levels (Exhaustion 1–5); omitted means on/off. */
  maxLevel?: number;
  concentration?: boolean;
  /** Used up by the first roll it affects (e.g. the Help action). */
  consumable?: boolean;
  impact: (ctx: RollContext, level: number) => Impact | null;
}

const on = (kinds: RollKind[], ctx: RollContext) => kinds.includes(ctx.kind);
const d4 = (sign: 1 | -1) => ({ die: 4 as const, count: 1, sign });

export const EFFECTS: EffectDef[] = [
  // --- Spells ---
  {
    id: "bless",
    name: "Bless",
    group: "spell",
    tone: "positive",
    summary: "+1d4 to attack rolls and saving throws",
    concentration: true,
    impact: (c) => (on(["attack", "save"], c) ? { dice: d4(1) } : null),
  },
  {
    id: "bane",
    name: "Bane",
    group: "spell",
    tone: "negative",
    summary: "−1d4 to attack rolls and saving throws",
    impact: (c) => (on(["attack", "save"], c) ? { dice: d4(-1) } : null),
  },
  {
    id: "guidance",
    name: "Guidance",
    group: "spell",
    tone: "positive",
    summary: "+1d4 to ability checks (2024: one chosen skill)",
    concentration: true,
    impact: (c) => (on(["check"], c) ? { dice: d4(1) } : null),
  },
  // --- Conditions ---
  {
    id: "poisoned",
    name: "Poisoned",
    group: "condition",
    tone: "negative",
    summary: "Disadvantage on attack rolls and ability checks",
    impact: (c) => (on(["attack", "check"], c) ? { disadvantage: true } : null),
  },
  {
    id: "frightened",
    name: "Frightened",
    group: "condition",
    tone: "negative",
    summary: "Disadvantage on attack rolls and ability checks while the source is in sight",
    impact: (c) => (on(["attack", "check"], c) ? { disadvantage: true } : null),
  },
  {
    id: "blinded",
    name: "Blinded",
    group: "condition",
    tone: "negative",
    summary: "Disadvantage on your attack rolls",
    impact: (c) => (on(["attack"], c) ? { disadvantage: true } : null),
  },
  {
    id: "prone",
    name: "Prone",
    group: "condition",
    tone: "negative",
    summary: "Disadvantage on your attack rolls",
    impact: (c) => (on(["attack"], c) ? { disadvantage: true } : null),
  },
  {
    id: "restrained",
    name: "Restrained",
    group: "condition",
    tone: "negative",
    summary: "Disadvantage on attack rolls and Dexterity saving throws",
    impact: (c) =>
      on(["attack"], c) || (c.kind === "save" && c.ability === "dex") ? { disadvantage: true } : null,
  },
  {
    id: "grappled",
    name: "Grappled",
    group: "condition",
    tone: "negative",
    summary: "Disadvantage on attacks against anyone but the grappler",
    impact: (c) => (on(["attack"], c) ? { disadvantage: true } : null),
  },
  {
    id: "invisible",
    name: "Invisible",
    group: "condition",
    tone: "positive",
    summary: "Advantage on your attack rolls",
    impact: (c) => (on(["attack"], c) ? { advantage: true } : null),
  },
  {
    id: "paralyzed",
    name: "Paralyzed / Stunned / Unconscious",
    group: "condition",
    tone: "negative",
    summary: "Automatically fail Strength and Dexterity saving throws",
    impact: (c) => (c.kind === "save" && (c.ability === "str" || c.ability === "dex") ? { autoFail: true } : null),
  },
  {
    id: "exhaustion",
    name: "Exhaustion",
    group: "condition",
    tone: "negative",
    summary: "−2 per level to all D20 Tests (level 6 = death)",
    maxLevel: 5,
    impact: (c, level) => (isD20Test(c.kind) ? { flat: -2 * level } : null),
  },
  // --- Situations ---
  {
    id: "help",
    name: "Helped",
    group: "situation",
    tone: "positive",
    summary: "Advantage on the next attack roll or ability check (used up)",
    consumable: true,
    impact: (c) => (on(["attack", "check"], c) ? { advantage: true } : null),
  },
  {
    id: "cover-half",
    name: "Half Cover",
    group: "situation",
    tone: "positive",
    summary: "+2 to Dexterity saving throws",
    impact: (c) => (c.kind === "save" && c.ability === "dex" ? { flat: 2 } : null),
  },
  {
    id: "cover-three-quarters",
    name: "Three-Quarters Cover",
    group: "situation",
    tone: "positive",
    summary: "+5 to Dexterity saving throws",
    impact: (c) => (c.kind === "save" && c.ability === "dex" ? { flat: 5 } : null),
  },
];

export const EFFECTS_BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));

/** Active effects: id → level (1 for on/off effects). */
export type ActiveEffects = Record<string, number>;

export function effectLabel(def: EffectDef, level: number): string {
  return def.maxLevel ? `${def.name} ${level}` : def.name;
}

/** Cycles an effect: off → on (or level 1 → … → max) → off. */
export function toggleEffect(active: ActiveEffects, id: string): ActiveEffects {
  const def = EFFECTS_BY_ID.get(id);
  if (!def) return active;
  const { [id]: level = 0, ...rest } = active;
  const next = level + 1;
  return next > (def.maxLevel ?? 1) ? rest : { ...rest, [id]: next };
}

export function parseActiveEffects(raw: unknown): ActiveEffects {
  const out: ActiveEffects = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, level] of Object.entries(raw)) {
    const def = EFFECTS_BY_ID.get(id);
    if (def && Number.isInteger(level) && (level as number) >= 1) out[id] = Math.min(level as number, def.maxLevel ?? 1);
  }
  return out;
}

const MANUAL = "your choice";

/** Everything the active effects add to a roll of the given kind. */
export interface Applied {
  bonusDice: BonusDice[];
  flats: Flat[];
  mode: RollMode;
  notes: string[];
  autoFail: boolean;
  /** Ids of consumable effects that this roll used up. */
  consumed: string[];
}

/**
 * Applies active effects and resolves advantage/disadvantage per the rules:
 * several sources don't stack, and having both cancels out to a normal roll.
 * `chosen` is the mode picked manually in the UI and counts as one more source.
 */
export function applyEffects(ctx: RollContext, active: ActiveEffects, chosen: RollMode = "normal"): Applied {
  const out: Applied = { bonusDice: [], flats: [], mode: "normal", notes: [], autoFail: false, consumed: [] };
  const adv: string[] = chosen === "advantage" ? [MANUAL] : [];
  const dis: string[] = chosen === "disadvantage" ? [MANUAL] : [];

  for (const def of EFFECTS) {
    const level = active[def.id];
    if (!level) continue;
    const hit = def.impact(ctx, level);
    if (!hit) continue;
    const source = effectLabel(def, level);
    if (def.consumable) out.consumed.push(def.id);
    if (hit.dice) out.bonusDice.push({ source, ...hit.dice });
    if (hit.flat) out.flats.push({ source, value: hit.flat });
    if (hit.advantage) adv.push(source);
    if (hit.disadvantage) dis.push(source);
    if (hit.autoFail) {
      out.autoFail = true;
      out.notes.push(`Automatically fails (${source})`);
    }
  }

  // A manual choice alone needs no explanation; as soon as effects are involved, name every source.
  const why = (list: string[]) => list.join(", ");
  const onlyManual = (list: string[]) => list.length === 1 && list[0] === MANUAL;
  if (adv.length && dis.length) {
    out.notes.push(`Advantage (${why(adv)}) and Disadvantage (${why(dis)}) cancel out`);
  } else if (adv.length) {
    out.mode = "advantage";
    if (!onlyManual(adv)) out.notes.push(`Advantage from ${why(adv)}`);
  } else if (dis.length) {
    out.mode = "disadvantage";
    if (!onlyManual(dis)) out.notes.push(`Disadvantage from ${why(dis)}`);
  }
  return out;
}

/**
 * Builds the final request for a roll: D20 Tests always roll a single d20 plus the
 * modifier; effects only touch D20 Tests (damage gets the crit option instead).
 */
export function buildRoll(
  base: RollRequest & { kind: RollKind },
  active: ActiveEffects,
  chosen: RollMode,
): RollRequest & { consumed: string[] } {
  if (!isD20Test(base.kind)) {
    return { ...base, mode: base.kind === "free" ? chosen : "normal", consumed: [] };
  }
  const ctx: RollContext = { kind: base.kind, ability: base.ability };
  const a = applyEffects(ctx, active, chosen);
  return {
    ...base,
    consumed: a.consumed,
    dice: [{ die: 20, count: 1 }],
    crit: false,
    mode: a.mode,
    bonusDice: a.bonusDice,
    flats: a.flats,
    notes: [...(base.notes ?? []), ...a.notes],
    autoFail: a.autoFail,
  };
}

export { ABILITIES };
