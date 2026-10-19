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

export interface RollRequest {
  die: Die;
  count: number;
  modifier: number;
}

export interface RollResult extends RollRequest {
  rolls: number[];
  total: number;
  at: string;
}

export function roll(req: RollRequest, random: RandomSource = cryptoRandom): RollResult {
  const rolls = Array.from({ length: req.count }, () => rollDie(req.die, random));
  const total = rolls.reduce((a, b) => a + b, 0) + req.modifier;
  return { ...req, rolls, total, at: new Date().toISOString() };
}

export type Natural = "crit" | "fumble" | null;

/** Natural 20 / natural 1 — only meaningful for a single d20. */
export function natural(r: RollResult): Natural {
  if (r.die !== 20 || r.count !== 1) return null;
  if (r.rolls[0] === 20) return "crit";
  if (r.rolls[0] === 1) return "fumble";
  return null;
}

export function formatModifier(m: number): string {
  return m >= 0 ? `+${m}` : `${m}`;
}

export function expression({ count, die, modifier }: RollRequest): string {
  return `${count}d${die}${modifier ? formatModifier(modifier) : ""}`;
}

export function isDie(n: unknown): n is Die {
  return DICE.includes(n as Die);
}
