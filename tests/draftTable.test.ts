import { describe, expect, it } from 'vitest';
import { registry } from '../packages/content/src';
import { validateDeck } from '../packages/core/src';
import { draftPresets, isRunComplete, winsOf, type DraftRun } from '../packages/draft/src';
import { autoDeckAll, autoPickAll, createTable, deckWaitingOn, leaveSeat, recordTableResult, submitDeck, submitFaction, submitPick, tableComplete, viewFor, waitingOn, type DraftTable } from '../packages/draft/src/table';

const preset = draftPresets[0]!;
const seats = (humans: boolean[]) => humans.map((human, index) => ({ name: `Seat ${index}`, human, token: `t${index}` }));
const table = (humans = [true, true, false], seed = 9) => createTable(preset, registry, { id: 'table-1', seed, now: 0, seats: seats(humans), faction: 'bright-marches' });
const view = (t: DraftTable, seat: number): DraftRun => viewFor(t, seat, { code: 'ROOM1234', host: seat === 0, fee: preset.entryFee });
/** Everyone takes the first card of their pack until the draft is over, and brings Crownlands to the second half. */
const draftAll = (t: DraftTable) => { while (t.stage === 'draft') for (const seat of waitingOn(t)) t = t.draft.awaiting ? submitFaction(t, preset, registry, seat, 'crownlands') : submitPick(t, preset, registry, seat, t.draft.held[seat]![0]!); return t; };
/** Everyone takes the first card of their pack until the first half is over. */
const firstHalf = (t: DraftTable) => { while (!t.draft.awaiting) for (const seat of waitingOn(t)) t = submitPick(t, preset, registry, seat, t.draft.held[seat]![0]!); return t; };

