# Quest mode: implementation notes

Companion to quest-mode-design.md and `docs/quests.md`. Updated 2026-10-18.

## Status
The expedition rework is implemented: engine (`packages/quest`), web screens (`apps/web/src/features/quest`) and the studio map editor. The old daily mode is gone. Saved v1 runs are converted on load (`migrateRun`).

## Map rules (decided 2026-10-18)
- All nodes in `assets/quest/map.json` are hand-placed and stable: city, village, shrine, ruin, waymark, arena, capital, landmark. A node can be flagged as a start site or a boss site.
- Travel locations (encounter, roadside camp, traveling merchant, cache) are never hand-placed. Each expedition generates them at random inside the placement areas ("safe areas", polygons painted in the studio), from the run seed, so a reload cannot move or reroll them. Count comes from the density filter: `settings.density` places per 10% of the map's area that the zones allow (default 3), kept `settings.spacing` apart (default 5% of the map width); `placeCount(map)`. The studio's Travel locations section has both sliders and a Generate example button that shows what an expedition would get. Type is rolled on the first visit and saved. Maps without areas get no travel locations. Older files that placed transient nodes are read without them.
- Affiliation of any generated place (travel locations, task destinations) comes from the projected area: each node claims land out to its reach (kind factor times `borderReach` times a per-node factor `reach`), ground nobody reaches is neutral. It is the same power diagram the studio draws as territories (`affiliationAt`).
- Per-node projection: `reach` on a node (0.2 to 4, default 1), saved in map.json, slider in the studio inspector.
- Placement is layered zones (`placement.zones`, each `allow` or `block`). A point takes the mode of the last zone containing it, so a lake can be blocked inside allowed land and an island allowed again inside the lake; uncovered ground is not allowed. Without any allowed zone, task destinations fall back to land near existing nodes (never inside a blocked zone) and no travel locations are generated. Older files with plain `polygons` read as allow zones. Task destinations (rumors) use the same rule via `validPlacement`.

## Rework plan status
1. Engine: done (silver, no day seed or fee or expiry, village, smith, four travel types, caches).
2. Rumors and quests: done (accepted quest saves a destination, pays once on clearing).
3. Placement data in the studio and parser: done, plus generated travel locations.
4. Reward receipts per boss and quest: done (`questPayouts`, idempotent `applyPayouts`); the final purchase transaction (`questSettlements`) is unchanged.
5. Difficulty from wins and card grade: first version, formula still to tune.
6. UI: done for start, retire, resume, purchase gate, quest log, rumors, smith, camps, caches. Silver coin art and German strings are open.
7. Legacy save transition policy: open (currently converted silently).

## Studio
The Card Studio now uses the game's black and bronze look (plate with bracket corners, bronze chrome buttons, serif headings; tokens mirror `apps/web/src/app/styles/plate.css`). The map tool has: select, add node, zone tool (P, B switches Allow/Block, order can be changed), land and sample-places toggles, per-node projection, boss/start flags, overview with warnings.

## Persistence worth keeping
`questSettlements` receipts hold final deck copy counts, remaining silver budget, purchased copies, revision and closed state; account rewards and receipts share one storage write; closing is recorded before the active run is cleared; fight reports are acknowledged after the run is saved.

Tuning values live in `packages/quest/src/rules.ts`.
