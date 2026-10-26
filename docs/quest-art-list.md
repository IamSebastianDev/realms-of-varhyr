# Quest mode: art list

Status 2026-10-18. What the expedition needs painted, in the order it pays off. Drop finished files in `public/quest/art/` (the game already looks there; nothing else to wire up for the location pieces).

## Format (all location pieces)

- Landscape WebP, 1600 x 672 (about 2.4:1). The dialog shows it about 210 px tall and crops with "cover", so keep the subject inside the middle 60% of the height and leave the edges as atmosphere.
- Same hand as the cards: traditional oil painting, visible brush work, muted earth pigments, believable medieval materials. No text, no frame, no UI, no logos, no glossy or CGI look.
- No people looking at the camera; figures small and in the middle distance, so one faction variant can reuse a composition.
- Lookup order: `<role>-<faction>.webp`, then `<role>.webp`, then the painted placeholder. So every generic piece below is useful on its own, and a faction piece only needs to exist where it adds something.

## Priority 1: generic pieces (13). Covers every place in the game.

| File           | Subject                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| encounter.webp | A dead campfire and trampled grass at a roadside clearing, signs of a hurried camp; something watching from the treeline |
| camp.webp      | Travellers' camp by the road at dusk, warm fire, a kettle, a cart; the one safe-looking place                            |
| merchant.webp  | A laden cart pulled off the road, awnings, crates and hanging goods, a lantern; the trader seen from behind              |
| cache.webp     | A half-buried chest or stash under a cairn or root, disturbed earth, moss; quiet, slightly eerie                         |
| city.webp      | A walled trade city from the approach road, smoke, stalls at the gate                                                    |
| village.webp   | A few thatched houses, chimney smoke, a well, a noticeboard                                                              |
| shrine.webp    | A small roadside shrine with offerings, candles, ribbons, old stone                                                      |
| ruin.webp      | Broken columns and a fallen arch overgrown with ivy, light through the gap                                               |
| waymark.webp   | A carved signpost or standing stone at a crossroads, carved by many hands                                                |
| arena.webp     | A walled fighting ring of packed earth with banners, empty, before the crowd arrives                                     |
| capital.webp   | A faction seat seen from below, towers and banners, the grandest thing on the road                                       |
| landmark.webp  | An old, singular feature the songs name: a lone tower on a hill in evening light                                         |
| boss.webp      | A hostile stronghold, gates closed, dark sky, a single lit window                                                        |

## Priority 2: faction pieces (42)

Capital and boss for all nine owners (including Neutral), city, village and shrine for the eight factions (Neutral falls back to the generic piece).

| Faction         | Look to carry through                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Crownlands      | Golden stone, pennants, orderly roads, royal blue and gold              |
| Bright Marches  | Whitewashed timber, hearth light, marsh lanterns, warm and rural        |
| Ember Fields    | Scorched earth, black stone and glowing seams, ash plumes, orange light |
| Conclave        | Libraries, green glass, sealed doors, lamplit and cool                  |
| Mountain Clans  | Cut stone, high passes, heavy timbers, hammers, cold light              |
| Northern League | Brick harbours, dykes and windmills, grey-blue North Sea light          |
| Black Host      | Bone-pale stone, purple fog, gravestones, torchlight                    |
| Horde           | Hide tents, palisades, trophy poles, red dust                           |
| Neutral         | No owner: wasteland, weathered, unclaimed                               |

Files: `capital-<faction>.webp`, `boss-<faction>.webp`, `city-<faction>.webp`, `village-<faction>.webp`, `shrine-<faction>.webp`, faction ids as in `assets/factions` (`crownlands`, `bright-marches`, `ember-fields`, `conclave`, `mountain-clans`, `northern-league`, `black-host`, `horde`, `neutral`).
The Horde only needs boss and capital for now (not playable yet).

## Priority 3: result pieces (6), for the feedback problem

Small square spot paintings (768 x 768, subject centred, soft vignette) shown when something is found, so a search or an offering visibly pays out:

- found-silver.webp (a scatter of silver coins in dirt)
- found-life.webp (a spring or healing herbs)
- found-nothing.webp (an empty hollow, a rotted box)
- found-cards.webp (an old satchel with cards spilling out)
- offering.webp (a shrine bowl with something changing hands)
- healed.webp (bandages and a warm fire)
  (Also needs a UI change on my side before they have a place to show; see the open items.)

## Priority 4: optional variety

- Faction variants of ruin, waymark, arena, landmark (4 x 8 = 32) so the same type does not repeat across a map.
- Several versions per generic piece (`encounter-2.webp`, etc.), which needs a small change to pick one by seed.
- Boss portraits for the 27 named bosses (3 per faction), shown on the fight screen.

## Done

- Silver coin icon (rendered; `public/crown/silver.webp`).
- Map icons are the shared SVG site icons.
