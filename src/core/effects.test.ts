import { describe, expect, it } from "vitest";
import { roll, type RandomSource } from "./dice";
import { applyEffects, buildRoll, toggleEffect } from "./effects";

const sequence = (...values: number[]): RandomSource => {
  let i = 0;
  return () => values[i++];
};

describe("applyEffects", () => {
  it("adds Bless to attacks and saves but not to checks", () => {
    expect(applyEffects({ kind: "attack" }, { bless: 1 }).bonusDice).toEqual([{ source: "Segnen", die: 4, count: 1, sign: 1 }]);
    expect(applyEffects({ kind: "save", ability: "wis" }, { bless: 1 }).bonusDice).toHaveLength(1);
    expect(applyEffects({ kind: "check" }, { bless: 1 }).bonusDice).toEqual([]);
  });

  it("subtracts Bane", () => {
    expect(applyEffects({ kind: "attack" }, { bane: 1 }).bonusDice[0].sign).toBe(-1);
  });

  it("applies exhaustion per level to all D20 Tests", () => {
    expect(applyEffects({ kind: "check" }, { exhaustion: 3 }).flats).toEqual([{ source: "Erschöpfung 3", value: -6 }]);
  });

  it("gives disadvantage with the reason", () => {
    const a = applyEffects({ kind: "attack" }, { poisoned: 1, prone: 1 });
    expect(a.mode).toBe("disadvantage");
    expect(a.notes).toEqual(["Nachteil durch Vergiftet, Liegend"]);
  });

  it("cancels advantage and disadvantage regardless of how many sources", () => {
    const a = applyEffects({ kind: "attack" }, { poisoned: 1, prone: 1, invisible: 1 });
    expect(a.mode).toBe("normal");
    expect(a.notes[0]).toContain("heben sich auf");
  });

  it("treats the manual choice as one more source", () => {
    expect(applyEffects({ kind: "attack" }, {}, "advantage")).toMatchObject({ mode: "advantage", notes: [] });
    const both = applyEffects({ kind: "attack" }, { poisoned: 1 }, "advantage");
    expect(both.mode).toBe("normal");
    expect(both.notes).toEqual(["Vorteil (deine Wahl) und Nachteil (Vergiftet) heben sich auf"]);
    expect(applyEffects({ kind: "attack" }, { invisible: 1 }, "advantage").notes).toEqual([
      "Vorteil durch deine Wahl, Unsichtbar",
    ]);
  });

  it("respects the ability for saves", () => {
    expect(applyEffects({ kind: "save", ability: "dex" }, { restrained: 1 }).mode).toBe("disadvantage");
    expect(applyEffects({ kind: "save", ability: "wis" }, { restrained: 1 }).mode).toBe("normal");
    expect(applyEffects({ kind: "save", ability: "dex" }, { "cover-half": 1 }).flats[0].value).toBe(2);
    expect(applyEffects({ kind: "save", ability: "str" }, { paralyzed: 1 }).autoFail).toBe(true);
    expect(applyEffects({ kind: "save", ability: "con" }, { paralyzed: 1 }).autoFail).toBe(false);
  });

  it("ignores effects for free rolls and damage", () => {
    expect(applyEffects({ kind: "damage" }, { bless: 1, poisoned: 1, exhaustion: 2 })).toMatchObject({
      bonusDice: [],
      flats: [],
      mode: "normal",
    });
  });
});

describe("consumable effects", () => {
  it("reports Help as used up when it applied", () => {
    expect(buildRoll({ kind: "attack", dice: [], modifier: 0 }, { help: 1 }, "normal").consumed).toEqual(["help"]);
    expect(buildRoll({ kind: "save", dice: [], modifier: 0 }, { help: 1 }, "normal").consumed).toEqual([]);
  });
});

describe("toggleEffect", () => {
  it("toggles on/off effects and cycles levelled ones", () => {
    expect(toggleEffect({}, "bless")).toEqual({ bless: 1 });
    expect(toggleEffect({ bless: 1 }, "bless")).toEqual({});
    let e = {};
    for (let i = 0; i < 5; i++) e = toggleEffect(e, "exhaustion");
    expect(e).toEqual({ exhaustion: 5 });
    expect(toggleEffect(e, "exhaustion")).toEqual({});
  });
});

describe("buildRoll + roll", () => {
  it("rolls an attack as 1d20 + bonus + Bless − exhaustion", () => {
    const req = buildRoll({ kind: "attack", dice: [{ die: 6, count: 3 }], modifier: 5 }, { bless: 1, exhaustion: 1 }, "normal");
    // d20 → 15, d4 → 3
    const r = roll(req, sequence(14, 2));
    expect(r.groups).toEqual([
      { die: 20, rolls: [15] },
      { die: 4, rolls: [3], source: "Segnen" },
    ]);
    expect(r.flats).toEqual([{ source: "Erschöpfung 1", value: -2 }]);
    expect(r.total).toBe(15 + 5 + 3 - 2);
    expect(r.kind).toBe("attack");
  });

  it("subtracts Bane dice from the total", () => {
    const r = roll(buildRoll({ kind: "save", ability: "wis", dice: [], modifier: 2 }, { bane: 1 }, "normal"), sequence(9, 3));
    expect(r.total).toBe(10 + 2 - 4);
  });

  it("uses effect-driven advantage on the d20", () => {
    const r = roll(buildRoll({ kind: "attack", dice: [], modifier: 0 }, { invisible: 1 }, "normal"), sequence(2, 17));
    expect(r.mode).toBe("advantage");
    expect(r.groups[0]).toEqual({ die: 20, rolls: [18], dropped: [3] });
    expect(r.notes).toEqual(["Vorteil durch Unsichtbar"]);
  });

  it("doubles damage dice on a crit but not the modifier", () => {
    const req = buildRoll({ kind: "damage", dice: [{ die: 8, count: 1 }], modifier: 3, crit: true }, { bless: 1 }, "advantage");
    const r = roll(req, sequence(4, 6));
    expect(r.groups).toEqual([{ die: 8, rolls: [5, 7] }]);
    expect(r.total).toBe(15);
    expect(r.mode).toBeUndefined();
    expect(r.crit).toBe(true);
  });

  it("keeps the manual mode for free rolls", () => {
    const r = roll(buildRoll({ kind: "free", dice: [{ die: 20, count: 1 }], modifier: 0 }, { poisoned: 1 }, "advantage"), sequence(0, 9));
    expect(r.mode).toBe("advantage");
    expect(r.notes).toBeUndefined();
  });
});
