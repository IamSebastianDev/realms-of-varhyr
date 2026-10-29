import { writeFileSync } from "node:fs";
import { registry, starterDecks, starterDefinitions } from "@realms/content";
import { apply, createMatch, decisionPlayer, validateDeck } from "@realms/core";
import { botCommand } from "@realms/core/bot";
import { setBotWeights, type BotWeights } from "@realms/core/botWeights";
import { seedFor } from "./botlab";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const profiles: Record<string, Partial<BotWeights>> = {
  default: {},
  aggressive: { attack: 3, life: 1.2, openDamage: 6, killBlocker: 1, loseAttacker: 0.5 },
  defensive: { life: 2.6, defense: 1, openDamage: 2, loseAttacker: 1.3 },
  economy: { output: 1.2, colors: 6, hand: 1 },
};
const profile = opt("--profile", "default"),
  samples = Number(opt("--samples", "6")),
  out = opt("--out", `/tmp/bvd-${profile}.json`);
if (!profiles[profile])
  throw new Error(`Unknown profile: ${profile}. Choose ${Object.keys(profiles).join(", ")}.`);
setBotWeights(profiles[profile]!);
const decks = starterDefinitions.filter((d) => !validateDeck(starterDecks[d.id], registry).length);
type T = { w: number; g: number };
const overall: Record<string, T> = Object.fromEntries(decks.map((d) => [d.id, { w: 0, g: 0 }]));
const cards: Record<string, { deck: string; seen: number; stuck: number; boarded: number }> = {};
function play(a: string, b: string, seed: number, first: "p1" | "p2") {
  const ids = [a, b];
  let state = createMatch(registry, [starterDecks[a], starterDecks[b]], seed, { mulligan: true });
  state.active = first;
  const inHand = new Set<string>(),
    boarded = new Set<string>();
  for (let m = 0; m < 2000 && !state.outcome; m++) {
    for (const p of ["p1", "p2"] as const) for (const id of state.players[p].hand) inHand.add(id);
    for (const id in state.cards) if (state.cards[id].zone === "board") boarded.add(id);
    const r = apply(
      state,
      {
        actor: decisionPlayer(state),
        expectedRevision: state.revision,
        command: botCommand(state, registry),
      },
      registry,
    );
    if (r.error) throw Error(r.error);
    state = r.state;
  }
  for (const id of inHand) {
    const c = state.cards[id];
    const deck = ids[c.owner === "p1" ? 0 : 1]!;
    const key = `${deck}:${c.definitionId}`;
    const e = (cards[key] ??= { deck, seen: 0, stuck: 0, boarded: 0 });
    e.seen++;
    if (c.zone === "hand") e.stuck++;
    if (boarded.has(id)) e.boarded++;
  }
  return state.outcome;
}
for (let i = 0; i < decks.length; i++)
  for (let j = i + 1; j < decks.length; j++)
    for (let s = 0; s < samples; s++)
      for (const [x, y] of [
        [decks[i]!, decks[j]!],
        [decks[j]!, decks[i]!],
      ])
        for (const first of ["p1", "p2"] as const) {
          const o = play(x.id, y.id, seedFor(s * 1000 + i * 37 + j), first);
          if (o !== "p1" && o !== "p2") continue;
          overall[x.id]!.g++;
          overall[y.id]!.g++;
          overall[o === "p1" ? x.id : y.id]!.w++;
        }
writeFileSync(out, JSON.stringify({ profile, samples, overall, cards }));
console.log(
  profile,
  Object.entries(overall)
    .map(([k, v]) => `${k}:${((100 * v.w) / v.g).toFixed(0)}`)
    .join(" "),
);
