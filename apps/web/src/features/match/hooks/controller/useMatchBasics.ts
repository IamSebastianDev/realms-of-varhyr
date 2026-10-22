import { type DeckName } from "../../lib/session";
import { type Mode } from "../../lib/matchTypes";
import { type Screen } from "../../../lobby/lib/lobbyTypes";
import { ambienceAvailable, screenBeds } from "../../../audio/catalog";
import { defaultDeckId } from "@realms/content";
import { playerCommands, stepAfter } from "../../../tutorial/tutorial";
import { preloadPacks } from "../../../boosters/components/packScene";
import { useAudio } from "../../../../app/providers/AudioProvider";
import { useCardBack } from "../../../card-backs/stores/cardBackStore";
import { useCollection } from "../../../collection/stores/collectionStore";
import { useEffect, useState } from "react";
import { useFullscreen } from "../../../../hooks/useFullscreen";
import { useLanguage } from "@realms/ui/i18n";
import { useMatchOutcome } from "../useMatchOutcome";
import { useMatchSession } from "../useMatchSession";
import { usePreferences } from "@realms/ui/preferences";
import { useSetupPreferences } from "../useSetupPreferences";
import { type MatchScreenProps } from "../../lib/matchTypes";

/** The session, who is looking at it, and the settings the match was started with. */
export function useMatchBasics({
  match,
  setup,
  script,
  leave,
  onBegin,
  onAttach,
}: MatchScreenProps) {
  useLanguage();
  const { sound, reduced, skipEmptyWindows } = usePreferences();
  const sessionSnapshot = useMatchSession(match);
  const fullscreen = useFullscreen();
  const { initial, commands, state, connection, historySteps, bot } = sessionSnapshot;
  const watching = match.kind === "replay",
    local = match.kind === "live" && match.local,
    online = match.kind === "live" && !match.local,
    hotseat = sessionSnapshot.hotseat,
    mode: Mode = hotseat ? "hotseat" : "practice";
  const { collection, saved: collectionSaved } = useCollection();
  const rewardId = setup ? setup.rewardId : online ? sessionSnapshot.matchId : undefined,
    rewardEligible = setup ? setup.rewardEligible !== false : online;
  const [tutorial, setTutorial] = useState(!!setup?.tutorial),
    [tutorialStep, setTutorialStep] = useState(() => stepAfter(playerCommands(commands))),
    [coachNudge, setCoachNudge] = useState(0);
  const deck: DeckName = setup?.deck ?? defaultDeckId,
    customDeck = setup?.customDeck,
    opponentDeck = setup?.opponentDeck;
  useMatchOutcome({
    setup,
    snapshot: sessionSnapshot,
    watching,
    online,
    rewardId,
    rewardEligible,
    customDeck,
    deck,
  });
  const ownBack = useCardBack(!watching && !hotseat ? customDeck?.back : undefined);
  const [screen, setScreen] = useState<Screen>("match");
  const { setAmbience } = useAudio();
  useEffect(() => {
    setAmbience(ambienceAvailable ? (screenBeds[screen] ?? null) : null);
  }, [screen, setAmbience]);
  useEffect(() => {
    preloadPacks();
  }, []);
  const {
    savedDecks,
    setSavedDecks,
    deckOptions,
    setupMode,
    setSetupMode,
    setupDeck,
    setSetupDeck,
    setupOpponent,
    setSetupOpponent,
  } = useSetupPreferences({ local, mode, deck, customDeck, opponentDeck });
  return {
    match,
    setup,
    script,
    leave,
    onBegin,
    onAttach,
    sound,
    reduced,
    skipEmptyWindows,
    sessionSnapshot,
    fullscreen,
    initial,
    commands,
    state,
    connection,
    historySteps,
    bot,
    watching,
    local,
    online,
    hotseat,
    mode,
    collection,
    collectionSaved,
    rewardId,
    tutorial,
    setTutorial,
    tutorialStep,
    setTutorialStep,
    coachNudge,
    setCoachNudge,
    deck,
    customDeck,
    ownBack,
    screen,
    setScreen,
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
