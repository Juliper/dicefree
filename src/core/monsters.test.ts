import { describe, expect, it } from "vitest";
import {
  crLabel,
  damageText,
  hitPointsRoll,
  monsterAttackRoll,
  monsterDamageRoll,
  monsterSave,
  parseDamageDice,
  parseMonster,
  parseStoredMonster,
  rechargeOutcome,
  rechargeRoll,
} from "./monsters";
import { roll, type RandomSource } from "./dice";
import { buildRoll } from "./effects";

// Trimmed from https://www.dnd5eapi.co/api/2024/monsters/adult-red-dragon (SRD 5.2, CC-BY-4.0).
const dragon = {
  index: "adult-red-dragon",
  name: "Adult Red Dragon",
  size: "Huge",
  type: "dragon",
  armor_class: [{ value: 19, armor: [] }],
  hit_points: 256,
  hit_dice: "19d12",
  hit_points_roll: "19d12+133",
  speed: { walk: "40 ft.", climb: "40 ft.", fly: "80 ft." },
  strength: 27,
  dexterity: 10,
  constitution: 25,
  intelligence: 16,
  wisdom: 13,
  charisma: 23,
  proficiencies: [
    { value: 6, proficiency: { index: "saving-throw-dex", name: "Saving Throw: DEX" } },
    { value: 13, proficiency: { index: "skill-perception", name: "Skill: Perception" } },
  ],
  damage_immunities: ["fire"],
  damage_resistances: [],
  damage_vulnerabilities: [],
  condition_immunities: [],
  senses: { blindsight: "60 ft.", darkvision: "120 ft.", passive_perception: 23 },
  languages: "Common, Draconic",
  challenge_rating: 17,
  xp: 18000,
  actions: [
    { name: "Multiattack", desc: "The dragon makes three Rend attacks.", damage: [], actions: [], attacks: [] },
    {
      name: "Rend",
      desc: "Melee Attack Roll: +14, reach 10 ft. Hit: 13 (1d10 + 8) Slashing damage plus 5 (2d4) Fire damage.",
      attack_bonus: 14,
      damage: [
        { damage_type: { index: "slashing" }, damage_dice: "1d10+8" },
        { damage_type: { index: "fire" }, damage_dice: "2d4" },
      ],
    },
    {
      name: "Fire Breath",
      desc: "Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage. Success: Half damage.",
      dc: { dc_type: { index: "dex" }, dc_value: 21, success_type: "half" },
      damage: [{ damage_type: { index: "fire" }, damage_dice: "17d6" }],
      usage: { type: "recharge on roll", dice: "1d6", min_value: 5, rest_types: [] },
    },
    {
      name: "Spellcasting",
      desc: "The dragon casts one of the following spells...",
      damage: [],
      spellcasting: { ability: { index: "cha" }, dc: 20, modifier: 12, spells: [{ name: "Command" }, { name: "Fireball" }] },
    },
  ],
  legendary_actions: [{ name: "Pounce", desc: "The dragon moves up to half its Speed, and it makes one Rend attack.", damage: [] }],
};

const sequence = (...values: number[]): RandomSource => {
  let i = 0;
  return () => values[i++];
};

describe("parseDamageDice", () => {
  it("parses dice with bonus", () => {
    expect(parseDamageDice("1d10+8")).toEqual({ dice: [{ die: 10, count: 1 }], bonus: 8 });
    expect(parseDamageDice("2d6")).toEqual({ dice: [{ die: 6, count: 2 }], bonus: 0 });
    expect(parseDamageDice("1d4-1")).toEqual({ dice: [{ die: 4, count: 1 }], bonus: -1 });
    expect(parseDamageDice("19d12+133")).toEqual({ dice: [{ die: 12, count: 19 }], bonus: 133 });
    expect(parseDamageDice("7")).toEqual({ dice: [], bonus: 7 });
  });

  it("rejects nonsense", () => {
    for (const bad of ["", "abc", "1d7", "1d6+x", "-1d6"]) expect(parseDamageDice(bad)).toBeNull();
  });
});

