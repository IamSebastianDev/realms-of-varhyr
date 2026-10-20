/**
 * Searches the bot's weights (packages/core/src/botWeights.ts) by self-play. A candidate plays the current weights on
 * identical seeds and decks, once in each seat; the score is its win share. Run `npm run tune:bot -- --help`.
 *  node --import tsx scripts/tune-bot.ts eval '<weights json>' <firstSample> <samples> [pool]   (worker: prints wins/losses)
 *  node --import tsx scripts/tune-bot.ts tune [rounds] [games] [seed]                           (orchestrator)
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { defaultWeights, type BotWeights } from '../packages/core/src/botWeights';
import { deckPool, play, seedFor } from './botlab';

const [mode, ...args] = process.argv.slice(2);
if (mode === 'eval') {
  const [json, first, count, poolSize] = args, candidate = JSON.parse(json) as Partial<BotWeights>;
  const decks = deckPool(Number(poolSize ?? 24)); let wins = 0, losses = 0;
  for (let i = Number(first); i < Number(first) + Number(count); i++) {
    const seed = seedFor(i), a = decks[i % decks.length], b = decks[(i * 7 + 3) % decks.length];
    for (const seat of ['p1', 'p2'] as const) {
      const winner = play([a, b], seed, { p1: seat === 'p1' ? { weights: candidate } : {}, p2: seat === 'p2' ? { weights: candidate } : {} });
      if (winner === seat) wins++; else if (winner) losses++;
    }
  }
  console.log(JSON.stringify({ wins, losses }));
} else if (mode === 'tune') {
  const rounds = Number(args[0] ?? 20), games = Number(args[1] ?? 60), rng = (() => { let s = Number(args[2] ?? 1) >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
  const gauss = () => Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(2 * Math.PI * rng());
  const keys = Object.keys(defaultWeights) as (keyof BotWeights)[];
  const evaluate = (candidate: BotWeights, first: number, count: number) => Promise.all([0, 1].map(worker => new Promise<{ wins: number; losses: number }>((resolve, reject) => {
    const child = spawn('node', ['--import', 'tsx', 'scripts/tune-bot.ts', 'eval', JSON.stringify(candidate), String(first + worker * (count / 2)), String(count / 2)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; child.stdout.on('data', d => { out += d; }); child.on('close', code => code ? reject(new Error('worker failed')) : resolve(JSON.parse(out.trim().split('\n').pop()!)));
  }))).then(([x, y]) => ({ wins: x.wins + y.wins, losses: x.losses + y.losses }));
  // (1+1) evolution with step-size feedback: a mutated copy of the incumbent replaces it when it beats it on fresh seeds.
  (async () => {
    let best: BotWeights = { ...defaultWeights }, sigma = .15, log: unknown[] = [], first = 1000;
    for (let round = 1; round <= rounds; round++) {
      const candidate = { ...best } as BotWeights;
      for (const key of keys) if (rng() < .4) candidate[key] = Number((best[key] * Math.exp(sigma * gauss())).toFixed(3));
      const { wins, losses } = await evaluate(candidate, first, games); first += games;
      const share = wins / Math.max(1, wins + losses), accepted = share > .55;
      log.push({ round, share: Number(share.toFixed(3)), accepted, sigma: Number(sigma.toFixed(3)) });
      console.log(`round ${round}: ${(100 * share).toFixed(1)}% ${accepted ? 'ACCEPT' : 'reject'} (sigma ${sigma.toFixed(2)})`);
      if (accepted) { best = candidate; sigma = Math.min(.4, sigma * 1.2); } else sigma = Math.max(.04, sigma * .9);
      writeFileSync('/tmp/claude-0/bot-tune.json', JSON.stringify({ best, log }, null, 1));
    }
    console.log(JSON.stringify(best));
  })();
}
