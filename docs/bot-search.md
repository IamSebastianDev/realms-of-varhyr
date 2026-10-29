# Turn-plan opponent

Practice matches use the deterministic planner in `packages/core/src/botSearch.ts`, running in a browser worker. It uses the real rules engine, with no model runtime, downloads or training step. Card content and rules are unchanged by the planner.

## Runtime

- `packages/core/src/botSearch.ts`: turn plans, coordinated attacks, candidate evaluation and bounded opponent replies.
- `packages/core/src/botSearchWorld.ts`: reproducible hypothetical hidden states and the information-safe fallback entry point.
- `packages/core/src/bot.ts`: specialized choices and responses, worker-failure fallback and inexpensive simulation baseline. Its configurable weights are in `botWeights.ts`.
- `apps/web/src/features/match/lib/browserBot.ts` and `bot.worker.ts`: lazy worker creation, decision caching, timeout/failure recovery and disposal.

The planner explores card plays and activations with complete energy payments. Replacement abilities such as Trade are previewed through the engine rather than assumed to have only their printed output. Candidate turns are resolved through combat and cleanup before scoring, so temporary buffs, energy exhaustion and lane trades have their real consequences.

A small beam retains candidates favoring material, economy or survival. Shortlisted turns face a bounded opponent reply in two sampled hidden worlds. Scores combine their mean with a cautious worst case. Only the first command is returned; after each actual action or choice the bot plans again. This is beam search, not MCTS or a learned opponent.

Both libraries are reordered without using the live seed/RNG. Enemy hidden identities are replaced using publicly demonstrated factions and catalogue copy limits. The bot knows its own unordered library composition. Current-turn event counters are retained for abilities such as Accord; private identities and messages are removed from sampled event history.

Mandatory choices normally use specialized heuristics. Before following them, an engine check catches immediate wins from targeted damage, Reprise, its free cast and a following Kindle choice. The same check runs during planning and actual decisions. Draw choices retain a discard alternative when it immediately improves the evaluated position, such as a Dirge buff; otherwise they favor bottoming and preserve search space. Preview transitions count against the existing budgets.

`BrowserBot` uses one worker per local match. The loopback room accepts asynchronous answers and ignores stale results after state changes, animation holds or leaving. Worker failures fall back for the rest of that match. Tutorial scripts take precedence; hotseat, human online play and replay viewing do not use this worker.

## Checks and comparisons

```sh
# Core planner regressions, including hidden-information independence and budgets.
npm run test -w @realms/tools -- --run tests/botSearch.test.ts

# All 31 tactical reference plans must remain legal and meet their objectives.
npm run test -w @realms/tools -- --run tests/botBenchmark.test.ts

# Current planner vs heuristic on the 21 development exercises.
npm run compare:bot -w @realms/tools -- tactics

# Sixteen deck/shuffle pairs, each played with the planner in both seats.
npm run compare:bot -w @realms/tools -- matches 16 36000 /tmp/rov-bot-comparison.json

# Optional settings override; defaults remain unchanged.
npm run compare:bot -w @realms/tools -- matches 16 37000 /tmp/rov-bot-small.json '{"transitions":300,"replyTransitions":100}'
```

The comparison command retains seeds, starter IDs, seats, outcomes, timing, search settings, rules/content versions and a source fingerprint. It checks every engine command and invariant, saves progress after each game, and separately counts draws and unfinished games. Use a single process for latency comparisons. Results against the heuristic do not establish strength against an experienced player or a previous planner revision.

`tools/src/bot-benchmark/` holds engine fixtures and reference plans, independent of any model or review UI. `split.ts` keeps ten exercises out of development screens. These reference objectives validate specific tactics rather than optimal strategy; one development exercise requests a mutual trade that the bot currently declines.

The planner regressions cover complete payments, Trade-funded lethal, coordinated Guards, draw choices, declining a trade that exposes lethal, Dirge discard lethal, Kindle target priority, Reprise/free-cast target consistency, and avoiding a library loss before damage resolves. Worker and loopback tests cover crashes, cancellation and late answers. Add a concrete state and outcome check when a playtest exposes a new mistake.

## Limits

- A restricted beam and short reply horizon can prune setup plays or multi-card combinations.
- Evaluation values material, life, hand size and sustainable energy; it does not fully understand faction plans or energy-color demand.
- Two hypothetical worlds provide approximate uncertainty, not an opponent deck model.
- Beyond immediate-win checks, specialized choices retain heuristic shortcuts. Future graveyard setup without an immediate evaluation gain can still be missed.
- Transition budgets bound explicit expansion; specialized helpers may do additional internal evaluation. Device latency is not guaranteed.
