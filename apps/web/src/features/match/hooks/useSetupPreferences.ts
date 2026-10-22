import { useEffect, useMemo, useState } from "react";
import { defaultDeckId } from "@realms/content";
import { decksKey, parseDecks, starterOptions, type CustomDeck } from "../../decks/lib/decks";

type Mode = "practice" | "hotseat";

/**
 * The deck and opponent choices of the in-match menu: your saved decks, the starters, and the last picks, kept in local storage.
 * Only a local match remembers its choices.
 */
export function useSetupPreferences({
  local,
  mode,
  deck,
  customDeck,
  opponentDeck,
}: {
  local: boolean;
  mode: Mode;
  deck: string;
  customDeck?: CustomDeck;
  opponentDeck?: CustomDeck;
}) {
  const [savedDecks, setSavedDecks] = useState<CustomDeck[]>(() => {
    try {
      return parseDecks(localStorage.getItem(decksKey));
    } catch {
      return [];
    }
  });
  const deckOptions = [
    ...starterOptions,
    ...savedDecks,
    ...(customDeck && !savedDecks.some((d) => d.id === customDeck.id) ? [customDeck] : []),
  ];
  const setupPrefs = useMemo<{ mode?: Mode; deckId?: string; opponentId?: string }>(() => {
    try {
      const p = JSON.parse(localStorage.getItem("varhir-setup-v1") ?? "{}");
      return {
        mode: p.mode === "practice" || p.mode === "hotseat" ? p.mode : undefined,
        deckId: typeof p.deckId === "string" ? p.deckId : undefined,
        opponentId: typeof p.opponentId === "string" ? p.opponentId : undefined,
      };
    } catch {
      return {};
    }
  }, []);
  const [setupMode, setSetupMode] = useState<Mode>(setupPrefs.mode ?? mode),
    [setupDeck, setSetupDeck] = useState<string>(
      deckOptions.some((d) => d.id === setupPrefs.deckId)
        ? setupPrefs.deckId!
        : (customDeck?.id ?? deck),
    );
  const [setupOpponent, setSetupOpponent] = useState<string>(() =>
    setupPrefs.opponentId &&
    (setupPrefs.opponentId === "auto" || deckOptions.some((d) => d.id === setupPrefs.opponentId))
      ? setupPrefs.opponentId
      : (opponentDeck?.id ?? "auto"),
  );
  useEffect(() => {
    if (!local) return;
    try {
      localStorage.setItem(
        "varhir-setup-v1",
        JSON.stringify({ mode: setupMode, deckId: setupDeck, opponentId: setupOpponent }),
      );
    } catch {
      /* Optional setup preferences. */
    }
  }, [setupMode, setupDeck, setupOpponent, local]);
  return {
    savedDecks,
    setSavedDecks,
    deckOptions,
    setupMode,
    setSetupMode,
    setupDeck,
    setSetupDeck,
    setupOpponent,
    setSetupOpponent,
  };
}
