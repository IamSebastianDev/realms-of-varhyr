# Banners of the Crown: first-player and balance audit

Run date: 11 October 2026. Authored 30-card starter, 12 card definitions. The live cards, deck and rules were not adjusted.

## First-player result

Across **2,000 mirror games**, the starting player won **936 (46.8%)** and the second player won **1,064 (53.2%)**. No draws or unfinished games. The approximate paired 95% interval for first-player wins is **45.4–48.2%**. This sample supports a modest second-player advantage, not a first-player advantage.

Each of 1,000 spread 32-bit seeds was played twice with the same shuffled libraries and initial hands. The second run changed only the initial active player. In both runs, the starting player skipped the initial draw as in the live game. The confidence interval treats each two-game seed as one sampling block; the 2,000 games are not assumed independent.

Of the seed pairs, the first player won both orders in 74, the second player won both in 138, and the same original hand/library owner won both games in 788. Thus much of the outcome follows the draw sequence rather than the seat.

## Tempo and energy signals

- Average length: **12.2 individual player turns**, approximately six rounds. Median 11; 10th–90th percentile 7–19. 43.1% ended by turn 10.
- **96.8%** ended through life loss, **3.1%** through library exhaustion.
- The player dealing the first positive damage to opposing life won **89.8%** of 1,994 games with life damage.
- The first player to deploy **Ban Vale Cavalry** won **88.6%** of 1,652 games where Cavalry was deployed. Its three-energy 3/3 body combines a +2 global creature Attack aura, +1 adjacent Attack, and two energy output. This is a strong candidate for targeted testing.
- When exactly one initial five-card hand contained a zero-cost creature, its owner won **85.2%** of 366 games. This uses the initial hands, before the second player's first draw choice.
- **52.8%** of destroyed, deployed creatures had never channeled energy (7,252/13,735). Some were deliberately used as attackers or blockers; this does not mean every one died before an opportunity to channel.

These are correlations. Being first to deploy Cavalry or deal damage can reflect an already stronger position. They suggest snowballing, but do not by themselves prove that aggression or one card causes the wins. A lack of first-player advantage does not rule out excessive aggression. The second player also gets a draw choice before its first deployment; that is a plausible contributor to its advantage, not a separately tested causal explanation.

## Temporary experiments

Each row below uses the same 500 seeds (1,000 games), so the baseline row is the matching subset of the larger audit. Only in-memory card definitions changed; all game rules, deck counts and bot code remained identical.

| Experiment                                   | First wins | Average turns | Library endings | First Cavalry deployer wins |
| -------------------------------------------- | ---------: | ------------: | --------------: | --------------------------: |
| Authored deck                                |      46.0% |          12.3 |            3.4% |                       88.0% |
| Every War Banner gives 1 less Attack         |      48.0% |          14.4 |           10.3% |                       82.4% |
| +1 Defense on every zero-cost creature       |      45.8% |          12.7 |            5.4% |                       85.2% |
| +1 output energy on every zero-cost creature |      52.3% |          13.2 |            8.7% |                       73.7% |

The banner experiment reduced every `war-banner` amount by one, omitting bindings that reached zero; Cavalry retained its adjacent aura. The Defense experiment added one Defense to all zero-cost creatures, including Recruit and Merchant. The energy experiment added one to each existing positive output entry on those same creatures (usual producers 1→2, Merchant 2→3).

Extra energy substantially broadened the bot’s use of expensive cards: Crown Bastion was played 345 times in its 1,000-game run, compared with 141 across the full 2,000-game baseline; Battlefield Hymn 557 times versus 290. These counts include repeat copies and both players, and are descriptive rates from the larger baseline, not the exact matched subset.

I would test energy supply and Cavalry’s global aura separately before adding a rule to compensate the starting player. Extra energy made Cavalry less predictive of the winner and made tanks and draw spells more accessible. Broadly weakening attack banners lengthened games more, but increased library endings to 10.3%. Adding one Defense to free creatures had a smaller effect on Cavalry dominance. None of the experiments establishes a final balanced configuration.

## Validation and limits

5,000 games across the full baseline and three experiments completed through normal engine commands. Every applied command passed and every resulting state passed engine invariants; sampled games in both starting orders also replayed exactly. The audit script passes the project TypeScript check.

This is deterministic heuristic bot self-play, not human win-rate data or an optimal-play result. The bot values creature Attack at 2 per point and Defense at 0.65 per point, always attacks with every legal positive-Attack creature, and plans deployments/payments with a shallow state evaluation. That can amplify offensive preferences and undervalue future defensive benefits. These findings are specific to the Crown mirror and this bot, not to other factions or archetypes.

## Reproduce

```sh
npm run audit:balance -- --pairs 1000
npm run audit:balance -- --pairs 500 --variant less-banner-attack
npm run audit:balance -- --pairs 500 --variant sturdier-producers
npm run audit:balance -- --pairs 500 --variant more-producer-energy
```

Use `--deck <starter-id>` to select another starter and `--out <path>` to change the JSON report path. Generated reports snapshot the deck, card definitions, content/rules versions and per-game outcomes.

Raw reports: [baseline](first-player-baseline.json), [matched comparison](first-player-comparison.json), [weaker banners](first-player-less-banner-attack.json), [tougher producers](first-player-sturdier-producers.json), [more energy](first-player-more-producer-energy.json).

## Formation 2 follow-up

Ban Vale Cavalry now has only **Formation 2** (`adjacent-banner`, amount 2); the old global +2 and adjacent +1 bindings were replaced. Other card gameplay data, deck contents, rules and bot code match the baseline. The displayed ability name is now Formation; its internal ID stays compatible.

In 500 paired seeds (1,000 matches), first and second each won **500 games (50.0%)**. The paired 95% interval is **47.7–52.3%**. All matches finished, all engine commands and invariants passed, and sampled replays matched.

Against the same 500 baseline seeds, average length increased from **12.3 to 14.5 player turns**; first Cavalry deployer wins fell from **88.0% to 80.5%** among games where Cavalry appeared. Library endings increased from **3.4% to 10.0%**. This is encouraging for seat symmetry and reducing the global Attack snowball, but the bot still wins disproportionately after deploying Cavalry first and the longer games produce more library losses. These remain bot self-play results, not proof of human balance.

The 166-test suite and production build pass. [Formation 2 raw report](first-player-formation-2.json).
