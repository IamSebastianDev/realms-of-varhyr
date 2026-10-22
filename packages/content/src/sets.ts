import raw from "./sets.json";
import type { SetDefinition } from "./setDefinition";
export type { SetDefinition } from "./setDefinition";
/** Generated from assets/sets/*.json. Artwork choices remain independent of a card's set. */
export const setDefinitions: readonly SetDefinition[] = raw as SetDefinition[];
export const setInfo: Record<string, SetDefinition> = Object.fromEntries(
  setDefinitions.map((set) => [set.id, set]),
);
