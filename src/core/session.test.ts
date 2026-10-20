import { describe, expect, it } from "vitest";
import { roll } from "./dice";
import { HISTORY_MAX, adjustPool, emptySession, fromFile, fromStored, makePreset, toFile, toStored, type Session } from "./session";

describe("adjustPool", () => {
  it("adds, increments and removes dice", () => {
    let pool = adjustPool([], 6, 1);
    pool = adjustPool(pool, 20, 1);
    pool = adjustPool(pool, 6, 1);
    expect(pool).toEqual([
      { die: 20, count: 1 },
      { die: 6, count: 2 },
    ]);
    pool = adjustPool(pool, 20, -1);
    expect(pool).toEqual([{ die: 6, count: 2 }]);
  });

  it("clamps to the group limit", () => {
    expect(adjustPool([{ die: 4, count: 50 }], 4, 1)).toEqual([{ die: 4, count: 50 }]);
  });
});

describe("session import/export", () => {
  it("round-trips through JSON", () => {
    const pool = [{ die: 8 as const, count: 1 }, { die: 6 as const, count: 2 }];
    const s: Session = {
      pool,
      modifier: -1,
      mode: "advantage",
      presets: [makePreset("Langschwert", [{ die: 8, count: 1 }], 3)!],
      history: [
        roll({ dice: pool, modifier: -1 }),
        roll({ dice: [{ die: 20, count: 1 }], modifier: 5, mode: "advantage", label: "Angriff" }),
      ],
    };
    expect(fromFile(JSON.parse(JSON.stringify(toFile(s))))).toEqual(s);
  });

  it("rejects foreign files", () => {
    expect(() => fromFile({ hello: "world" })).toThrow();
    expect(() => fromFile(null)).toThrow();
  });

  it("clamps settings and drops malformed entries", () => {
    const good = roll({ dice: [{ die: 20, count: 1 }], modifier: 0 });
    const s = fromFile({
      format: "dicefree",
      version: 2,
      settings: { pool: [{ die: 6, count: 999 }, { die: 7, count: 1 }], modifier: "x" },
      history: [good, { groups: [{ die: 7, rolls: [1] }], total: 1 }, { groups: [] , total: 0 }, { die: 6 }],
    });
    expect(s.pool).toEqual([{ die: 6, count: 50 }]);
    expect(s.modifier).toBe(0);
    expect(s.history).toEqual([good]);
  });

  it("migrates v1 files", () => {
    const s = fromFile({
      format: "dicefree",
      version: 1,
      settings: { count: 3, modifier: 2 },
      history: [{ die: 6, count: 2, modifier: 2, rolls: [3, 4], total: 9, at: "t" }],
    });
    expect(s.pool).toEqual([]);
    expect(s.modifier).toBe(2);
    expect(s.mode).toBe("normal");
    expect(s.presets).toEqual([]);
    expect(s.history).toEqual([{ groups: [{ die: 6, rolls: [3, 4] }], modifier: 2, total: 9, at: "t" }]);
  });

  it("caps history length", () => {
    const entry = roll({ dice: [{ die: 4, count: 1 }], modifier: 0 });
    const s = fromFile({ ...toFile(emptySession()), history: Array(HISTORY_MAX + 10).fill(entry) });
    expect(s.history).toHaveLength(HISTORY_MAX);
  });
});

describe("presets", () => {
  it("normalizes dice, trims the name and clamps the bonus", () => {
    const p = makePreset("  Feuerball  ", [{ die: 6, count: 4 }, { die: 6, count: 4 }], 500)!;
    expect(p.name).toBe("Feuerball");
    expect(p.dice).toEqual([{ die: 6, count: 8 }]);
    expect(p.modifier).toBe(99);
    expect(p.id).toBeTruthy();
  });

  it("refuses empty pools and names", () => {
    expect(makePreset("Nichts", [], 0)).toBeNull();
    expect(makePreset("   ", [{ die: 4, count: 1 }], 0)).toBeNull();
  });

  it("drops invalid presets on import and keeps ids", () => {
    const s = fromFile({
      format: "dicefree",
      version: 3,
      presets: [
        { id: "a", name: "Dolch", dice: [{ die: 4, count: 1 }], modifier: 2 },
        { id: "b", name: "Kaputt", dice: [{ die: 7, count: 1 }] },
        { name: 42, dice: [{ die: 4, count: 1 }] },
      ],
    });
    expect(s.presets).toEqual([{ id: "a", name: "Dolch", dice: [{ die: 4, count: 1 }], modifier: 2 }]);
  });
});

describe("device storage", () => {
  it("keeps settings and presets but not the history", () => {
    const s: Session = {
      pool: [{ die: 20, count: 1 }],
      modifier: 2,
      mode: "disadvantage",
      presets: [makePreset("Dolch", [{ die: 4, count: 1 }], 2)!],
      history: [roll({ dice: [{ die: 6, count: 1 }], modifier: 0 })],
    };
    expect(fromStored(JSON.parse(JSON.stringify(toStored(s))))).toEqual({ ...s, history: [] });
  });

  it("falls back to an empty session on garbage", () => {
    expect(fromStored(null)).toEqual(emptySession());
    expect(fromStored({ format: "other" })).toEqual(emptySession());
  });
});
