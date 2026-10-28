import type { MatchSetup } from "./session";
import { matchContent, opponentDeck, startMatch } from "./session";

export const botRotationKey = "varhir-bot-opponent-v1";
// Still rotate in browsers that disallow persistence, for as long as the page is open.
let lastAutoOpponent: string | undefined;

function previousOpponent(): string | undefined {
  if (lastAutoOpponent) return lastAutoOpponent;
  try {
    return localStorage.getItem(botRotationKey) ?? lastAutoOpponent;
  } catch {
    return lastAutoOpponent;
  }
}

/** Browser setup only: the core match constructor remains deterministic and storage-free. */
export function startLocalMatch(
  options: Pick<MatchSetup, "mode" | "deck" | "skirmish" | "customDeck" | "opponentDeck"> & {
    seed: number;
    playerName?: string;
    playerAvatar?: string;
  },
  content = matchContent,
) {
  const automatic = options.mode === "practice";
  const opponent = automatic
    ? opponentDeck(
        options.customDeck?.id ?? options.deck,
        options.customDeck,
        content,
        previousOpponent(),
      )
    : options.opponentDeck;
  const initial = startMatch(
    options.seed,
    options.deck,
    options.skirmish,
    options.customDeck,
    content,
    opponent,
    options.playerName,
    options.playerAvatar,
  );
  // Failed setup, restored matches and hotseat choices never advance the rotation.
  if (automatic && opponent && content.starters.some((deck) => deck.id === opponent.id)) {
    lastAutoOpponent = opponent.id;
    try {
      localStorage.setItem(botRotationKey, opponent.id);
    } catch {
      // Optional preference; the match can still start and the in-memory rotation continues.
    }
  }
  return initial;
}
