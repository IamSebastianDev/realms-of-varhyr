// Stable regression content is intentionally independent of the editable card pool.
// Removed factions/cards are test fixtures, never bundled with the game.
import cards from "./cards.json";
import { compileContent as compile } from "@realms/content/compiler";
import { abilities as activeAbilities } from "@realms/extensions";
import { referenceAbilities } from "./abilityExamples";
import type { AbilityExtension } from "@realms/contracts";
export { starterDecks } from "./starters";
export const abilities = { ...referenceAbilities, ...activeAbilities };
const factionIds = [
  "crownlands",
  "elderwood",
  "ironbound",
  "ashen",
  "clans",
  "conclave",
  "abyssal",
  "tidebound",
];
export function compileContent(
  input: unknown[],
  extensions: Record<string, AbilityExtension> = abilities,
  version = "varhir-regression",
) {
  return compile(input, extensions, version, factionIds);
}
export const registry = compileContent(cards);
export default Object.values(registry.cards);
