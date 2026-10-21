import { describe, expect, it } from "vitest";
import { roll } from "./dice";
import { newCharacter } from "./character";
import { addCombatant, removeCombatant } from "./session";
import type { Monster } from "./monsters";
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
      ...emptySession(),
      kind: "damage",
      crit: true,
      effects: { bless: 1, exhaustion: 2 },
      pool,
      modifier: -1,
      mode: "advantage",
      presets: [makePreset({ name: "Langschwert", dice: [{ die: 8, count: 1 }], modifier: 3 })!],
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
    const p = makePreset({ name: "  Feuerball  ", dice: [{ die: 6, count: 4 }, { die: 6, count: 4 }], modifier: 500 })!;
    expect(p.name).toBe("Feuerball");
    expect(p.dice).toEqual([{ die: 6, count: 8 }]);
    expect(p.modifier).toBe(99);
    expect(p.id).toBeTruthy();
  });

  it("refuses empty pools and names", () => {
    expect(makePreset({ name: "Nichts", dice: [], modifier: 0 })).toBeNull();
    expect(makePreset({ name: "   ", dice: [{ die: 4, count: 1 }], modifier: 0 })).toBeNull();
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
    expect(s.presets).toEqual([{ id: "a", name: "Dolch", kind: "free", dice: [{ die: 4, count: 1 }], modifier: 2 }]);
  });
});

describe("device storage", () => {
  it("keeps settings and presets but not the history", () => {
    const s: Session = {
      ...emptySession(),
      kind: "save",
      ability: "dex",
      effects: { poisoned: 1 },
      pool: [{ die: 20, count: 1 }],
      modifier: 2,
      mode: "disadvantage",
      presets: [makePreset({ name: "Dolch", dice: [{ die: 4, count: 1 }], modifier: 2 })!],
      history: [roll({ dice: [{ die: 6, count: 1 }], modifier: 0 })],
    };
    expect(fromStored(JSON.parse(JSON.stringify(toStored(s))))).toEqual({ ...s, history: [] });
  });

  it("falls back to an empty session on garbage", () => {
    expect(fromStored(null)).toEqual(emptySession());
    expect(fromStored({ format: "other" })).toEqual(emptySession());
  });
});

describe("presets with roll kinds", () => {
  it("forces 1d20 for D20 Tests and keeps the ability for checks/saves", () => {
    const p = makePreset({ name: "GES-Rettung", kind: "save", ability: "dex", dice: [{ die: 6, count: 3 }], modifier: 4 })!;
    expect(p.dice).toEqual([{ die: 20, count: 1 }]);
    expect(p.ability).toBe("dex");
    const a = makePreset({ name: "Angriff", kind: "attack", ability: "str", dice: [], modifier: 5 })!;
    expect(a.dice).toEqual([{ die: 20, count: 1 }]);
    expect(a.ability).toBeUndefined();
  });

  it("drops unknown effects and clamps effect levels on import", () => {
    const s = fromFile({ format: "dicefree", settings: { effects: { bless: 1, exhaustion: 9, nonsense: 1, poisoned: 0 } } });
    expect(s.effects).toEqual({ bless: 1, exhaustion: 5 });
  });
});

describe("characters in the session", () => {
  it("round-trips characters and keeps the active one", () => {
    const a = newCharacter("Aria");
    const b = newCharacter("Borin");
    const s: Session = { ...emptySession(), view: "character", characters: [a, b], activeCharacterId: b.id };
    const back = fromStored(JSON.parse(JSON.stringify(toStored(s))));
    expect(back.characters).toEqual([a, b]);
    expect(back.activeCharacterId).toBe(b.id);
    expect(back.view).toBe("character");
  });

  it("falls back to the first character when the active id is unknown", () => {
    const a = newCharacter("Aria");
    const s = fromFile({ format: "dicefree", settings: { activeCharacterId: "gone" }, characters: [a, { nope: 1 }] });
    expect(s.characters).toEqual([a]);
    expect(s.activeCharacterId).toBe(a.id);
  });
});

describe("encounter", () => {
  const goblin = {
    index: "goblin-warrior", name: "Goblin Warrior", size: "Small", type: "fey", cr: 0.25, xp: 50, ac: 15, hp: 10,
    hitDice: "3d6", speed: "30 ft.", scores: { str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8 }, saves: {}, skills: [],
    senses: "", languages: "", resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [], actions: [],
  } satisfies Monster;

  it("numbers duplicates and shares the statblock", () => {
    let s = addCombatant({ bestiary: [], encounter: [] }, goblin);
    s = addCombatant(s, goblin);
    expect(s.encounter.map((c) => c.label)).toEqual(["Goblin Warrior", "Goblin Warrior 2"]);
    expect(s.bestiary).toHaveLength(1);
    expect(s.encounter[1]).toMatchObject({ hp: 10, maxHp: 10, effects: {} });
  });

  it("forgets unused statblocks on removal", () => {
    let s = addCombatant({ bestiary: [], encounter: [] }, goblin);
    s = removeCombatant(s, s.encounter[0].id);
    expect(s).toEqual({ bestiary: [], encounter: [] });
  });

  it("round-trips through storage and drops combatants without statblock", () => {
    const enc = addCombatant({ bestiary: [], encounter: [] }, goblin);
    enc.encounter[0].hp = 3;
    enc.encounter[0].effects = { poisoned: 1 };
    const s: Session = { ...emptySession(), view: "dm", ...enc };
    const back = fromStored(JSON.parse(JSON.stringify(toStored(s))));
    expect(back.view).toBe("dm");
    expect(back.encounter).toEqual(enc.encounter);
    expect(back.bestiary).toEqual([goblin]);
    const orphan = fromFile({ format: "dicefree", bestiary: [], encounter: enc.encounter });
    expect(orphan.encounter).toEqual([]);
  });
});

describe("party and initiative tracker", () => {
  it("round-trips the party and tracker, dropping values of unknown participants", () => {
    const s: Session = {
      ...emptySession(),
      party: [{ id: "p1", name: "Aria" }],
      tracker: { values: { p1: 17, ghost: 3 }, round: 2, turnId: "p1" },
    };
    const back = fromStored(JSON.parse(JSON.stringify(toStored(s))));
    expect(back.party).toEqual([{ id: "p1", name: "Aria" }]);
    expect(back.tracker).toEqual({ values: { p1: 17 }, round: 2, turnId: "p1" });
  });
});
