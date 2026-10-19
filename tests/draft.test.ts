import { describe, expect, it } from 'vitest';
import { registry } from '../packages/content/src';
import { apply, createMatch, decisionPlayer, validateDeck } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import { boosterPacks, packCards } from '../packages/content/src/boosters';
import { bestPossible, buildBotDeck, deckProblems, draftPresets, draftRules, dropRun, isFreeProducer, isRunComplete, makeDraftPack, nextMatch, parseRun, payoutFor, pickCard, poolOf, recordResult, setDeck, startDraft, startRun, takePick, winsOf, type DraftRun } from '../packages/draft/src';
import { makeRng } from '../packages/quest/src/rng';

const preset = draftPresets[0]!;
const finish = (run: DraftRun) => { while (run.stage === 'draft') run = takePick(run, preset, registry, run.draft.held[0]![0]!); return run; };
const fresh = (seed = 7) => startRun(preset, registry, { id: 'run-1', seed, now: 0 });

describe('draft packs', () => {
  it('holds six cards with a guaranteed free producer', () => {
    const pool = packCards(Object.values(registry.cards), boosterPacks[0]!);
    for (let seed = 1; seed <= 40; seed++) {
      const pack = makeDraftPack(pool, registry, makeRng(seed));
      expect(pack).toHaveLength(6);
      expect(pack.some(id => isFreeProducer(registry.cards[id]!, registry))).toBe(true);
    }
  });
  it('has one preset per alignment booster, each paying five tiers', () => {
    expect(draftPresets.map(entry => entry.packs[0])).toEqual(boosterPacks.map(pack => pack.id));
    for (const entry of draftPresets) expect(entry.payout).toHaveLength(draftRules.matches + 1);
  });
});

describe('the draft', () => {
  it('deals 24 boosters and every drafter ends with 48 picks, nothing lost or duplicated', () => {
    const start = startDraft(preset, registry, 11);
    expect(start.deal).toHaveLength(24);
    let state = start;
    while (!state.done) { state = pickCard(state, preset, registry, state.held[0]![0]!); }
    expect(state.picks.map(list => list.length)).toEqual([48, 48, 48]);
    expect([...state.picks.flat()].sort()).toEqual([...start.deal.flat()].sort());
  });
  it('shows you each pack twice, shrinking 6, 5, 4, 3, 2 down to the last card, which you pick too', () => {
    let state = startDraft(preset, registry, 3);
    const sizes: number[] = [];
    for (let i = 0; i < 6; i++) { sizes.push(state.held[0]!.length); state = pickCard(state, preset, registry, state.held[0]![0]!); }
    expect(sizes).toEqual([6, 5, 4, 3, 2, 1]);
    expect(state.round).toBe(1);
    expect(state.picks[0]).toHaveLength(6);
  });
  it('rejects a card that is not in your pack, and picking after the end', () => {
    const state = startDraft(preset, registry, 5);
    expect(() => pickCard(state, preset, registry, 'no-such-card')).toThrow();
    let end = state; while (!end.done) end = pickCard(end, preset, registry, end.held[0]![0]!);
    expect(() => pickCard(end, preset, registry, 'x')).toThrow();
  });
  it('is the same every time for the same seed', () => {
    expect(finish(fresh(21)).draft.picks).toEqual(finish(fresh(21)).draft.picks);
  });
  it('gives the bots playable 30-card decks under the draft rules', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = finish(fresh(seed));
      expect(run.stage).toBe('build');
      for (const bot of run.bots) {
        expect(bot.deck).toHaveLength(30);
        expect(validateDeck(bot.deck, registry, { draft: true })).toEqual([]);
        expect(bot.deck.filter(id => isFreeProducer(registry.cards[id]!, registry)).length).toBeGreaterThanOrEqual(6);
      }
    }
  });
  it('lets a drafted deck with more than three copies start and play a match', () => {
    const run = finish(fresh(9));
    const copy = poolOf(run).find(id => !registry.cards[id]!.legendary)!;
    const deck = [...buildBotDeck(poolOf(run), registry)];
    while (deck.filter(id => id === copy).length < 5) deck.push(copy);
    expect(validateDeck(deck, registry)).not.toEqual([]);
    expect(() => createMatch(registry, [deck, run.bots[0]!.deck], 1, { mulligan: true })).toThrow();
    let state = createMatch(registry, [deck, run.bots[0]!.deck], 1, { mulligan: true, draft: true });
    for (let i = 0; i < 400 && !state.outcome; i++) {
      const result = apply(state, { actor: decisionPlayer(state), expectedRevision: state.revision, command: botCommand(state, registry) }, registry);
      expect(result.error).toBeUndefined(); state = result.state;
    }
  });
});