describe('a draft table with other people', () => {
  it('waits for every person, lets the bots go with them, and ends with 48 picks each', () => {
    let t = table();
    expect(waitingOn(t)).toEqual([0, 1]);
    t = submitPick(t, preset, registry, 0, t.draft.held[0]![0]!);
    expect(t.draft.step).toBe(0); // seat 1 has not chosen yet
    expect(waitingOn(t)).toEqual([1]);
    expect(() => submitPick(t, preset, registry, 0, t.draft.held[0]![0]!)).toThrow();
    expect(() => submitPick(t, preset, registry, 1, 'no-such-card')).toThrow();
    t = draftAll(t);
    expect(t.stage).toBe('build');
    expect(t.draft.picks.map(list => list.length)).toEqual([48, 48, 48]);
    expect(t.decks[2]).toHaveLength(30); // the bot built its own
    expect(deckWaitingOn(t)).toEqual([0, 1]);
  });

  it('keeps the faction choices hidden until the last person has chosen, then deals the second half', () => {
    let t = firstHalf(table());
    expect(t.draft.awaiting).toBe(true);
    expect(waitingOn(t)).toEqual([0, 1]);
    expect(() => submitPick(t, preset, registry, 0, 'x')).toThrow(/faction/);
    expect(() => submitFaction(t, preset, registry, 0, 'horde')).toThrow();
    t = submitFaction(t, preset, registry, 0, 'black-host');
    expect(view(t, 1).draft.factions).toEqual([null, null, null]); // nothing is revealed yet
    expect(view(t, 0).draft.awaiting).toBe(true);
    expect(() => submitFaction(t, preset, registry, 0, 'ember-fields')).toThrow(); // no second thoughts
    t = submitFaction(t, preset, registry, 1, 'ember-fields');
    expect(t.draft.awaiting).toBe(false);
    expect(t.draft.factions.slice(0, 2)).toEqual(['black-host', 'ember-fields']);
    expect(view(t, 1).draft.factions.slice(0, 2)).toEqual(['ember-fields', t.draft.factions[2]]); // rotated around you
    expect(waitingOn(t)).toEqual([0, 1]);
    expect(t.draft.held[0]).toEqual(t.draft.deal[12]);
  });

  it('chooses a faction for a person who runs out of time, the same way every time', () => {
    const a = autoPickAll(firstHalf(table()), preset, registry), b = autoPickAll(firstHalf(table()), preset, registry);
    expect(a.draft.awaiting).toBe(false);
    expect(a.draft.factions).toEqual(b.draft.factions);
  });

  it('plays a slow person\'s pick with a bot\'s choice when time runs out, and the same way every time', () => {
    const a = autoPickAll(table(), preset, registry), b = autoPickAll(table(), preset, registry);
    expect(a.draft.step).toBe(1);
    expect(a.draft.picks).toEqual(b.draft.picks);
  });

  it('keeps other drafters\' packs, picks and the rest of the deal out of your view, and rotates the table around you', () => {
    const t = draftAll(table());
    const mine = view(t, 1);
    expect(mine.draft.deal).toEqual([]);
    expect(mine.draft.picks[0]).toEqual(t.draft.picks[1]);
    expect(mine.draft.picks[1]).toEqual([]);
    expect(mine.table).toMatchObject({ seat: 1, names: ['Seat 1', 'Seat 2', 'Seat 0'], humans: [true, false, true] });
    expect(mine.bots[0]!.name).toBe('Seat 2');
    expect(mine.bots[0]!.deck).toHaveLength(30); // a bot's deck is shown, so you can play it
    expect(mine.bots[1]!.deck).toEqual([]); // a person's deck stays theirs
  });

  it('starts the matches once every person has a deck, and refuses a deck that is not from your picks', () => {
    let t = draftAll(table());
    expect(() => submitDeck(t, registry, 0, t.draft.picks[1]!.slice(0, 30))).toThrow(); // cards you did not draft
    const own = (seat: number) => { const deck = view(t, seat).deck; return deck.length ? deck : autoDeckAll(t, registry).decks[seat]!; };
    t = submitDeck(t, registry, 0, own(0));
    expect(t.stage).toBe('build');
    t = autoDeckAll(t, registry);
    expect(t.stage).toBe('matches');
    for (const deck of t.decks) expect(validateDeck(deck!, registry, { draft: true })).toEqual([]);
  });

  it('gives each seat four matches, two against each other drafter, and pays only what they won', () => {
    let t = autoDeckAll(draftAll(table([true, true, true])), registry);
    expect(t.matches).toHaveLength(6);
    for (const seat of [0, 1, 2]) expect(view(t, seat).matches).toHaveLength(4);
    expect(view(t, 0).matches.map(match => match.table!.first)).toEqual([true, false, false, true]);
    t = recordTableResult(t, 0, 'a'); // seat 0 beats seat 1
    t = recordTableResult(t, 0, 'b'); // a second report changes nothing
    expect(winsOf(view(t, 0))).toBe(1);
    expect(winsOf(view(t, 1))).toBe(0);
    expect(view(t, 1).matches[0]!.result).toBe('lost');
    expect(isRunComplete(view(t, 0))).toBe(false);
    for (let index = 1; index < 6; index++) t = recordTableResult(t, index, 'draw');
    expect(tableComplete(t)).toBe(true);
    expect(isRunComplete(view(t, 2))).toBe(true);
  });

  it('does not wait for matches between two bots', () => {
    let t = autoDeckAll(draftAll(table([true, false, false])), registry);
    const counted = t.matches.filter(match => match.a === 0 || match.b === 0);
    counted.forEach(match => { t = recordTableResult(t, t.matches.indexOf(match), 'a'); });
    expect(tableComplete(t)).toBe(true);
  });

  it('hands a leaving person\'s seat to a bot: picks go on, and their open matches against people are lost', () => {
    let t = table([true, true, true]);
    t = submitPick(t, preset, registry, 0, t.draft.held[0]![0]!);
    t = submitPick(t, preset, registry, 1, t.draft.held[1]![0]!);
    t = leaveSeat(t, preset, registry, 2); // the last person to choose leaves: the step plays
    expect(t.draft.step).toBe(1);
    expect(waitingOn(t)).toEqual([0, 1]);
    t = draftAll(t);
    t = autoDeckAll(t, registry);
    expect(t.stage).toBe('matches');
    t = recordTableResult(t, 0, 'a'); // seat 0 beats seat 1 before seat 0 leaves
    t = leaveSeat(t, preset, registry, 0);
    const left = view(t, 0);
    expect(left.dropped).toBe(true);
    expect(winsOf(left)).toBe(1);
    // Seat 1 meets seat 0 again later: that match is a win by forfeit, and the one with seat 2 is not waited on.
    expect(winsOf(view(t, 1))).toBe(1);
    expect(t.matches.find(match => match.forfeit)).toBeTruthy();
  });
});
