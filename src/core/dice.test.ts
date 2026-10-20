import { describe, expect, it } from "vitest";
import {
  expression,
  formatModifier,
  natural,
  normalizePool,
  roll,
  rollDie,
  type RandomSource,
} from "./dice";

const sequence = (...values: number[]): RandomSource => {
  let i = 0;
  return () => values[i++];
};

describe("rollDie", () => {
  it("maps random values into [1, sides]", () => {
    expect(rollDie(6, sequence(0))).toBe(1);
    expect(rollDie(6, sequence(5))).toBe(6);
    expect(rollDie(6, sequence(6))).toBe(1);
  });

  it("rejects values in the biased tail", () => {
    // 2^32 is not divisible by 6: values >= 4294967292 must be re-drawn.
    expect(rollDie(6, sequence(0xffffffff, 0xfffffffc, 2))).toBe(3);
  });

  it("stays in range and covers every face with crypto randomness", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rollDie(20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
      seen.add(v);
    }
    expect(seen.size).toBe(20);
  });
});

describe("normalizePool", () => {
  it("merges duplicates, drops empty groups, sorts largest first", () => {
    expect(
      normalizePool([
        { die: 8, count: 1 },
        { die: 4, count: 0 },
        { die: 6, count: 2 },
        { die: 8, count: 2 },
      ]),
    ).toEqual([
      { die: 8, count: 3 },
      { die: 6, count: 2 },
    ]);
  });
});

describe("roll", () => {
  it("rolls a mixed pool and adds the modifier", () => {
    const r = roll(
      { dice: [{ die: 8, count: 1 }, { die: 6, count: 2 }], modifier: -2 },
      sequence(6, 0, 5),
    );
    // sorted: d8 first (7), then d6 (1, 6)
    expect(r.groups).toEqual([
      { die: 8, rolls: [7] },
      { die: 6, rolls: [1, 6] },
    ]);
    expect(r.total).toBe(12);
  });

  it("supports a modifier-only roll", () => {
    expect(roll({ dice: [], modifier: 3 }).total).toBe(3);
  });
});

describe("natural", () => {
  const d20 = (count: number) => ({ die: 20 as const, count });

  it("detects natural 20 / 1 on a single d20", () => {
    expect(natural(roll({ dice: [d20(1)], modifier: 0 }, sequence(19)))).toBe("crit");
    expect(natural(roll({ dice: [d20(1)], modifier: 0 }, sequence(0)))).toBe("fumble");
    expect(natural(roll({ dice: [d20(1)], modifier: 0 }, sequence(9)))).toBeNull();
  });

  it("still detects it with extra dice in the pool (e.g. Bless d4)", () => {
    // sorted pool: d20 rolls first, then d4
    const r = roll({ dice: [{ die: 4, count: 1 }, d20(1)], modifier: 5 }, sequence(19, 2));
    expect(natural(r)).toBe("crit");
  });

  it("ignores pools with several d20s", () => {
    expect(natural(roll({ dice: [d20(2)], modifier: 0 }, sequence(19, 19)))).toBeNull();
  });
});

describe("formatting", () => {
  it("formats modifiers and expressions", () => {
    expect(formatModifier(0)).toBe("+0");
    expect(formatModifier(-3)).toBe("-3");
    expect(expression({ dice: [{ die: 8, count: 2 }], modifier: 0 })).toBe("2d8");
    expect(expression({ dice: [{ die: 6, count: 2 }, { die: 8, count: 1 }], modifier: 3 })).toBe("2d6 + 1d8 + 3"); // requests keep the given order
    expect(expression({ dice: [{ die: 20, count: 1 }], modifier: -2 })).toBe("1d20 − 2");
    expect(expression({ dice: [], modifier: 4 })).toBe("+ 4");
  });

  it("formats a result like its request", () => {
    const r = roll({ dice: [{ die: 6, count: 2 }], modifier: 1 });
    expect(expression(r)).toBe("2d6 + 1");
  });
});
