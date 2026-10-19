import { describe, expect, it } from "vitest";
import { roll } from "./dice";
import { HISTORY_MAX, emptySession, fromFile, toFile } from "./session";

describe("session import/export", () => {
  it("round-trips through JSON", () => {
    const s = { count: 2, modifier: -1, history: [roll({ die: 8, count: 2, modifier: -1 })] };
    expect(fromFile(JSON.parse(JSON.stringify(toFile(s))))).toEqual(s);
  });

  it("rejects foreign files", () => {
    expect(() => fromFile({ hello: "world" })).toThrow();
    expect(() => fromFile(null)).toThrow();
  });

  it("clamps settings and drops malformed entries", () => {
    const good = roll({ die: 20, count: 1, modifier: 0 });
    const s = fromFile({
      format: "dicefree",
      settings: { count: 999, modifier: "x" },
      history: [good, { die: 7, count: 1, modifier: 0, rolls: [1], total: 1 }, { die: 6 }],
    });
    expect(s.count).toBe(50);
    expect(s.modifier).toBe(0);
    expect(s.history).toEqual([good]);
  });

  it("caps history length", () => {
    const entry = roll({ die: 4, count: 1, modifier: 0 });
    const s = fromFile({ ...toFile(emptySession()), history: Array(HISTORY_MAX + 10).fill(entry) });
    expect(s.history).toHaveLength(HISTORY_MAX);
  });
});
