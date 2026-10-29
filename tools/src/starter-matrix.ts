import { readFileSync } from "node:fs";
import { registry, starterDefinitions } from "@realms/content";
import { apply, assertInvariants, createMatch, decisionPlayer, validateDeck } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import { setBotWeights } from "@realms/core/botWeights";
import type { PlayerId } from "@realms/contracts";

// Round robin between every complete starter deck, played by the bot. Each sample is played four times:
// both decks in both seats, and in each arrangement either seat starting. Same seed means the same shuffles.
const args = process.argv.slice(2);
const option = (name: string, fallback: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const samples = Number(option("--samples", "50"));
// --weights '{"depth":1}' plays with other bot weights (see botWeights.ts); the default is the shipped bot.
setBotWeights(JSON.parse(option("--weights", "{}")));
// What-if options for balance work; nothing is written back to the game's content.
//   --replace id=deck.json  plays that deck (a saved "varhyr-deck" file) in place of the starter with this id
//   --cost id=N             changes a card's generic energy cost
//   --only id               plays only the pairings that include this starter
for (const flag of args.flatMap((a, i) => (a === "--cost" ? [args[i + 1]!] : []))) {
  const [id, cost] = flag.split("=");
  registry.cards[id!]!.cost.generic = Number(cost);
}
const replacements = Object.fromEntries(
  args.flatMap((a, i) => {
    if (a !== "--replace") return [];
    const [id, file] = args[i + 1]!.split("=");
    const saved = JSON.parse(readFileSync(file!, "utf8")) as {
      cards: { id: string; count: number }[];
    };
    return [[id!, saved.cards.flatMap((c) => Array<string>(c.count).fill(c.id))]];
  }),
);
const only = option("--only", "");
const decks = starterDefinitions
  .map((deck) => (replacements[deck.id] ? { ...deck, cards: replacements[deck.id]! } : deck))
  .filter((deck) => !validateDeck(deck.cards, registry).length);
const seedFor = (sample: number) => {
  let seed = (sample + 0x9e3779b9) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
  seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35);
  return (seed ^ (seed >>> 16)) >>> 0;
};
type Tally = { wins: number; losses: number; draws: number; games: number };
const tally = () => ({ wins: 0, losses: 0, draws: 0, games: 0 }) as Tally;
const total: Record<string, Tally> = Object.fromEntries(decks.map((d) => [d.id, tally()]));
const versus: Record<string, Record<string, Tally>> = {};
for (const a of decks) {
  versus[a.id] = {};
  for (const b of decks) if (a.id !== b.id) versus[a.id][b.id] = tally();
}
let firstWins = 0,
  decided = 0,
  turns = 0,
  games = 0,
  unfinished = 0;
const reasons: Record<string, number> = {};
const bySeat = { p1: 0, p2: 0 };

function play(a: string[], b: string[], seed: number, first: PlayerId) {
  const state0 = createMatch(registry, [a, b], seed, { mulligan: true });
  state0.active = first;
  let state = state0;
  for (let move = 0; move < 2000 && !state.outcome; move++) {
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
  assertInvariants(state);
  return state;
}
const started = Date.now();
for (let i = 0; i < decks.length; i++)
  for (let j = i + 1; j < decks.length; j++)
    for (
      let sample = 0;
      sample < (only && decks[i]!.id !== only && decks[j]!.id !== only ? 0 : samples);
      sample++
    )
      for (const [x, y] of [
        [decks[i], decks[j]],
        [decks[j], decks[i]],
      ])
        for (const first of ["p1", "p2"] as const) {
          const seed = seedFor(sample * 1000 + i * 37 + j);
          const state = play(x.cards, y.cards, seed, first);
          games++;
          if (!state.outcome) {
            unfinished++;
            continue;
          }
          turns += state.turn;
          reasons[state.outcomeReason ?? "?"] = (reasons[state.outcomeReason ?? "?"] ?? 0) + 1;
          for (const [id, other, seat] of [
            [x.id, y.id, "p1"],
            [y.id, x.id, "p2"],
          ] as const) {
            const mine = [total[id], versus[id][other]];
            for (const t of mine) t.games++;
            if (state.outcome === "draw") for (const t of mine) t.draws++;
            else if (state.outcome === seat) {
              for (const t of mine) t.wins++;
              bySeat[seat]++;
            } else for (const t of mine) t.losses++;
          }
          if (state.outcome !== "draw") {
            decided++;
            if (state.outcome === first) firstWins++;
          }
        }
const pct = (t: Tally) => (t.games ? ((100 * (t.wins + t.draws / 2)) / t.games).toFixed(1) : "-");
console.log(
  `${games} games, ${samples} samples per pairing, ${((Date.now() - started) / 1000).toFixed(0)}s`,
);
console.log(
  `unfinished ${unfinished}; first player wins ${((100 * firstWins) / decided).toFixed(1)}%; average length ${(turns / (games - unfinished)).toFixed(1)} turns; ends: ${JSON.stringify(reasons)}`,
);
console.log("\nOverall win rate (draws count half):");
for (const d of decks.slice().sort((p, q) => Number(pct(total[q.id])) - Number(pct(total[p.id]))))
  console.log(
    `  ${d.id.padEnd(8)} ${pct(total[d.id]).padStart(5)}%   (${total[d.id].wins}W ${total[d.id].losses}L ${total[d.id].draws}D)`,
  );
console.log("\nRow deck's win rate against column deck:");
console.log("         " + decks.map((d) => d.id.padStart(8)).join(" "));
for (const a of decks)
  console.log(
    a.id.padEnd(8) +
      " " +
      decks
        .map((b) => (a.id === b.id ? "       -" : pct(versus[a.id][b.id]).padStart(8)))
        .join(" "),
  );
