import { registry, starterDefinitions } from "@realms/content";
import { apply, createMatch, decisionPlayer, validateDeck } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import { setBotWeights } from "@realms/core/botWeights";
import type { PlayerId } from "@realms/contracts";

// Which cards make a starter win? Every starter plays every other starter (both seats, both starting players), and for the
// decks named with --deck the tool records, per card, how often the deck won in games where that card showed up in hand
// against games where it never did. Small samples are noisy: read the "games" column before trusting a difference.
//   npx tsx tools/src/card-impact.ts --deck hearth-and-stone --deck ember --samples 12
const args = process.argv.slice(2);
const values = (name: string) => args.flatMap((a, i) => (a === name ? [args[i + 1]!] : []));
const samples = Number(values("--samples")[0] ?? 12);
const targets = values("--deck");
setBotWeights(JSON.parse(values("--weights")[0] ?? "{}"));
const decks = starterDefinitions.filter((deck) => !validateDeck(deck.cards, registry).length);
const seedFor = (sample: number) => {
  let seed = (sample + 0x9e3779b9) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
  seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35);
  return (seed ^ (seed >>> 16)) >>> 0;
};
type Count = {
  withGames: number;
  withWins: number;
  withoutGames: number;
  withoutWins: number;
  boarded: number;
};
const impact: Record<string, Record<string, Count>> = Object.fromEntries(
  targets.map((t) => [t, {}]),
);
const overall: Record<string, { games: number; wins: number }> = Object.fromEntries(
  targets.map((t) => [t, { games: 0, wins: 0 }]),
);

function play(a: (typeof decks)[number], b: (typeof decks)[number], seed: number, first: PlayerId) {
  let state = createMatch(registry, [a.cards, b.cards], seed, { mulligan: true });
  state.active = first;
  const seen = { p1: new Set<string>(), p2: new Set<string>() };
  const boarded = { p1: new Set<string>(), p2: new Set<string>() };
  const note = () => {
    for (const side of ["p1", "p2"] as const) {
      for (const id of state.players[side].hand) seen[side].add(state.cards[id]!.definitionId);
      for (const id of state.players[side].board)
        if (id) boarded[side].add(state.cards[id]!.definitionId);
    }
  };
  for (let move = 0; move < 2000 && !state.outcome; move++) {
    note();
    const result = apply(
      state,
      {
        actor: decisionPlayer(state),
        expectedRevision: state.revision,
        command: botCommand(state, registry),
      },
      registry,
    );
    if (result.error) throw Error(`seed ${seed}: ${result.error}`);
    state = result.state;
  }
  note();
  return { outcome: state.outcome, seen, boarded };
}

const started = Date.now();
for (let i = 0; i < decks.length; i++)
  for (let j = i + 1; j < decks.length; j++) {
    if (targets.length && !targets.includes(decks[i]!.id) && !targets.includes(decks[j]!.id))
      continue;
    for (let sample = 0; sample < samples; sample++)
      for (const [x, y] of [
        [decks[i]!, decks[j]!],
        [decks[j]!, decks[i]!],
      ] as const)
        for (const first of ["p1", "p2"] as const) {
          const game = play(x, y, seedFor(sample * 1000 + i * 37 + j), first);
          if (game.outcome !== "p1" && game.outcome !== "p2") continue;
          for (const [deck, seat] of [
            [x, "p1"],
            [y, "p2"],
          ] as const) {
            if (!targets.includes(deck.id)) continue;
            const won = game.outcome === seat;
            overall[deck.id]!.games++;
            if (won) overall[deck.id]!.wins++;
            for (const id of new Set(deck.cards)) {
              const entry = (impact[deck.id]![id] ??= {
                withGames: 0,
                withWins: 0,
                withoutGames: 0,
                withoutWins: 0,
                boarded: 0,
              });
              if (game.seen[seat].has(id)) {
                entry.withGames++;
                if (won) entry.withWins++;
                if (game.boarded[seat].has(id)) entry.boarded++;
              } else {
                entry.withoutGames++;
                if (won) entry.withoutWins++;
              }
            }
          }
        }
  }
const pct = (a: number, b: number) => (b ? (100 * a) / b : NaN);
console.log(`${((Date.now() - started) / 1000).toFixed(0)}s, ${samples} samples per pairing`);
for (const deck of targets) {
  const o = overall[deck]!;
  console.log(
    `\n${deck}: ${pct(o.wins, o.games).toFixed(1)}% over ${o.games} games. Win rate with the card seen vs never seen:`,
  );
  const rows = Object.entries(impact[deck]!).map(([id, e]) => ({
    name: registry.cards[id]!.name,
    type: registry.cards[id]!.type,
    copies: decks.find((d) => d.id === deck)!.cards.filter((c) => c === id).length,
    games: e.withGames,
    withRate: pct(e.withWins, e.withGames),
    delta: pct(e.withWins, e.withGames) - pct(e.withoutWins, e.withoutGames),
  }));
  for (const r of rows.sort((p, q) => q.delta - p.delta))
    console.log(
      `  ${r.name.padEnd(30)} ${r.type.padEnd(9)} x${r.copies}  seen in ${String(r.games).padStart(3)} games  ${r.withRate.toFixed(0).padStart(3)}%  ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(0)} pts`,
    );
}
