/** Reproducible tactical screening and paired, seat-swapped matches. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { repoRoot } from "./repoRoot";
import { registry, starterDefinitions } from "@realms/content";
import {
  apply,
  assertInvariants,
  createMatch,
  decisionPlayer,
  legalActions,
  other,
  RULES_VERSION,
} from "@realms/core";
import { botCommand } from "@realms/core/bot";
import { searchDecision, defaultSearchOptions, type SearchOptions } from "@realms/core/botSearch";
import type { Command, GameState, PlayerId } from "@realms/contracts";
import { benchmarkCases } from "./bot-benchmark/cases";
import { splitFor } from "./bot-benchmark/split";
import { seedFor } from "./botlab";
const [mode = "tactics", countArg = "16", firstArg = "9000", path, settings, ...extra] =
  process.argv.slice(2);
const options: Partial<SearchOptions> = settings ? JSON.parse(settings) : {};
const timing: Record<string, number[]> = { baseline: [], search: [], searchPlanning: [] };
const nodes: number[] = [];
function choose(s: GameState, variant: "baseline" | "search"): Command {
  const start = performance.now();
  const result = variant === "search" ? searchDecision(s, registry, options) : null;
  const command = result?.command ?? botCommand(s, registry);
  timing[variant].push(performance.now() - start);
  if (variant === "search" && result?.transitions) {
    nodes.push(result.transitions);
    timing.searchPlanning.push(performance.now() - start);
  }
  return command;
}
function act(s: GameState, command: Command) {
  const result = apply(
    s,
    { actor: decisionPlayer(s), expectedRevision: s.revision, command },
    registry,
  );
  if (result.error) throw new Error(`${JSON.stringify(command)}: ${result.error}`);
  assertInvariants(result.state);
  return result.state;
}
function times() {
  return Object.fromEntries(
    Object.entries(timing).map(([key, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [
        key,
        {
          decisions: values.length,
          meanMs: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
          p50Ms: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
          p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
          maxMs: sorted.at(-1) ?? 0,
        },
      ];
    }),
  );
}
async function main() {
  if (extra.length)
    throw new Error(
      "Use matches [pairs] [first sample] [output.json] [settings JSON]; the opponent is the heuristic fallback.",
    );
  if (path) await mkdir(dirname(resolve(path)), { recursive: true });
  const hash = createHash("sha256");
  for (const file of ["bot.ts", "botSearch.ts", "botSearchWorld.ts", "botWeights.ts"])
    hash.update(await readFile(join(repoRoot, "packages/core/src", file)));
  const metadata = {
    experiment: "turn-plans",
    opponent: "heuristic",
    rulesVersion: RULES_VERSION,
    contentVersion: registry.version,
    sourceFingerprint: hash.digest("hex"),
    options: { ...defaultSearchOptions, ...options },
  };
  let report: unknown;
  if (mode === "tactics") {
    const results = benchmarkCases(registry)
      .filter((c) => splitFor(c.id) === "development")
      .map((item) => {
        const result: Record<string, boolean | string | number> = {
          id: item.id,
          title: item.title,
        };
        for (const variant of ["baseline", "search"] as const) {
          let s = structuredClone(item.state);
          let commands = 0;
          try {
            while (!s.outcome && commands < 32 && s.turn === item.state.turn) {
              if (decisionPlayer(s) === other(item.actor)) {
                if (s.responseStep && !s.pending && legalActions(s, registry).canEnd)
                  s = act(s, { type: "end" });
                else break;
              } else {
                s = act(s, choose(s, variant));
                commands++;
              }
              if (item.passes(s)) break;
            }
            result[variant] = item.passes(s);
          } catch (error) {
            result[variant] = String(error);
          }
        }
        console.log(JSON.stringify(result));
        return result;
      });
    report = {
      mode,
      ...metadata,
      results,
      passed: {
        baseline: results.filter((r) => r.baseline === true).length,
        search: results.filter((r) => r.search === true).length,
        total: results.length,
      },
      timing: times(),
    };
  } else if (mode === "matches") {
    const count = Number(countArg),
      first = Number(firstArg);
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000 || !Number.isSafeInteger(first))
      throw new Error("Expected a positive pair count and an integer first sample.");
    const results: unknown[] = [];
    let wins = 0,
      losses = 0,
      draws = 0,
      unfinished = 0;
    for (let sample = first; sample < first + count; sample++) {
      const a = starterDefinitions[sample % starterDefinitions.length];
      const b =
        starterDefinitions[
          (Math.floor(sample / starterDefinitions.length) + sample * 3 + 1) %
            starterDefinitions.length
        ];
      const seed = seedFor(sample);
      for (const seat of ["p1", "p2"] as PlayerId[]) {
        let state = createMatch(registry, [a.cards, b.cards], seed, { mulligan: true });
        let commands = 0;
        for (; commands < 800 && !state.outcome; commands++) {
          const variant = decisionPlayer(state) === seat ? "search" : "baseline";
          try {
            state = act(state, choose(state, variant));
          } catch (error) {
            throw new Error(
              `sample=${sample}, seat=${seat}, command=${commands}: ${String(error)}`,
            );
          }
        }
        if (state.outcome === seat) wins++;
        else if (state.outcome === other(seat)) losses++;
        else if (state.outcome) draws++;
        else unfinished++;
        const row = {
          sample,
          seed,
          seat,
          decks: [a.id, b.id],
          winner: state.outcome,
          turns: state.turn,
          commands,
        };
        results.push(row);
        console.log(JSON.stringify({ ...row, score: `${wins}-${losses}-${draws}`, unfinished }));
        // Keep a complete partial report if a long experiment is interrupted.
        if (path)
          await writeFile(
            path,
            JSON.stringify(
              { mode, ...metadata, wins, losses, draws, unfinished, timing: times(), results },
              null,
              2,
            ) + "\n",
          );
      }
    }
    report = {
      mode,
      ...metadata,
      wins,
      losses,
      draws,
      unfinished,
      timing: times(),
      maxTransitions: nodes.reduce((max, n) => Math.max(max, n), 0),
      results,
    };
  } else
    throw new Error("Use tactics or matches [pairs] [first sample] [output.json] [settings JSON].");
  if (path) await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  const { results: _results, ...summary } = report as Record<string, unknown>;
  console.log(JSON.stringify(summary, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
