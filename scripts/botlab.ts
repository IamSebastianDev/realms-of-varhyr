// Shared by the bot tools: a pool of decks to play with, and one game played between two sets of bot weights.
import { registry, starterDecks, starterDefinitions } from '../packages/content/src';
import { apply, createMatch, decisionPlayer, validateDeck } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import { setBotWeights, type BotWeights } from '../packages/core/src/botWeights';
import { buildBotDeck, chooseFactions, draftableFactions, draftPresets, pickRound, startDraft } from '../packages/draft/src';
import type { Command, GameState, PlayerId } from '../packages/contracts/src';

export function seedFor(sample: number): number {
  let s = (sample + 0x9e3779b9) >>> 0; s = Math.imul(s ^ (s >>> 16), 0x85ebca6b); s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35); return (s ^ (s >>> 16)) >>> 0;
}
/** The three starters, then decks the draft bots build from the packs, so tuning cannot just learn three decks. */
export function deckPool(drafted = 24): string[][] {
  const decks = starterDefinitions.filter(d => !validateDeck(starterDecks[d.id], registry).length).map(d => starterDecks[d.id]);
  for (let i = 0; i < drafted; i++) {
    const preset = draftPresets[0]!, factions = draftableFactions(registry);
    let state = startDraft(preset, registry, 500 + i, factions[i % factions.length]!);
    while (!state.done) state = state.awaiting ? chooseFactions(state, registry, [null, null, null]) : pickRound(state, preset, registry, [null, null, null]);
    for (const picks of state.picks) { const deck = buildBotDeck(picks, registry); if (deck.length === 30 && !validateDeck(deck, registry, { draft: true }).length) decks.push(deck); }
  }
  return decks;
}
export type Side = { weights?: Partial<BotWeights>; choose?: (state: GameState) => Command | null };
/** Play one game; returns the winner's seat or null for a draw. `record` sees every position before the mover acts. */
export function play(decks: [string[], string[]], seed: number, sides: Record<PlayerId, Side>, record?: (state: GameState, actor: PlayerId) => void): PlayerId | null {
  let state = createMatch(registry, decks, seed, { mulligan: true, draft: true });
  for (let move = 0; move < 800 && !state.outcome; move++) {
    const actor = decisionPlayer(state), side = sides[actor];
    record?.(state, actor);
    setBotWeights(side.weights ?? {});
    const command = side.choose?.(state) ?? botCommand(state, registry);
    const result = apply(state, { actor, expectedRevision: state.revision, command }, registry);
    if (result.error) throw new Error(result.error);
    state = result.state;
  }
  setBotWeights({});
  return state.outcome === 'p1' || state.outcome === 'p2' ? state.outcome : null;
}
