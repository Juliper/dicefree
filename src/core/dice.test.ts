import { describe, expect, it } from "vitest";
import { expression, formatModifier, natural, roll, rollDie, type RandomSource } from "./dice";

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

describe("roll", () => {
  it("sums dice and modifier", () => {
    const r = roll({ die: 6, count: 3, modifier: -2 }, sequence(0, 1, 5));
    expect(r.rolls).toEqual([1, 2, 6]);
    expect(r.total).toBe(7);
  });
});

describe("natural", () => {
  const d20 = (face: number, count = 1) =>
    roll({ die: 20, count, modifier: 5 }, sequence(face - 1, face - 1));

  it("detects natural 20 and natural 1 on a single d20", () => {
    expect(natural(d20(20))).toBe("crit");
    expect(natural(d20(1))).toBe("fumble");
    expect(natural(d20(10))).toBeNull();
  });

  it("ignores multi-dice rolls", () => {
    expect(natural(d20(20, 2))).toBeNull();
  });
});

describe("formatting", () => {
  it("formats modifiers and expressions", () => {
    expect(formatModifier(0)).toBe("+0");
    expect(formatModifier(-3)).toBe("-3");
    expect(expression({ die: 8, count: 2, modifier: 0 })).toBe("2d8");
    expect(expression({ die: 20, count: 1, modifier: 4 })).toBe("1d20+4");
  });
});
