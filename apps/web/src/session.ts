import type { CommandEnvelope, GameState, Registry } from '../../../packages/contracts/src';
import { apply, createMatch, decisionPlayer, replay, RULES_VERSION, validateDeck } from '../../../packages/core/src';
import { botCommand } from '../../../packages/core/src/bot';
import { defaultDeckId, registry, starterDefinitions } from '../../../packages/content/src';
import type { CustomDeck } from './decks';
import type { StarterDeck } from '../../../packages/content/src/starters';

export type DeckName = string;
export type MatchContent = { registry: Registry; starters: StarterDeck[] };
export const matchContent: MatchContent = { registry, starters: starterDefinitions };

/** Prefer another valid starter; a custom deck can also be tested in a mirror. */
export function opponentDeck(deckId: string, custom: CustomDeck | undefined, content = matchContent): StarterDeck | CustomDeck | undefined {
  const playable = content.starters.filter(deck => !validateDeck(deck.cards, content.registry).length);
  return playable.find(deck => deck.id !== deckId) ?? playable[0] ?? custom;
}

export function startMatch(seed: number, deck: DeckName = defaultDeckId, skirmish = false, customDeck?: CustomDeck, content = matchContent, opponentChoice?: StarterDeck | CustomDeck): GameState {
  const chosen = customDeck ?? content.starters.find(starter => starter.id === deck);
  if (!chosen) throw new Error(`Unknown starter deck: ${deck}`);
  const errors = validateDeck(chosen.cards, content.registry);
  if (errors.length) throw new Error(errors.join(' '));
  const requested = opponentChoice && !validateDeck(opponentChoice.cards, content.registry).length ? opponentChoice : undefined;
  const opponent = requested ?? opponentDeck(deck, customDeck, content);
  if (!opponent) throw new Error('Add a complete starter deck before playing.');
  let state = createMatch(content.registry, [chosen.cards, opponent.cards], seed, { mulligan: true });
  state.players.p1.name = chosen.name;
  state.players.p2.name = opponent.id === chosen.id ? `${opponent.name} · opponent` : opponent.name;
  if (skirmish) for (let i = 0; i < 160; i++) {
    if (state.outcome || state.turn >= 5 && state.active === 'p1' && state.phase === 'play') break;
    const result = apply(state, { actor: decisionPlayer(state), expectedRevision: state.revision, command: botCommand(state, content.registry) }, content.registry);
    if (result.error) throw new Error(result.error);
    state = result.state;
  }
  return state;
}

export type SavedSession = {
  initial: GameState;
  commands: CommandEnvelope[];
  mode: 'practice' | 'hotseat';
  deck: DeckName;
  skirmish: boolean;
  customDeck?: CustomDeck;
  /** Chosen opponent deck; absent means the automatic pick. */
  opponentDeck?: { id: string; name: string; cards: string[] };
  started?: boolean;
  /** Local identity for a once-only victory reward; independent of shuffle seed. */
  rewardId?: string;
  /** Replay imports cannot grant rewards. */
  rewardEligible?: boolean;
  /** The guided first match: scripted opponent, no rewards. */
  tutorial?: boolean;
};

export function compatibleMatch(state: GameState, content = matchContent): boolean {
  return state.rulesVersion === RULES_VERSION && state.contentVersion === content.registry.version;
}

// Incompatible sessions restart only when their content still makes a legal deck.
// The app returns to its authoring menu if a content reset removed that deck.
export function restoreSession(saved: SavedSession, content = matchContent): SavedSession {
  if (!compatibleMatch(saved.initial, content)) return {
    ...saved,
    initial: startMatch(saved.initial.seed, saved.deck, saved.skirmish, saved.customDeck, content, saved.opponentDeck),
    commands: [],
  };
  replay(saved.initial, saved.commands, content.registry);
  return saved;
}
