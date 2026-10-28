import type { GameState, Registry } from "@realms/contracts";
import { apply, createMatch, decisionPlayer, validateDeck } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import { avatarDefinitions, defaultDeckId, registry, starterDefinitions } from "@realms/content";
import type { CustomDeck } from "../../decks/lib/decks";
import type { StarterDeck } from "@realms/content/starters";

export type DeckName = string;
/** Every match gets its own shuffle; the seed is recorded in the match, not chosen by the player. */
export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;
export type MatchContent = { registry: Registry; starters: StarterDeck[] };
export const matchContent: MatchContent = { registry, starters: starterDefinitions };

/** Cycle valid starters after the last automatic opponent; prefer a different deck on the first match. */
export function opponentDeck(
  deckId: string,
  custom: CustomDeck | undefined,
  content = matchContent,
  previousId?: string,
): StarterDeck | CustomDeck | undefined {
  const playable = content.starters.filter(
    (deck) => !validateDeck(deck.cards, content.registry).length,
  );
  const previous = playable.findIndex((deck) => deck.id === previousId);
  if (previous >= 0) return playable[(previous + 1) % playable.length];
  return playable.find((deck) => deck.id !== deckId) ?? playable[0] ?? custom;
}

export function startMatch(
  seed: number,
  deck: DeckName = defaultDeckId,
  skirmish = false,
  customDeck?: CustomDeck,
  content = matchContent,
  opponentChoice?: StarterDeck | CustomDeck,
  playerName?: string,
  playerAvatar?: string,
  draft = false,
): GameState {
  const chosen = customDeck ?? content.starters.find((starter) => starter.id === deck);
  if (!chosen) throw new Error(`Unknown starter deck: ${deck}`);
  const errors = validateDeck(chosen.cards, content.registry, { draft });
  if (errors.length) throw new Error(errors.join(" "));
  const requested =
    opponentChoice && !validateDeck(opponentChoice.cards, content.registry, { draft }).length
      ? opponentChoice
      : undefined;
  const opponent = requested ?? opponentDeck(deck, customDeck, content);
  if (!opponent) throw new Error("Add a complete starter deck before playing.");
  let state = createMatch(content.registry, [chosen.cards, opponent.cards], seed, {
    mulligan: true,
    draft,
  });
  state.players.p1.name = playerName?.trim() || chosen.name;
  state.players.p2.name = opponent.id === chosen.id ? `${opponent.name} · opponent` : opponent.name;
  if (playerAvatar) {
    // The opponent's portrait is drawn from the seed, so a match restored from its saved start keeps the same face.
    const others = avatarDefinitions.filter((a) => a.id !== playerAvatar);
    state.players.p1.avatar = playerAvatar;
    if (others.length) state.players.p2.avatar = others[(seed >>> 0) % others.length]!.id;
  }
  if (skirmish)
    for (let i = 0; i < 160; i++) {
      if (state.outcome || (state.turn >= 5 && state.active === "p1" && state.phase === "play"))
        break;
      const result = apply(
        state,
        {
          actor: decisionPlayer(state),
          expectedRevision: state.revision,
          command: botCommand(state, content.registry),
        },
        content.registry,
      );
      if (result.error) throw new Error(result.error);
      state = result.state;
    }
  return state;
}

/** Everything needed to start a match on this machine. */
export type MatchSetup = {
  initial: GameState;
  mode: "practice" | "hotseat";
  deck: DeckName;
  skirmish: boolean;
  customDeck?: CustomDeck;
  /** Chosen opponent deck; absent means the automatic pick. */
  opponentDeck?: { id: string; name: string; cards: string[] };
  /** Local identity for a once-only victory reward; independent of shuffle seed. */
  rewardId?: string;
  rewardEligible?: boolean;
  /** A fight on the quest map; the result is reported back to the run. */
  quest?: { run: string; node: string };
  /** A match of a faction draft run; the result is recorded in the run. */
  draft?: { preset: string; run: string; match: number };
  /** The guided first match: scripted opponent, no rewards. */
  tutorial?: boolean;
};
