import { describe, expect, it } from "vitest";
import { draftRegistry as registry } from "@realms/testing/draftContent";
import { apply, createMatch, decisionPlayer, validateDeck } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import {
  bestPossible,
  botFaction,
  buildBotDeck,
  chooseFaction,
  chooseFactions,
  deckProblems,
  draftableFactions,
  draftPresets,
  draftRules,
  dropRun,
  factionPool,
  factionsOf,
  guaranteedProducers,
  isFreeProducer,
  isHybrid,
  isNeutralCard,
  isRunComplete,
  makeDraftPack,
  nextMatch,
  parseRun,
  payoutFor,
  pickCard,
  poolOf,
  recordResult,
  setDeck,
  startDraft,
  startRun,
  takePick,
  winsOf,
  type DraftRun,
} from "../src";
import { makeRng } from "@realms/quest/rng";

const preset = draftPresets[0]!;
const pod = "bright-marches",
  second = "crownlands";
/** Takes the first card of every pack, and brings `faction` to the second half. */
const finish = (run: DraftRun, faction = second) => {
  while (run.stage === "draft")
    run = run.draft.awaiting
      ? chooseFaction(run, registry, faction)
      : takePick(run, preset, registry, run.draft.held[0]![0]!);
  return run;
};
const fresh = (seed = 7, faction = pod) =>
  startRun(preset, registry, { id: "run-1", seed, now: 0, faction });
const cards = Object.values(registry.cards);

describe("draftable factions", () => {
  it("are the ones with a roster of their own and a free producer to guarantee", () => {
    const factions = draftableFactions(registry);
    expect(factions).toEqual(expect.arrayContaining([pod, second]));
    for (const faction of factions) {
      expect(
        cards.filter((card) => card.factions.length === 1 && card.factions[0] === faction).length,
      ).toBeGreaterThanOrEqual(draftRules.minimumRoster);
      expect(guaranteedProducers(cards, faction, registry).length).toBeGreaterThan(0);
    }
    expect(factions).not.toContain("neutral");
  });
  it("are the only ones a draft can start with", () => {
    expect(() => startDraft(preset, registry, 1, "neutral")).toThrow();
    expect(() => startDraft(preset, registry, 1, "no-such-faction")).toThrow();
  });
});

describe("draft packs", () => {
  it("draw from a faction's own cards, its hybrids and neutrals, and nothing from other factions", () => {
    for (const faction of draftableFactions(registry)) {
      const pool = new Set(factionPool(cards, faction).map((card) => card.id));
      for (const card of factionPool(cards, faction))
        expect(card.factions.includes(faction) || isNeutralCard(card)).toBe(true);
      for (let seed = 1; seed <= 25; seed++)
        for (const id of makeDraftPack(registry, faction, makeRng(seed)))
          expect(pool.has(id)).toBe(true);
    }
  });
  it("hold six cards with a guaranteed free producer of the faction itself: not a hybrid, not a neutral, not a legendary", () => {
    for (const faction of draftableFactions(registry)) {
      const allowed = new Set(guaranteedProducers(cards, faction, registry).map((card) => card.id));
      for (const card of guaranteedProducers(cards, faction, registry)) {
        expect(card.legendary).toBe(false);
        expect(card.factions).toEqual([faction]);
        expect(isFreeProducer(card, registry)).toBe(true);
      }
      for (let seed = 1; seed <= 40; seed++) {
        const pack = makeDraftPack(registry, faction, makeRng(seed));
        expect(pack).toHaveLength(6);
        expect(pack.some((id) => allowed.has(id))).toBe(true);
      }
    }
  });
  it("can contain hybrids that include the faction", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++)
      for (const id of makeDraftPack(registry, pod, makeRng(seed)))
        if (isHybrid(registry.cards[id]!)) seen.add(id);
    expect(seen.size).toBeGreaterThan(0);
    for (const id of seen) expect(registry.cards[id]!.factions).toContain(pod);
  });
  it("has one draft, paying five tiers", () => {
    expect(draftPresets.map((entry) => entry.id)).toEqual(["faction-draft"]);
    for (const entry of draftPresets) expect(entry.payout).toHaveLength(draftRules.matches + 1);
  });
});