describe("parseMonster", () => {
  const m = parseMonster(dragon)!;

  it("reads the statblock", () => {
    expect(m).toMatchObject({ name: "Adult Red Dragon", ac: 19, hp: 256, hitDice: "19d12+133", cr: 17, xp: 18000 });
    expect(m.speed).toBe("40 ft., climb 40 ft., fly 80 ft.");
    expect(m.senses).toBe("blindsight 60 ft., darkvision 120 ft.");
    expect(m.immunities).toEqual(["fire"]);
    expect(m.skills).toEqual([{ name: "Perception", value: 13 }]);
  });

  it("uses listed save bonuses and falls back to the modifier", () => {
    expect(monsterSave(m, "dex")).toBe(6);
    expect(monsterSave(m, "con")).toBe(7);
  });

  it("reads attacks, DC abilities, recharge and spellcasting", () => {
    const rend = m.actions.find((a) => a.name === "Rend")!;
    expect(rend.attackBonus).toBe(14);
    expect(damageText(rend.damage)).toBe("1d10 + 8 Hieb + 2d4 Feuer");
    const breath = m.actions.find((a) => a.name === "Fire Breath")!;
    expect(breath.dc).toEqual({ ability: "dex", value: 21, success: "half" });
    expect(breath.recharge).toBe(5);
    expect(m.spellcasting).toEqual({ ability: "cha", dc: 20, attack: 12, spells: ["Command", "Fireball"] });
    expect(m.actions.find((a) => a.name === "Pounce")!.section).toBe("legendary");
  });

  it("survives storing on the device", () => {
    expect(parseStoredMonster(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(parseStoredMonster({ name: "x" })).toBeNull();
  });

  it("rejects non-monsters", () => {
    expect(parseMonster({ error: "Not found" })).toBeNull();
  });
});

describe("monster rolls", () => {
  const m = parseMonster(dragon)!;
  const rend = m.actions.find((a) => a.name === "Rend")!;
  const breath = m.actions.find((a) => a.name === "Fire Breath")!;

  it("rolls attacks with the listed bonus", () => {
    expect(monsterAttackRoll("Drache: Rend", rend)).toMatchObject({ kind: "attack", modifier: 14 });
  });

  it("rolls every damage type and shows them separately", () => {
    const req = monsterDamageRoll("Rend", rend)!;
    const r = roll(buildRoll(req, {}, "normal"), sequence(4, 1, 2)); // d10 → 5, d4s → 2, 3
    expect(r.total).toBe(5 + 8 + 2 + 3);
    expect(r.groups).toEqual([
      { die: 10, rolls: [5] },
      { die: 4, rolls: [2, 3], source: "Feuer" },
    ]);
  });

  it("doubles every damage type's dice on a crit", () => {
    const r = roll(buildRoll({ ...monsterDamageRoll("Rend", rend)!, crit: true }, {}, "normal"), sequence(0, 0, 0, 0, 0, 0));
    expect(r.groups.map((g) => g.rolls.length)).toEqual([2, 4]);
    expect(r.total).toBe(2 + 8 + 4);
  });

  it("notes the save for DC abilities", () => {
    expect(monsterDamageRoll("Breath", breath)!.notes).toEqual(["GES-Rettungswurf SG 21 – bei Erfolg halber Schaden"]);
  });

  it("rolls recharge and hit points", () => {
    expect(rechargeRoll("Breath", breath)).toMatchObject({ dice: [{ die: 6, count: 1 }], rechargeAt: 5, label: "Breath: Aufladung 5–6" });
    expect([rechargeOutcome(4, 5), rechargeOutcome(5, 5), rechargeOutcome(6, 5)]).toEqual(["Nicht aufgeladen", "Aufgeladen!", "Aufgeladen!"]);
    expect(hitPointsRoll(m)).toMatchObject({ dice: [{ die: 12, count: 19 }], modifier: 133 });
  });

  it("formats challenge ratings", () => {
    expect([0.125, 0.25, 0.5, 1, 17].map(crLabel)).toEqual(["1/8", "1/4", "1/2", "1", "17"]);
  });
});
