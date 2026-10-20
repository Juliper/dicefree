import { expression, formatModifier, type Ability, type DiceGroup, type RollKind } from "../core/dice";
import { ABILITY_LABEL } from "../core/effects";

export const KIND_TAB: Record<RollKind, string> = {
  free: "Frei",
  attack: "Angriff",
  check: "Attribut",
  save: "Rettung",
  damage: "Schaden",
};

export const KIND_LABEL: Record<RollKind, string> = {
  free: "Wurf",
  attack: "Angriff",
  check: "Attributswurf",
  save: "Rettungswurf",
  damage: "Schaden",
};

/** "Angriff +5", "GES-Rettungswurf +3", "1d8 + 3" – how a roll is named in tiles and buttons. */
export function describeRoll(kind: RollKind, ability: Ability | undefined, dice: DiceGroup[], modifier: number): string {
  if (kind === "attack") return `Angriff ${formatModifier(modifier)}`;
  if (kind === "check" || kind === "save") {
    const prefix = ability ? `${ABILITY_LABEL[ability]}-` : "";
    return `${prefix}${KIND_LABEL[kind]} ${formatModifier(modifier)}`;
  }
  return expression({ dice, modifier });
}
