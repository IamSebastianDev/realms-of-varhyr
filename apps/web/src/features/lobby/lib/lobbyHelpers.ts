import { t as msg } from "@realms/ui/i18n";
import { draftKey, parseDeck, type CustomDeck } from "../../decks/lib/decks";

export function emptyDeck(): CustomDeck {
  return { id: `custom-${crypto.randomUUID()}`, name: msg("New deck"), cards: [] };
}
export function readDraft(): CustomDeck {
  try {
    return parseDeck(JSON.parse(localStorage.getItem(draftKey) ?? "null"), true) ?? emptyDeck();
  } catch {
    return emptyDeck();
  }
}
