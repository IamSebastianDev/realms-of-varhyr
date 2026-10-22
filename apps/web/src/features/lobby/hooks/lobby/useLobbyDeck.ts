import {
  type CustomDeck,
  addDeckCard,
  removeDeckCard,
  starterOptions,
} from "../../../decks/lib/decks";
import { builderCards } from "../../../decks/lib/deckTools";
import { buyMissingDeckCards, missingDeckPurchase } from "../../../collection/lib/collection";
import { byOwnership } from "../../../decks/components/CardFilters";
import { emptyDeck } from "../../lib/lobbyHelpers";
import { t as msg } from "@realms/ui/i18n";
import { registry } from "@realms/content";
import { trackDeckSave } from "../../../goals/stores/goalsStore";
import { updateCollection } from "../../../collection/stores/collectionStore";
import { useMemo } from "react";

import type { useLobbyNavigation } from "./useLobbyNavigation";
import type { useLobbyCollection } from "./useLobbyCollection";

/** The deck being edited: changes, undo, buying missing cards, saving and deleting. */
export function useLobbyDeck(
  c: ReturnType<typeof useLobbyNavigation> & ReturnType<typeof useLobbyCollection>,
) {
  const {
    draft,
    editingName,
    filters,
    ownedCopies,
    ownership,
    past,
    props,
    setDraft,
    setMessage,
    setPast,
  } = c;
  const matches = useMemo(() => builderCards(registry, [], filters), [filters]);
  const cards = useMemo(
    () => byOwnership(matches, ownedCopies, ownership),
    [matches, ownedCopies, ownership],
  );
  const change = (next: CustomDeck) => {
    if (JSON.stringify(next) === JSON.stringify(draft)) return;
    const nameOnly = next.id === draft.id && next.cards === draft.cards;
    if (!nameOnly || !editingName.current)
      setPast((list) => [...list.slice(-49), structuredClone(draft)]);
    editingName.current = nameOnly;
    setDraft(next);
    setMessage("");
  };
  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    editingName.current = false;
    setDraft(previous);
    setPast((list) => list.slice(0, -1));
    setMessage(msg("Edit undone."));
  };
  const add = (id: string) => change({ ...draft, cards: addDeckCard(draft.cards, id, registry) });
  const remove = (id: string) => change({ ...draft, cards: removeDeckCard(draft.cards, id) });
  function buyMissingCards() {
    try {
      let purchased = 0;
      let cost = 0;
      updateCollection((current) => {
        const plan = missingDeckPurchase(draft.cards, current.counts, registry);
        purchased = plan.copies;
        cost = plan.crowns;
        return buyMissingDeckCards(current, draft.cards, registry);
      });
      if (purchased)
        setMessage(
          msg("Added {v0} cards to your collection for {v1} crowns.", { v0: purchased, v1: cost }),
        );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : msg("Could not buy the missing cards."));
    }
  }
  function load(id: string) {
    const saved = props.decks.find((d) => d.id === id),
      starter = starterOptions.find((d) => d.id === id);
    if (saved) change({ ...saved, cards: [...saved.cards] });
    else if (starter)
      change({
        ...emptyDeck(),
        name: msg("{v0} (copy)", { v0: starter.name }),
        cards: [...starter.cards],
      });
  }
  function save() {
    const next = { ...draft, name: draft.name.trim() };
    const error = props.saveDeck(next);
    setMessage(error ?? msg("Saved locally. Your deck is available in Play."));
    if (!error) {
      editingName.current = false;
      setDraft(next);
      trackDeckSave();
    }
    return !error;
  }
  function renameSaved(id: string, name: string) {
    const deck = props.decks.find((d) => d.id === id);
    if (!deck) return null;
    const error = props.saveDeck({ ...deck, name });
    if (!error && draft.id === id) setDraft((current) => ({ ...current, name }));
    return error;
  }
  function deleteSaved(id: string) {
    const error = props.deleteDeck(id);
    if (!error && draft.id === id) {
      setPast([]);
      setDraft(emptyDeck());
    }
    return error;
  }
  function deleteDraft() {
    const error = props.deleteDeck(draft.id);
    if (error) {
      setMessage(error);
      return;
    }
    editingName.current = false;
    setPast([]);
    setDraft(emptyDeck());
    setMessage(msg("Deck deleted."));
  }
  return {
    matches,
    cards,
    change,
    undo,
    add,
    remove,
    buyMissingCards,
    load,
    save,
    renameSaved,
    deleteSaved,
    deleteDraft,
  };
}