describe('draft deck rules', () => {
  const [a, b] = [Object.values(registry.cards).find(card => !card.legendary)!, Object.values(registry.cards).find(card => card.legendary)!];
  it('waives every copy limit except the legendary one', () => {
    const filler = Object.values(registry.cards).filter(card => !card.legendary && card.id !== a.id).slice(0, 10).flatMap(card => [card.id, card.id, card.id]);
    expect(validateDeck([...Array(5).fill(a.id), ...filler], registry, { draft: true })).toEqual([]);
    expect(validateDeck([...Array(5).fill(a.id), ...filler], registry)).not.toEqual([]);
    expect(validateDeck([b.id, b.id, ...filler], registry, { draft: true }).some(error => error.startsWith('Too many'))).toBe(true);
  });
  it('only accepts cards you drafted, in the numbers you drafted them', () => {
    const run = finish(fresh(4));
    const pool = poolOf(run);
    expect(deckProblems(buildBotDeck(pool, registry), pool, registry)).toEqual([]);
    const bad = [...buildBotDeck(pool, registry)];
    const stranger = Object.values(registry.cards).find(card => !pool.includes(card.id) && !card.legendary)!;
    bad[0] = stranger.id;
    expect(deckProblems(bad, pool, registry).join(' ')).toMatch(/did not draft/);
    expect(() => setDeck(run, bad, registry)).toThrow();
    expect(() => setDeck(fresh(), [], registry)).toThrow();
  });
});

describe('a run', () => {
  it('schedules two matches against each bot and records each result once', () => {
    let run = setDeck(finish(fresh(6)), buildBotDeck(poolOf(finish(fresh(6))), registry), registry);
    expect(run.stage).toBe('matches');
    expect(run.matches.map(match => match.opponent)).toEqual([1, 2, 1, 2]);
    expect(nextMatch(run)).toBe(0);
    run = recordResult(run, 0, 'won');
    expect(recordResult(run, 0, 'lost')).toBe(run);
    expect(winsOf(run)).toBe(1);
    expect(bestPossible(run)).toBe(4);
    expect(isRunComplete(run)).toBe(false);
    run = recordResult(recordResult(recordResult(run, 1, 'lost'), 2, 'won'), 3, 'draw');
    expect(winsOf(run)).toBe(2);
    expect(nextMatch(run)).toBe(-1);
    expect(isRunComplete(run)).toBe(true);
  });
  it('can be dropped, and survives a round trip through storage', () => {
    const run = dropRun(finish(fresh(8)));
    expect(isRunComplete(run)).toBe(true);
    expect(parseRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
    expect(parseRun({ id: 1 })).toBeNull();
    expect(isRunComplete(fresh())).toBe(false);
  });
  it('can be ended in the middle of the picks, which closes it for payout', () => {
    const run = dropRun(fresh());
    expect(run.stage).toBe('draft');
    expect(isRunComplete(run)).toBe(true);
  });
  it('pays by wins, with the agreed table', () => {
    expect([0, 1, 2, 3, 4].map(wins => payoutFor(preset, wins))).toEqual([
      { crowns: 250, boosters: 1 }, { crowns: 450, boosters: 2 }, { crowns: 600, boosters: 3 }, { crowns: 800, boosters: 5 }, { crowns: 1100, boosters: 8 },
    ]);
    expect(payoutFor(preset, 9)).toEqual({ crowns: 1100, boosters: 8 });
  });
});
