import { expression, formatModifier, type Ability, type DiceGroup, type RollKind } from "../core/dice";
import { ABILITY_LABEL } from "../core/effects";

export const KIND_TAB: Record<RollKind, string> = {
  free: "Free",
  attack: "Attack",
  check: "Check",
  save: "Save",
  damage: "Damage",
};

export const KIND_LABEL: Record<RollKind, string> = {
  free: "Roll",
  attack: "Attack",
  check: "Ability Check",
  save: "Saving Throw",
  damage: "Damage",
};

/** "DEX Save", "STR Check", "Saving Throw" – the name of a D20 Test. */
export function testName(kind: RollKind, ability: Ability | undefined): string {
  if (ability && kind === "save") return `${ABILITY_LABEL[ability]} Save`;
  if (ability && kind === "check") return `${ABILITY_LABEL[ability]} Check`;
  return KIND_LABEL[kind];
}

/** "Attack +5", "DEX Save +3", "1d8 + 3" – how a roll is named in tiles and buttons. */
export function describeRoll(kind: RollKind, ability: Ability | undefined, dice: DiceGroup[], modifier: number): string {
  if (kind === "attack" || kind === "check" || kind === "save") return `${testName(kind, ability)} ${formatModifier(modifier)}`;
  return expression({ dice, modifier });
}