describe("the two halves of the draft", () => {
  it("deals the first four rounds from the shared faction and then waits for everybody to choose", () => {
    let state = startDraft(preset, registry, 11, pod);
    expect(state.deal).toHaveLength(12);
    for (const id of state.deal.flat())
      expect(factionPool(cards, pod).map((card) => card.id)).toContain(id);
    for (let i = 0; i < 24; i++) state = pickCard(state, preset, registry, state.held[0]![0]!);
    expect(state.round).toBe(4);
    expect(state.awaiting).toBe(true);
    expect(state.done).toBe(false);
    expect(state.picks.map((list) => list.length)).toEqual([24, 24, 24]);
    expect(state.held).toEqual([[], [], []]);
    expect(state.factions).toEqual([null, null, null]);
    expect(() => pickCard(state, preset, registry, "x")).toThrow(/faction/);
  });
  it("deals the second half from the factions the drafters chose, four boosters each", () => {
    let state = startDraft(preset, registry, 11, pod);
    for (let i = 0; i < 24; i++) state = pickCard(state, preset, registry, state.held[0]![0]!);
    const next = chooseFactions(state, registry, ["crownlands", "black-host", "ember-fields"]);
    expect(next.awaiting).toBe(false);
    expect(next.factions).toEqual(["crownlands", "black-host", "ember-fields"]);
    expect(next.deal).toHaveLength(24);
    for (let round = 4; round < 8; round++)
      for (let drafter = 0; drafter < 3; drafter++) {
        const pool = new Set(factionPool(cards, next.factions[drafter]!).map((card) => card.id));
        for (const id of next.deal[round * 3 + drafter]!) expect(pool.has(id)).toBe(true);
      }
    // The packs in play are the first of the second half: your own pack in front of you.
    expect(next.held[0]).toEqual(next.deal[12]);
    expect(factionsOf(next)).toEqual([pod, "crownlands"]);
  });
  it("lets the bots choose from their own picks, deterministically, and refuses a faction without a roster", () => {
    let state = startDraft(preset, registry, 11, pod);
    for (let i = 0; i < 24; i++) state = pickCard(state, preset, registry, state.held[0]![0]!);
    const a = chooseFactions(state, registry, ["crownlands", null, null]),
      b = chooseFactions(state, registry, ["crownlands", null, null]);
    expect(a.factions).toEqual(b.factions);
    for (const faction of a.factions) expect(draftableFactions(registry)).toContain(faction);
    expect(() => chooseFactions(state, registry, ["neutral", null, null])).toThrow();
    expect(() =>
      chooseFactions(startDraft(preset, registry, 3, pod), registry, ["crownlands", null, null]),
    ).toThrow();
  });
  it("has a bot that holds hybrids take their partner faction", () => {
    const hybrids = cards.filter(
      (card) =>
        card.factions.length === 2 && card.factions.includes(pod) && card.factions.includes(second),
    );
    expect(hybrids.length).toBeGreaterThan(0);
    const picks = [...hybrids, ...hybrids, ...hybrids, ...hybrids].map((card) => card.id);
    for (let seed = 1; seed <= 20; seed++)
      expect(botFaction(picks, pod, registry, makeRng(seed))).toBe(second);
  });
  it("ends with 48 picks each, nothing lost or duplicated", () => {
    let state = startDraft(preset, registry, 17, pod);
    while (!state.done)
      state = state.awaiting
        ? chooseFactions(state, registry, [second, null, null])
        : pickCard(state, preset, registry, state.held[0]![0]!);
    expect(state.deal).toHaveLength(24);
    expect(state.picks.map((list) => list.length)).toEqual([48, 48, 48]);
    expect([...state.picks.flat()].sort()).toEqual([...state.deal.flat()].sort());
  });
});

describe("the draft", () => {
  it("shows you each pack twice, shrinking 6, 5, 4, 3, 2 down to the last card, which you pick too", () => {
    let state = startDraft(preset, registry, 3, pod);
    const sizes: number[] = [];
    for (let i = 0; i < 6; i++) {
      sizes.push(state.held[0]!.length);
      state = pickCard(state, preset, registry, state.held[0]![0]!);
    }
    expect(sizes).toEqual([6, 5, 4, 3, 2, 1]);
    expect(state.round).toBe(1);
    expect(state.picks[0]).toHaveLength(6);
  });
  it("rejects a card that is not in your pack, and picking after the end", () => {
    const state = startDraft(preset, registry, 5, pod);
    expect(() => pickCard(state, preset, registry, "no-such-card")).toThrow();
    let end = state;
    while (!end.done)
      end = end.awaiting
        ? chooseFactions(end, registry, [second, null, null])
        : pickCard(end, preset, registry, end.held[0]![0]!);
    expect(() => pickCard(end, preset, registry, "x")).toThrow();
  });
  it("is the same every time for the same seed", () => {
    expect(finish(fresh(21)).draft.picks).toEqual(finish(fresh(21)).draft.picks);
  });
  it("gives the bots playable 30-card decks under the draft rules", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = finish(fresh(seed));
      expect(run.stage).toBe("build");
      for (const bot of run.bots) {
        expect(bot.deck).toHaveLength(30);
        expect(validateDeck(bot.deck, registry, { draft: true })).toEqual([]);
        expect(
          bot.deck.filter((id) => isFreeProducer(registry.cards[id]!, registry)).length,
        ).toBeGreaterThanOrEqual(6);
      }
    }
  });
  it("lets a drafted deck with more than three copies start and play a match", () => {
    const run = finish(fresh(9));
    const copy = poolOf(run).find((id) => !registry.cards[id]!.legendary)!;
    const deck = [...buildBotDeck(poolOf(run), registry)];
    while (deck.filter((id) => id === copy).length < 5) deck.push(copy);
    expect(validateDeck(deck, registry)).not.toEqual([]);
    expect(() => createMatch(registry, [deck, run.bots[0]!.deck], 1, { mulligan: true })).toThrow();
    let state = createMatch(registry, [deck, run.bots[0]!.deck], 1, {
      mulligan: true,
      draft: true,
    });
    for (let i = 0; i < 400 && !state.outcome; i++) {
      const result = apply(
        state,
        {
          actor: decisionPlayer(state),
          expectedRevision: state.revision,
          command: botCommand(state, registry),
        },
        registry,
      );
      expect(result.error).toBeUndefined();
      state = result.state;
    }
  });
});

