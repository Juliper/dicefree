export const DICE = [4, 6, 8, 10, 12, 20, 100] as const;
export type Die = (typeof DICE)[number];

/** Returns a uniformly distributed 32-bit unsigned integer. Injectable for tests. */
export type RandomSource = () => number;

export const cryptoRandom: RandomSource = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
};

const UINT32_RANGE = 0x1_0000_0000;

/** Unbiased integer in [1, sides] via rejection sampling. */
export function rollDie(sides: number, random: RandomSource = cryptoRandom): number {
  const limit = Math.floor(UINT32_RANGE / sides) * sides;
  let x: number;
  do {
    x = random();
  } while (x >= limit);
  return (x % sides) + 1;
}

/** A number of identical dice in a pool, e.g. 2d6. */
export interface DiceGroup {
  die: Die;
  count: number;
}

export type RollMode = "normal" | "advantage" | "disadvantage";

/** What a roll is for. attack/check/save are the D20 Tests of the 2024 rules. */
export type RollKind = "free" | "attack" | "check" | "save" | "damage";
export const D20_TESTS: readonly RollKind[] = ["attack", "check", "save"];
export const isD20Test = (k: RollKind | undefined) => !!k && D20_TESTS.includes(k);

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

/** Dice added (or subtracted) by a named source, e.g. Bless +1d4 or Bane −1d4. */
export interface BonusDice {
  source: string;
  die: Die;
  count: number;
  sign: 1 | -1;
}

/** A flat number from a named source, e.g. Exhaustion −4. */
export interface Flat {
  source: string;
  value: number;
}

/** A mixed pool plus flat bonus/malus, e.g. 2d6 + 1d8 + 3. */
export interface RollRequest {
  dice: DiceGroup[];
  modifier: number;
  /** Advantage/disadvantage; only applies when the pool holds exactly one d20. */
  mode?: RollMode;
  /** Optional name, e.g. of the saved roll that produced it. */
  label?: string;
  kind?: RollKind;
  ability?: Ability;
  bonusDice?: BonusDice[];
  flats?: Flat[];
  /** Critical hit: every damage die is rolled twice (2024: modifiers are not doubled). */
  crit?: boolean;
  /** Explanations shown with the result, e.g. "Advantage from Invisible". */
  notes?: string[];
  /** The roll fails regardless of the dice (e.g. Paralyzed vs. a Dex save). */
  autoFail?: boolean;
}

export interface GroupResult {
  die: Die;
  /** Dice that count towards the total. */
  rolls: number[];
  /** The discarded d20 of an advantage/disadvantage roll. */
  dropped?: number[];
  /** Set for dice from an effect; their rolls are shown separately. */
  source?: string;
  /** −1 for subtracted dice (Bane). */
  sign?: -1;
}

export interface RollResult {
  groups: GroupResult[];
  modifier: number;
  total: number;
  at: string;
  mode?: Exclude<RollMode, "normal">;
  label?: string;
  kind?: RollKind;
  ability?: Ability;
  flats?: Flat[];
  crit?: boolean;
  notes?: string[];
  autoFail?: boolean;
}

/** Merges duplicate dice, drops empty groups and sorts largest die first (1d20 + 1d4, as written in D&D). */
export function normalizePool(dice: DiceGroup[]): DiceGroup[] {
  const counts = new Map<Die, number>();
  for (const g of dice) counts.set(g.die, (counts.get(g.die) ?? 0) + g.count);
  return [...DICE].reverse().filter((d) => (counts.get(d) ?? 0) > 0).map((die) => ({ die, count: counts.get(die)! }));
}

export function poolSize(dice: DiceGroup[]): number {
  return dice.reduce((n, g) => n + g.count, 0);
}

/** Advantage/disadvantage is only defined for a single d20 (attack rolls, checks, saves). */
export function modeApplies(dice: DiceGroup[]): boolean {
  return normalizePool(dice).find((g) => g.die === 20)?.count === 1;
}

/** The player's own dice, without effect dice. */
export const ownGroups = (r: RollResult) => r.groups.filter((g) => !g.source);

const sumGroup = (g: GroupResult) => (g.sign ?? 1) * g.rolls.reduce((a, b) => a + b, 0);

export function roll(req: RollRequest, random: RandomSource = cryptoRandom): RollResult {
  const mode = req.mode && req.mode !== "normal" && modeApplies(req.dice) ? req.mode : undefined;
  const times = req.crit ? 2 : 1;
  const rollN = (die: Die, n: number) => Array.from({ length: n * times }, () => rollDie(die, random));

  const groups: GroupResult[] = normalizePool(req.dice).map(({ die, count }) => {
    if (die === 20 && mode) {
      const a = rollDie(20, random);
      const b = rollDie(20, random);
      const keepA = mode === "advantage" ? a >= b : a <= b;
      return { die, rolls: [keepA ? a : b], dropped: [keepA ? b : a] };
    }
    return { die, rolls: rollN(die, count) };
  });
  for (const b of req.bonusDice ?? []) {
    const g: GroupResult = { die: b.die, rolls: rollN(b.die, b.count), source: b.source };
    if (b.sign === -1) g.sign = -1;
    groups.push(g);
  }

  const flats = req.flats?.filter((f) => f.value) ?? [];
  const total =
    groups.reduce((n, g) => n + sumGroup(g), 0) + req.modifier + flats.reduce((n, f) => n + f.value, 0);

  const result: RollResult = { groups, modifier: req.modifier, total, at: new Date().toISOString() };
  if (mode) result.mode = mode;
  if (req.label) result.label = req.label;
  if (req.kind && req.kind !== "free") result.kind = req.kind;
  if (req.ability) result.ability = req.ability;
  if (flats.length) result.flats = flats;
  if (req.crit) result.crit = true;
  if (req.notes?.length) result.notes = req.notes;
  if (req.autoFail) result.autoFail = true;
  return result;
}

export type Natural = "crit" | "fumble" | null;

/** Natural 20 / natural 1 — only when the pool holds exactly one d20 (other dice like a Bless d4 are fine). */
export function natural(r: RollResult): Natural {
  const d20 = ownGroups(r).find((g) => g.die === 20);
  if (!d20 || d20.rolls.length !== 1) return null;
  if (d20.rolls[0] === 20) return "crit";
  if (d20.rolls[0] === 1) return "fumble";
  return null;
}

export function formatModifier(m: number): string {
  return m >= 0 ? `+${m}` : `${m}`;
}

/** "2d6 + 1d8 + 3" for a request or a result (own dice and modifier only; effects are listed separately). */
export function expression(x: Pick<RollRequest, "dice" | "modifier"> | RollResult): string {
  const groups =
    "dice" in x ? x.dice : ownGroups(x).map((g) => ({ die: g.die, count: x.crit ? g.rolls.length / 2 : g.rolls.length }));
  const parts = groups.map((g) => `${g.count}d${g.die}`);
  let s = parts.join(" + ");
  if (x.modifier) s += `${s ? " " : ""}${x.modifier > 0 ? "+" : "−"} ${Math.abs(x.modifier)}`;
  return s;
}

export function isDie(n: unknown): n is Die {
  return DICE.includes(n as Die);
}
