import { describe, expect, it } from "vitest";
import {
  emptyTracker,
  initiativeOrder,
  nextTurn,
  parseTracker,
  previousTurn,
  pruneTracker,
  setInitiative,
  type InitEntry,
} from "./initiative";

const e = (id: string, init: number | null, down = false, kind: InitEntry["kind"] = "monster"): InitEntry => ({
  id,
  name: id,
  kind,
  init,
  down,
});

describe("initiativeOrder", () => {
  it("sorts by initiative, keeps insertion order on ties, puts unset last", () => {
    const order = initiativeOrder([e("a", 12), e("b", null), e("c", 18), e("d", 12), e("e", null)]);
    expect(order.map((x) => x.id)).toEqual(["c", "a", "d", "b", "e"]);
  });
});

describe("turns", () => {
  const order = initiativeOrder([e("aria", 18, false, "player"), e("goblin", 12), e("dragon", 15), e("borin", 5, false, "player")]);
  // aria 18, dragon 15, goblin 12, borin 5

  it("starts with the highest initiative in round 1", () => {
    expect(nextTurn(emptyTracker(), order)).toMatchObject({ round: 1, turnId: "aria" });
  });

  it("advances and wraps into a new round", () => {
    let t = nextTurn(emptyTracker(), order);
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      seen.push(`${t.round}:${t.turnId}`);
      t = nextTurn(t, order);
    }
    expect(seen).toEqual(["1:aria", "1:dragon", "1:goblin", "1:borin", "2:aria"]);
  });

  it("skips defeated monsters and entries without a value", () => {
    const withDown = initiativeOrder([e("aria", 18), e("dragon", 15, true), e("goblin", 12), e("late", null)]);
    const t = nextTurn({ values: {}, round: 1, turnId: "aria" }, withDown);
    expect(t.turnId).toBe("goblin");
    expect(nextTurn(t, withDown)).toMatchObject({ round: 2, turnId: "aria" });
  });

  it("steps back, also across rounds", () => {
    expect(previousTurn({ values: {}, round: 2, turnId: "dragon" }, order)).toMatchObject({ round: 2, turnId: "aria" });
    expect(previousTurn({ values: {}, round: 2, turnId: "aria" }, order)).toMatchObject({ round: 1, turnId: "borin" });
    expect(previousTurn({ values: {}, round: 1, turnId: "aria" }, order)).toMatchObject({ round: 1, turnId: "aria" });
  });

  it("falls back to the top of the round if the current entry is gone", () => {
    // The app advances before removing the active participant; this is only the safety net.
    const without = order.filter((x) => x.id !== "dragon");
    expect(nextTurn({ values: {}, round: 1, turnId: "dragon" }, without)).toMatchObject({ round: 1, turnId: "aria" });
  });

  it("does nothing without anyone who can act", () => {
    const t = emptyTracker();
    expect(nextTurn(t, [e("x", null)])).toBe(t);
  });
});

describe("tracker values", () => {
  it("sets, clamps and clears values", () => {
    let t = setInitiative(emptyTracker(), "a", 17.8);
    expect(t.values).toEqual({ a: 17 });
    t = setInitiative(t, "b", 999);
    expect(t.values.b).toBe(50);
    t = setInitiative(t, "a", null);
    expect(t.values).toEqual({ b: 50 });
  });

  it("prunes removed participants and resets the turn if needed", () => {
    const t = { values: { a: 10, b: 5 }, round: 3, turnId: "b" };
    expect(pruneTracker(t, new Set(["a"]))).toEqual({ values: { a: 10 }, round: 0 });
    expect(pruneTracker(t, new Set(["a", "b"]))).toEqual(t);
  });

  it("parses stored trackers tolerantly", () => {
    const ids = new Set(["a", "b"]);
    expect(parseTracker({ values: { a: 12, b: "x", z: 3 }, round: 2, turnId: "a" }, ids)).toEqual({
      values: { a: 12 },
      round: 2,
      turnId: "a",
    });
    expect(parseTracker({ values: {}, round: 4, turnId: "gone" }, ids)).toEqual({ values: {}, round: 0 });
    expect(parseTracker(null, ids)).toEqual(emptyTracker());
  });
});
