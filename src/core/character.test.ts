import { describe, expect, it } from "vitest";
import {
  abilityMod,
  attackMod,
  attackRoll,
  concentrationDC,
  damageMod,
  damageRoll,
  deathSaveOutcome,
  initiativeMod,
  newAttack,
  newCharacter,
  parseCharacter,
  parseDice,
  passivePerception,
  proficiencyBonus,
  saveMod,
  skillMod,
  spellAttackMod,
  spellSaveDC,
  type Character,
} from "./character";

/** Level 5 wizard-ish: INT 18, DEX 14, CON 13, WIS 12. */
function wizard(): Character {
  const c = newCharacter("Elara");
  c.level = 5;
  c.scores = { str: 8, dex: 14, con: 13, int: 18, wis: 12, cha: 10 };
  c.saves = ["int", "wis"];
  c.skills = { arcana: 2, perception: 1 };
  c.spellAbility = "int";
  return c;
}

describe("basic math", () => {
  it("computes ability modifiers", () => {
    expect([1, 8, 9, 10, 11, 12, 18, 20, 30].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 1, 4, 5, 10]);
  });

  it("computes the proficiency bonus by level", () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
});

describe("derived sheet values", () => {
  const c = wizard();

  it("adds proficiency only to proficient saves", () => {
    expect(saveMod(c, "int")).toBe(7);
    expect(saveMod(c, "con")).toBe(1);
  });

  it("handles proficiency and expertise for skills", () => {
    expect(skillMod(c, "arcana")).toBe(4 + 6); // expertise
    expect(skillMod(c, "perception")).toBe(1 + 3);
    expect(skillMod(c, "athletics")).toBe(-1);
  });

  it("computes initiative and passive perception", () => {
    expect(initiativeMod(c)).toBe(2);
    expect(passivePerception(c)).toBe(14);
  });

  it("computes spell save DC and spell attack", () => {
    expect(spellSaveDC(c)).toBe(8 + 4 + 3);
    expect(spellAttackMod(c)).toBe(7);
    expect(spellSaveDC(newCharacter())).toBeNull();
  });

  it("computes attack and damage bonuses", () => {
    const sword = { ...newAttack(), name: "Rapier", ability: "dex" as const, magic: 1 };
    expect(attackMod(c, sword)).toBe(2 + 3 + 1);
    expect(damageMod(c, sword)).toBe(3);
    expect(damageMod(c, { ...sword, addModToDamage: false })).toBe(1);
    expect(attackMod(c, { ...sword, proficient: false })).toBe(3);
  });
});

describe("rules helpers", () => {
  it("computes the concentration DC", () => {
    expect(concentrationDC(7)).toBe(10);
    expect(concentrationDC(25)).toBe(12);
    expect(concentrationDC(200)).toBe(30);
  });

  it("evaluates death saves", () => {
    expect(deathSaveOutcome(20, 20)).toContain("1 TP");
    expect(deathSaveOutcome(1, 1)).toContain("zwei Fehlschläge");
    expect(deathSaveOutcome(12, 12)).toBe("Erfolg");
    expect(deathSaveOutcome(9, 9)).toBe("Fehlschlag");
    expect(deathSaveOutcome(9, 11)).toBe("Erfolg"); // e.g. with Bless
  });
});

describe("parseDice", () => {
  it("parses common notations", () => {
    expect(parseDice("1d8")).toEqual([{ die: 8, count: 1 }]);
    expect(parseDice(" 2d6 + 1d4 ")).toEqual([
      { die: 6, count: 2 },
      { die: 4, count: 1 },
    ]);
    expect(parseDice("d12")).toEqual([{ die: 12, count: 1 }]);
    expect(parseDice("2W6")).toEqual([{ die: 6, count: 2 }]);
  });

  it("rejects nonsense", () => {
    for (const bad of ["", "abc", "1d7", "0d6", "1d6+3", "100d6"]) expect(parseDice(bad)).toBeNull();
  });
});

describe("sheet rolls", () => {
  it("builds attack and damage rolls", () => {
    const c = wizard();
    const dagger = { ...newAttack(), name: "Dolch", ability: "dex" as const, damage: [{ die: 4 as const, count: 1 }], damageType: "Stich" };
    expect(attackRoll(c, dagger)).toMatchObject({ kind: "attack", modifier: 5, label: "Dolch" });
    expect(damageRoll(c, dagger)).toMatchObject({ kind: "damage", modifier: 2, label: "Dolch (Stich)", dice: [{ die: 4, count: 1 }] });
  });
});

describe("parseCharacter", () => {
  it("round-trips through JSON", () => {
    const c = wizard();
    c.armorClass = 12;
    c.attacks = [newAttack()];
    expect(parseCharacter(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it("clamps and drops invalid values", () => {
    const c = parseCharacter({
      name: "  Bob  ",
      level: 99,
      scores: { str: 50, dex: "x" },
      saves: ["dex", "luck"],
      skills: { stealth: 2, arcana: 5, flying: 1 },
      spellAbility: "luck",
      attacks: [{ name: "Axt", damage: [{ die: 7, count: 1 }] }, "nope"],
    })!;
    expect(c.name).toBe("Bob");
    expect(c.level).toBe(20);
    expect(c.scores.str).toBe(30);
    expect(c.scores.dex).toBe(10);
    expect(c.saves).toEqual(["dex"]);
    expect(c.skills).toEqual({ stealth: 2 });
    expect(c.spellAbility).toBeUndefined();
    expect(c.attacks).toHaveLength(1);
    expect(c.attacks[0].damage).toEqual([{ die: 4, count: 1 }]);
  });

  it("rejects non-characters", () => {
    expect(parseCharacter(null)).toBeNull();
    expect(parseCharacter({ level: 3 })).toBeNull();
  });
});
