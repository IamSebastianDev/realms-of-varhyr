import {
  type BuilderFilters,
  builderCards,
  cardCost,
  compareCards,
  summarizeDeck,
} from "../../lib/deckTools";
import { type DeckEntry } from "../../lib/deckBuilderTypes";
import { byOwnership } from "../../components/CardFilters";
import { missingDeckCopies, missingDeckPurchase } from "../../../collection/lib/collection";
import { t as msg } from "@realms/ui/i18n";
import { newDeck, signature } from "../../lib/deckBuilderHelpers";
import { registry } from "@realms/content";
import { useEffect, useMemo } from "react";
import { validateDeck } from "@realms/core";

import type { useDeckBuilderState } from "./useDeckBuilderState";

/** The cards shown, the deck summary, what is missing, and the unsaved-changes guard. */
export function useDeckBuilderDerived(c: ReturnType<typeof useDeckBuilderState>) {
  const {
    change,
    crowns,
    deckCost,
    decks,
    draft,
    filters,
    guardRef,
    ownedCopies,
    ownership,
    pending,
    save,
    setFilters,
    setPending,
  } = c;
  const filter = <K extends keyof BuilderFilters>(key: K, value: BuilderFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const allCards = useMemo(
    () => builderCards(registry, draft.cards, filters),
    [draft.cards, filters],
  );
  const cards = useMemo(
    () => byOwnership(allCards, ownedCopies, ownership),
    [allCards, ownedCopies, ownership],
  );
  const hiddenCount = allCards.length - cards.length;
  const summary = useMemo(() => summarizeDeck(draft.cards, registry), [draft.cards]);
  const counts = new Map<string, number>();
  for (const id of draft.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const deckCards = [...counts.keys()]
    .flatMap((id) => (registry.cards[id] ? [registry.cards[id]] : []))
    .sort(compareCards);
  const missing = missingDeckCopies(draft.cards, ownedCopies);
  const purchase = missingDeckPurchase(draft.cards, ownedCopies, registry);
  const canBuyMissing = purchase.complete && purchase.copies > 0 && crowns >= purchase.crowns;
  const errors = [
    ...validateDeck(draft.cards, registry),
    ...(missing.length
      ? [
          msg("Missing {v0} owned copies. Buy them or edit this deck.", {
            v0: missing.reduce((sum, card) => sum + card.missing, 0),
          }),
        ]
      : []),
  ];
  const saved = decks.find((deck) => deck.id === draft.id);
  const isSaved = saved && signature(saved) === signature(draft);
  const maxCurve = Math.max(1, ...summary.curve);
  // A deck that was never saved only counts as changed once it holds cards; a saved deck counts as soon as it differs.
  const dirty = !isSaved && (saved ? true : draft.cards.length > 0);
  const guard = (run: () => void) => {
    if (dirty) setPending({ run });
    else run();
  };
  useEffect(() => {
    if (!guardRef) return;
    guardRef.current = (proceed) => {
      if (!dirty) return false;
      setPending({ run: proceed });
      return true;
    };
    return () => {
      guardRef.current = null;
    };
  }, [guardRef, dirty]);
  function settle(keep: boolean) {
    const next = pending;
    if (!next) return;
    if (keep) {
      if (!save()) return;
    } else if (saved) change(saved);
    else change(newDeck());
    setPending(null);
    next.run();
  }
  // Copies beyond what the player owns are listed apart from the owned ones and shown dimmed.
  const shownDeckCards = deckCards.filter(
    (card) => deckCost === null || Math.min(6, cardCost(card)) === deckCost,
  );
  const deckEntries: DeckEntry[] = shownDeckCards.flatMap((card) => {
    const total = counts.get(card.id) ?? 0,
      have = Math.min(total, ownedCopies[card.id] ?? 0);
    return [
      ...(have ? [{ card, count: have, unowned: false }] : []),
      ...(total > have ? [{ card, count: total - have, unowned: true }] : []),
    ];
  });
  return {
    allCards,
    cards,
    hiddenCount,
    summary,
    deckCards,
    purchase,
    canBuyMissing,
    errors,
    saved,
    isSaved,
    maxCurve,
    guard,
    settle,
    shownDeckCards,
    deckEntries,
  };
}
