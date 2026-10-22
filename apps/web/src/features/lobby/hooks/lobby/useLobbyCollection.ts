import { type BoosterPack, boosterPacks } from "@realms/content/boosters";
import { type CardDefinition } from "@realms/contracts";
import { type CustomDeck, draftKey } from "../../../decks/lib/decks";
import { type OpenBooster } from "../../../boosters/components/BoosterOpening";
import {
  buyCollectionBooster,
  openCollectionBooster,
  totalPacks,
} from "../../../collection/lib/collection";
import { defaultOwnership } from "../../../decks/components/CardFilters";
import { initialBuilderFilters } from "../../../decks/lib/deckTools";
import { t as msg } from "@realms/ui/i18n";
import { readDraft } from "../../lib/lobbyHelpers";
import { registry } from "@realms/content";
import { trackBooster } from "../../../goals/stores/goalsStore";
import { updateCollection, useCollection } from "../../../collection/stores/collectionStore";
import { useEffect, useRef, useState } from "react";

import type { useLobbyNavigation } from "./useLobbyNavigation";

/** The collection, boosters to open, and the card inspector. */
export function useLobbyCollection(c: ReturnType<typeof useLobbyNavigation>) {
  const { navigate, screen, setSetup, setup } = c;
  const [filters, setFilters] = useState(initialBuilderFilters),
    [ownership, setOwnership] = useState(defaultOwnership);
  const [draft, setDraft] = useState<CustomDeck>(readDraft),
    [message, setMessage] = useState("");
  const [past, setPast] = useState<CustomDeck[]>([]);
  const editingName = useRef(false);
  const [inspected, setInspected] = useState<CardDefinition | null>(null);
  const { collection, saved: collectionSaved } = useCollection();
  const [collectionMessage, setCollectionMessage] = useState("");
  const [booster, setBooster] = useState<OpenBooster | null>(null);
  const boosterOrigin = useRef<HTMLElement | null>(null);
  const ownedCopies = collection.counts;
  const boostersAvailable = totalPacks(collection);
  useEffect(() => {
    if (!booster) return;
    const origin = boosterOrigin.current;
    return () => origin?.focus();
  }, [!!booster]);
  function openBooster(pack: BoosterPack = boosterPacks[0]) {
    try {
      if (!booster) boosterOrigin.current = document.activeElement as HTMLElement;
      let reward: ReturnType<typeof openCollectionBooster> | undefined;
      const next = updateCollection((current) => {
        reward = openCollectionBooster(current, pack, registry);
        return reward.collection;
      });
      if (reward) {
        setBooster({ id: crypto.randomUUID(), cards: reward.cards, saved: next.saved, pack });
        trackBooster(reward.cards.map((card) => card.id));
      }
      setCollectionMessage("");
    } catch (cause) {
      setCollectionMessage(
        cause instanceof Error ? cause.message : msg("Could not open this booster."),
      );
    }
  }
  function buyBooster(pack: BoosterPack) {
    try {
      updateCollection((current) => buyCollectionBooster(current, pack));
      setCollectionMessage(msg("{v0} added to your boosters.", { v0: pack.name }));
    } catch (cause) {
      setCollectionMessage(
        cause instanceof Error ? cause.message : msg("Could not buy this booster."),
      );
    }
  }
  const detailRef = useRef<HTMLElement>(null),
    focusOrigin = useRef<HTMLElement | null>(null);
  function inspect(card: CardDefinition) {
    focusOrigin.current = document.activeElement as HTMLElement;
    setInspected(card);
  }
  useEffect(() => {
    if (!inspected) return;
    const origin = focusOrigin.current;
    return () => origin?.focus();
  }, [inspected]);
  function trapDetailFocus(event: React.KeyboardEvent) {
    if (event.key !== msg("Tab")) return;
    const buttons = Array.from(
      detailRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [],
    );
    const first = buttons[0],
      last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      /* Explicit saves report storage failures. */
    }
  }, [draft]);
  useEffect(() => {
    setInspected(null);
    setFilters(initialBuilderFilters);
    setOwnership(defaultOwnership);
  }, [screen]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === msg("Escape")) {
        if (inspected) setInspected(null);
        else if (booster) setBooster(null);
        else if (setup) setSetup(null);
        else if (screen !== "menu" && screen !== "quest" && screen !== "draft") navigate("menu");
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [inspected, booster, setup, screen, navigate]);
  return {
    filters,
    setFilters,
    ownership,
    setOwnership,
    draft,
    setDraft,
    message,
    setMessage,
    past,
    setPast,
    editingName,
    inspected,
    setInspected,
    collection,
    collectionSaved,
    collectionMessage,
    booster,
    setBooster,
    ownedCopies,
    boostersAvailable,
    openBooster,
    buyBooster,
    detailRef,
    inspect,
    trapDetailFocus,
  };
}