describe("draft deck rules", () => {
  const [a, b] = [
    Object.values(registry.cards).find((card) => !card.legendary)!,
    Object.values(registry.cards).find((card) => card.legendary)!,
  ];
  it("waives every copy limit except the legendary one", () => {
    const filler = Object.values(registry.cards)
      .filter((card) => !card.legendary && card.id !== a.id)
      .slice(0, 10)
      .flatMap((card) => [card.id, card.id, card.id]);
    expect(validateDeck([...Array(5).fill(a.id), ...filler], registry, { draft: true })).toEqual(
      [],
    );
    expect(validateDeck([...Array(5).fill(a.id), ...filler], registry)).not.toEqual([]);
    expect(
      validateDeck([b.id, b.id, ...filler], registry, { draft: true }).some((error) =>
        error.startsWith("Too many"),
      ),
    ).toBe(true);
  });
  it("only accepts cards you drafted, in the numbers you drafted them", () => {
    const run = finish(fresh(4));
    const pool = poolOf(run);
    expect(deckProblems(buildBotDeck(pool, registry), pool, registry)).toEqual([]);
    const bad = [...buildBotDeck(pool, registry)];
    const stranger = Object.values(registry.cards).find(
      (card) => !pool.includes(card.id) && !card.legendary,
    )!;
    bad[0] = stranger.id;
    expect(deckProblems(bad, pool, registry).join(" ")).toMatch(/did not draft/);
    expect(() => setDeck(run, bad, registry)).toThrow();
    expect(() => setDeck(fresh(), [], registry)).toThrow();
  });
});

describe("a run", () => {
  it("schedules two matches against each bot and records each result once", () => {
    let run = setDeck(finish(fresh(6)), buildBotDeck(poolOf(finish(fresh(6))), registry), registry);
    expect(run.stage).toBe("matches");
    expect(run.matches.map((match) => match.opponent)).toEqual([1, 2, 1, 2]);
    expect(nextMatch(run)).toBe(0);
    run = recordResult(run, 0, "won");
    expect(recordResult(run, 0, "lost")).toBe(run);
    expect(winsOf(run)).toBe(1);
    expect(bestPossible(run)).toBe(4);
    expect(isRunComplete(run)).toBe(false);
    run = recordResult(recordResult(recordResult(run, 1, "lost"), 2, "won"), 3, "draw");
    expect(winsOf(run)).toBe(2);
    expect(nextMatch(run)).toBe(-1);
    expect(isRunComplete(run)).toBe(true);
  });
  it("can be dropped, and survives a round trip through storage", () => {
    const run = dropRun(finish(fresh(8)));
    expect(isRunComplete(run)).toBe(true);
    expect(parseRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
    expect(parseRun({ id: 1 })).toBeNull();
    expect(isRunComplete(fresh())).toBe(false);
  });
  it("has nothing to pay out when it is dropped before the picks are done", () => {
    const run = dropRun(fresh());
    expect(run.stage).toBe("draft");
    expect(isRunComplete(run)).toBe(false);
  });
  it("does not read a run saved by the older draft", () => {
    const run = fresh();
    const { pod: _pod, ...old } = run.draft;
    expect(parseRun({ ...run, draft: old })).toBeNull();
    expect(parseRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
  });
  it("pays by wins, with the agreed table", () => {
    expect([0, 1, 2, 3, 4].map((wins) => payoutFor(preset, wins))).toEqual([
      { crowns: 250, boosters: 1 },
      { crowns: 450, boosters: 2 },
      { crowns: 600, boosters: 3 },
      { crowns: 800, boosters: 5 },
      { crowns: 1100, boosters: 8 },
    ]);
    expect(payoutFor(preset, 9)).toEqual({ crowns: 1100, boosters: 8 });
  });
});
