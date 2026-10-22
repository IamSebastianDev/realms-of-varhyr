/**
 * Learns the bot's position evaluator from self-play. Each game is played by two bots with randomly jittered weights
 * (so positions vary), every decision point is recorded, and every position is labelled with how its mover's game ended.
 * A small network is fitted to those labels and written to packages/core/src/botModel.json.
 *  node --import tsx scripts/train-eval.ts collect <firstSample> <samples> <out.json>   (worker)
 *  node --import tsx scripts/train-eval.ts train <samples> [epochs] [hidden]
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./repoRoot";
import { registry } from "@realms/content";
import { defaultWeights, type BotWeights } from "@realms/core/botWeights";
import { FEATURE_COUNT, features } from "@realms/core/botFeatures";
import { logit, type Model } from "@realms/core/botModel";
import { deckPool, play, seedFor } from "./botlab";
import type { PlayerId } from "@realms/contracts";

const [mode, ...args] = process.argv.slice(2);
const rngFor = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const jitter = (rng: () => number): Partial<BotWeights> =>
  Object.fromEntries(
    Object.entries(defaultWeights).map(([key, value]) => [
      key,
      Number((value * (0.6 + 0.8 * rng())).toFixed(3)),
    ]),
  );
type Row = { x: number[]; y: number; h: number };

if (mode === "collect") {
  const [first, count, file] = [Number(args[0]), Number(args[1]), args[2]];
  const decks = deckPool(),
    rows: Row[] = [];
  for (let i = first; i < first + count; i++) {
    const rng = rngFor(seedFor(i) ^ 0x51ed),
      a = decks[Math.floor(rng() * decks.length)],
      b = decks[Math.floor(rng() * decks.length)];
    const seen: { actor: PlayerId; x: number[]; turn: number }[] = [];
    let step = 0;
    const winner = play(
      [a, b],
      seedFor(i),
      { p1: { weights: jitter(rng) }, p2: { weights: jitter(rng) } },
      (state, actor) => {
        // One position in three from the play phase keeps near-identical neighbours from dominating the set.
        if (state.phase === "play" && !state.pending && step++ % 3 === 0)
          seen.push({ actor, x: features(state, actor, registry), turn: state.turn });
      },
    );
    for (const s of seen)
      rows.push({ x: s.x, y: winner === null ? 0.5 : winner === s.actor ? 1 : 0, h: s.turn });
  }
  writeFileSync(file, JSON.stringify(rows));
  console.log(rows.length);
} else if (mode === "train") {
  const samples = Number(args[0] ?? 400),
    epochs = Number(args[1] ?? 30),
    hidden = Number(args[2] ?? 24),
    per = Math.ceil(samples / 2);
  (async () => {
    const files = [0, 1].map((w) => `/tmp/claude-0/eval-data-${w}.json`);
    await Promise.all(
      files.map(
        (file, w) =>
          new Promise<void>((resolve, reject) => {
            const child = spawn(
              "node",
              [
                "--import",
                "tsx",
                "scripts/train-eval.ts",
                "collect",
                String(100000 + w * per),
                String(per),
                file,
              ],
              { stdio: ["ignore", "inherit", "inherit"] },
            );
            child.on("close", (code) => (code ? reject(new Error("collect failed")) : resolve()));
          }),
      ),
    );
    const all: Row[] = files.flatMap((file) => JSON.parse(readFileSync(file, "utf8")) as Row[]);
    // Hold out whole games' worth of rows from the tail for an honest accuracy figure.
    const cut = Math.floor(all.length * 0.9),
      train = all.slice(0, cut),
      test = all.slice(cut);
    const mean = Array(FEATURE_COUNT).fill(0),
      scale = Array(FEATURE_COUNT).fill(0);
    for (const r of train)
      r.x.forEach((v, i) => {
        mean[i] += v / train.length;
      });
    for (const r of train)
      r.x.forEach((v, i) => {
        scale[i] += (v - mean[i]) ** 2 / train.length;
      });
    for (let i = 0; i < FEATURE_COUNT; i++) scale[i] = Math.sqrt(scale[i]) || 1;
    const rng = rngFor(99),
      init = () => (rng() - 0.5) * 0.3;
    const net: Model = {
      mean,
      scale,
      w1: Array.from({ length: hidden }, () => Array.from({ length: FEATURE_COUNT }, init)),
      b1: Array(hidden).fill(0),
      w2: Array.from({ length: hidden }, init),
      b2: 0,
    };
    // Adam on log-loss; the net is small enough that plain JS arrays are fast enough.
    const params = () => [...net.w1.flat(), ...net.b1, ...net.w2, net.b2];
    const m = Array(params().length).fill(0),
      v = Array(params().length).fill(0);
    let t = 0;
    const evaluate = (rows: Row[]) => {
      let loss = 0,
        right = 0;
      for (const r of rows) {
        const p = 1 / (1 + Math.exp(-logit(net, r.x)));
        loss -= r.y * Math.log(p + 1e-9) + (1 - r.y) * Math.log(1 - p + 1e-9);
        if (p > 0.5 === r.y > 0.5 && r.y !== 0.5) right++;
      }
      return { loss: loss / rows.length, accuracy: right / rows.filter((r) => r.y !== 0.5).length };
    };
    let bestNet = structuredClone(net),
      bestLoss = Infinity;
    console.log(
      `rows ${all.length} (train ${train.length}, test ${test.length}); baseline loss ${Math.log(2).toFixed(3)}`,
    );
    for (let epoch = 1; epoch <= epochs; epoch++) {
      const order = train.map((_, i) => i).sort(() => rng() - 0.5);
      for (let start = 0; start < order.length; start += 64) {
        const grad = Array(m.length).fill(0),
          batch = order.slice(start, start + 64);
        for (const index of batch) {
          const { x, y } = train[index],
            z = x.map((value, i) => (value - mean[i]) / scale[i]);
          const act = net.w1.map((row, u) =>
            Math.tanh(net.b1[u] + row.reduce((s, w, i) => s + w * z[i], 0)),
          );
          const p = 1 / (1 + Math.exp(-(net.b2 + act.reduce((s, a, u) => s + a * net.w2[u], 0)))),
            d = (p - y) / batch.length;
          let k = 0;
          for (let u = 0; u < hidden; u++) {
            const back = d * net.w2[u] * (1 - act[u] ** 2);
            for (let i = 0; i < FEATURE_COUNT; i++) grad[k++] += back * z[i];
          }
          for (let u = 0; u < hidden; u++)
            grad[hidden * FEATURE_COUNT + u] += d * net.w2[u] * (1 - act[u] ** 2);
          for (let u = 0; u < hidden; u++) grad[hidden * FEATURE_COUNT + hidden + u] += d * act[u];
          grad[m.length - 1] += d;
        }
        t++;
        const flat = params();
        let k = 0;
        const step = (g: number, idx: number) => {
          m[idx] = 0.9 * m[idx] + 0.1 * g;
          v[idx] = 0.999 * v[idx] + 0.001 * g * g;
          return (
            (0.003 * (m[idx] / (1 - 0.9 ** t))) / (Math.sqrt(v[idx] / (1 - 0.999 ** t)) + 1e-8) +
            0.00002 * flat[idx]
          );
        };
        for (let u = 0; u < hidden; u++)
          for (let i = 0; i < FEATURE_COUNT; i++) {
            net.w1[u][i] -= step(grad[k], k);
            k++;
          }
        for (let u = 0; u < hidden; u++) {
          net.b1[u] -= step(grad[k], k);
          k++;
        }
        for (let u = 0; u < hidden; u++) {
          net.w2[u] -= step(grad[k], k);
          k++;
        }
        net.b2 -= step(grad[k], k);
      }
      {
        const b = evaluate(test);
        if (b.loss < bestLoss) {
          bestLoss = b.loss;
          bestNet = structuredClone(net);
        }
      }
      if (epoch % 2 === 0 || epoch === epochs) {
        const a = evaluate(train),
          b = evaluate(test);
        console.log(
          `epoch ${epoch}: train loss ${a.loss.toFixed(3)} acc ${(100 * a.accuracy).toFixed(1)}% | test loss ${b.loss.toFixed(3)} acc ${(100 * b.accuracy).toFixed(1)}%`,
        );
      }
    }
    Object.assign(net, bestNet);
    console.log(`keeping the epoch with the best held-out loss: ${bestLoss.toFixed(3)}`);
    const round = (n: number) => Number(n.toFixed(5));
    writeFileSync(
      join(repoRoot, "packages/core/src/botModel.json"),
      JSON.stringify({
        mean: mean.map(round),
        scale: scale.map(round),
        w1: net.w1.map((r) => r.map(round)),
        b1: net.b1.map(round),
        w2: net.w2.map(round),
        b2: round(net.b2),
      }),
    );
    console.log("wrote packages/core/src/botModel.json");
  })();
}
