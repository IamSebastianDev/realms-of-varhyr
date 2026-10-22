import type { CardInstance } from "./index";

/** Each player's row uses these permanent deployment slots, left to right. */
export const battlefieldPositions = [
  "Left Flank",
  "Left Wing",
  "Center",
  "Right Wing",
  "Right Flank",
] as const;
export type BattlefieldPosition = (typeof battlefieldPositions)[number];
export function positionSlot(position: BattlefieldPosition): number {
  return battlefieldPositions.indexOf(position);
}
export function positionName(slot: number | null): BattlefieldPosition | undefined {
  return slot === null ? undefined : battlefieldPositions[slot];
}
/** Empty positions never close the gap, and opposing rows are not adjacent. */
export function areAdjacent(source: CardInstance, target: CardInstance): boolean {
  return (
    source.zone === "board" &&
    target.zone === "board" &&
    source.controller === target.controller &&
    source.slot !== null &&
    target.slot !== null &&
    Math.abs(source.slot - target.slot) === 1
  );
}
