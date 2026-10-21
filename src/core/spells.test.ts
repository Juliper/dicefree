import { describe, expect, it } from "vitest";
import { amountAt, diceIn, parseSpell, parseStoredSpell } from "./spells";
import { newCharacter, parseCharacter, spellDamageRoll, spellHealRoll, spellAttackRoll } from "./character";

// Trimmed responses from https://www.dnd5eapi.co/api/2024/spells/{index} (SRD 5.2, CC-BY-4.0).
const fireball = {
  index: "fireball",
  name: "Fireball",
  level: 3,
  school: { index: "evocation", name: "Evocation" },
  casting_time: "Action",
  range: "150 feet",
  duration: "Instantaneous",
  concentration: false,
  ritual: false,
  damage: { damage_type: { index: "fire", name: "Fire" }, damage_at_slot_level: { "3": "8d6" } },
  description:
    "A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion. Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save or half as much damage on a successful one.",
  higher_level: "The damage increases by 1d6 for each spell slot level above 3.",
};

const fireBolt = {
  index: "fire-bolt",
  name: "Fire Bolt",
  level: 0,
  attack_type: "ranged",
  concentration: false,
  ritual: false,
  damage: { damage_type: { index: "fire" }, damage_at_slot_level: { "0": "1d10" } },
  description:
    "You hurl a mote of fire at a creature or an object within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 Fire damage.\n  Cantrip Upgrade. The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).",
};

const shatter = {
  index: "shatter",
  name: "Shatter",
  level: 2,
  damage: { damage_type: { index: "thunder" }, damage_at_slot_level: { "2": "3d8" } },
  description:
    "Each creature in a 10-foot-radius Sphere centered there makes a Constitution saving throw, taking 3d8 Thunder damage on a failed save or half as much damage on a successful one. Using a Higher-Level Spell Slot. The damage increases by 1d8 for each spell slot level above 2.",
};

const cureWounds = {
  index: "cure-wounds",
  name: "Cure Wounds",
  level: 1,
  concentration: false,
  description:
    "A creature you touch regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier. Using a Higher-Level Spell Slot. The healing increases by 2d8 for each spell slot level above 1.",
};

const holdPerson = {
  index: "hold-person",
  name: "Hold Person",
  level: 2,
  concentration: true,
  description: "Choose a Humanoid that you can see within range. The target must succeed on a Wisdom saving throw or have the Paralyzed condition for the duration.",
};

describe("diceIn", () => {
  it("extracts dice groups", () => {
    expect(diceIn("8d6")).toEqual([{ die: 6, count: 8 }]);
    expect(diceIn("1d4 + 1")).toEqual([{ die: 4, count: 1 }]);
    expect(diceIn("no dice")).toEqual([]);
  });
});

describe("parseSpell", () => {
  it("reads a save-for-half damage spell with upcasting", () => {
    const s = parseSpell(fireball)!;
    expect(s).toMatchObject({ name: "Fireball", level: 3, school: "Evocation", range: "150 feet" });
    expect(s.save).toEqual({ ability: "dex", onSuccess: "half" });
    expect(s.attack).toBeUndefined();
    expect(s.damage).toEqual({ base: [{ die: 6, count: 8 }], type: "fire", perSlot: [{ die: 6, count: 1 }] });
  });

  it("reads an attack cantrip with scaling", () => {
    const s = parseSpell(fireBolt)!;
    expect(s.attack).toBe("ranged");
    expect(s.save).toBeUndefined();
    expect(s.damage?.cantripTiers).toEqual([[{ die: 10, count: 2 }], [{ die: 10, count: 3 }], [{ die: 10, count: 4 }]]);
  });

  it("finds upcasting in the description when higher_level is missing", () => {
    expect(parseSpell(shatter)!.damage?.perSlot).toEqual([{ die: 8, count: 1 }]);
    expect(parseSpell(shatter)!.save).toEqual({ ability: "con", onSuccess: "half" });
  });

  it("reads healing with the spellcasting modifier", () => {
    const s = parseSpell(cureWounds)!;
    expect(s.heal).toEqual({ base: [{ die: 8, count: 2 }], addMod: true, perSlot: [{ die: 8, count: 2 }] });
    expect(s.damage).toBeUndefined();
  });

  it("reads healing phrased as 'regain 2d8 Hit Points'", () => {
    const s = parseSpell({
      index: "prayer-of-healing",
      name: "Prayer of Healing",
      level: 2,
      description:
        "Up to five creatures of your choice who remain within range for the spell's entire casting gain the benefits of a Short Rest and also regain 2d8 Hit Points. Using a Higher-Level Spell Slot. The healing increases by 1d8 for each spell slot level above 2.",
    })!;
    expect(s.heal).toEqual({ base: [{ die: 8, count: 2 }], addMod: false, perSlot: [{ die: 8, count: 1 }] });
  });

  it("reads a save without damage", () => {
    const s = parseSpell(holdPerson)!;
    expect(s.save).toEqual({ ability: "wis" });
    expect(s.concentration).toBe(true);
  });

  it("rejects non-spells", () => {
    expect(parseSpell(null)).toBeNull();
    expect(parseSpell({ error: "Not found" })).toBeNull();
  });
});

describe("amountAt", () => {
  it("upcasts leveled spells", () => {
    const d = parseSpell(fireball)!.damage!;
    expect(amountAt(d, 3, 3, 5)).toEqual([{ die: 6, count: 8 }]);
    expect(amountAt(d, 3, 5, 5)).toEqual([{ die: 6, count: 10 }]);
  });

  it("scales cantrips by character level", () => {
    const d = parseSpell(fireBolt)!.damage!;
    expect([1, 4, 5, 10, 11, 17, 20].map((lvl) => amountAt(d, 0, 0, lvl)[0].count)).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });
});

describe("spell rolls from a character", () => {
  const c = newCharacter("Elara");
  c.level = 5;
  c.scores.wis = 16;
  c.spellAbility = "wis";

  it("rolls spell attacks with the spell attack bonus", () => {
    expect(spellAttackRoll(c, parseSpell(fireBolt)!)).toMatchObject({ kind: "attack", modifier: 6, label: "Fire Bolt" });
  });

  it("rolls damage with the save and DC in the notes", () => {
    const r = spellDamageRoll(c, parseSpell(fireball)!, 4)!;
    expect(r.dice).toEqual([{ die: 6, count: 9 }]);
    expect(r.label).toBe("Fireball (level 4) (Fire)");
    expect(r.notes).toEqual(["Target: DEX saving throw vs. DC 14 – half damage on a success"]);
  });

  it("rolls healing plus the casting modifier", () => {
    const r = spellHealRoll(c, parseSpell(cureWounds)!, 2)!;
    expect(r.dice).toEqual([{ die: 8, count: 4 }]);
    expect(r.modifier).toBe(3);
  });

  it("keeps spells when a character is stored and restored", () => {
    const withSpells = { ...c, spells: [parseSpell(fireball)!, parseSpell(cureWounds)!, parseSpell(fireBolt)!] };
    expect(parseCharacter(JSON.parse(JSON.stringify(withSpells)))).toEqual(withSpells);
  });

  it("drops broken stored spells", () => {
    expect(parseStoredSpell({ name: "x" })).toBeNull();
    expect(parseStoredSpell({ index: "a", name: "A", level: 1, save: { ability: "luck" } })!.save).toBeUndefined();
  });
});
