# Quest mode: design (expedition)

Status: redesigned 2026-10-18. The authoritative spec is `docs/quests.md` in the repo; this doc is its companion and keeps the map, art and UI decisions that did not change. Items marked **(proposal)** still need a decision. This replaces the earlier daily-run design (daily quests, entry fee, 24-hour limit, one target boss).

## Pitch
A free single-player expedition through Varhyr. You build a temporary deck, explore a large map, fight, heal, shop, accept optional quests from rumors and defeat bosses. There is no entry fee, no time limit, no mandatory final objective and no fixed completion payout. You retire when you choose; dying also ends the run. Then you spend leftover silver to keep chosen cards from the final deck.

## Core loop
1. Start a free expedition: pick one of the three factions of an alignment (booster pack names only: The Hearth and the Crown, The Wanderer's Road, The Gathering Dark), get the base deck and draft the rest (existing approach: 15 base cards, 15 drafted from faction and neutral packs, pick packs x/y).
2. Explore fixed landmarks and generated travel locations.
3. Fight, heal at roadside camps, buy from traveling merchants, search caches, use city and village services.
4. Accept optional quests from rumors. Acceptance creates a destination; clearing it grants its rewards automatically.
5. Collect quest and boss rewards while continuing.
6. Retire or die, then buy cards back with remaining silver.

Beating a boss does not end the run. Returning to the main menu suspends the run (it is not retirement), with no expiry.

## Currency and cards
- **Silver** belongs to the expedition: services, temporary card purchases, end-of-run purchases. **Crowns** stay the account currency and cannot top up silver. Starting costs no crowns. Unspent silver is discarded when the purchase screen is finished.
- Cards added during a run are temporary unless a reward explicitly grants a permanent collection card (for example a boss gives a strong card for the run plus a booster for the account).
- Reward presentation must separate run benefits from account rewards. Permanent payouts are granted when their boss or quest is completed and stay earned if the run later ends in death. No universal boss payout, daily bonus or retirement reward: each boss or quest defines its own.
- **Smith** (cities, villages): destroy one copy from the run deck for half its keep price in silver. The deck can never drop below 30 cards. A destroyed copy cannot be bought back or sold again. Applies to starting cards too. No warnings about removing producers.
- **Shrine**: exchange one run card for another (same-rarity exchange may stay). The result must be a legal deck; the surrendered copy leaves the final purchase options.

## World
### Fixed landmarks
| Location | Services |
|---|---|
| City | Healing (fee), market, rumors, smith |
| Village | Rumors, smith (no healing, no market) |
| Shrine | Card exchange |
| Other landmark | Its authored purpose, for example a boss |

A standalone market site is replaced by the village; cities contain a market service. Each of the 8 factions has a capital with unique art. Landmarks and capitals can host bosses.

### Generated travel locations
Positions are generated up front between landmarks, inside valid placement areas, and persist for the run. A location's type is rolled on first visit and then saved (never rerolled by leaving, revisiting or reloading). Exactly four types:

| Type | Purpose |
|---|---|
| Encounter | A random fight against an enemy |
| Roadside camp | Heal for a silver fee (replaces the old free refuge) |
| Traveling merchant | Buy expedition cards |
| Cache | Find 1 life, a small amount of silver, or nothing |

Transient locations never turn into villages, cities, shrines or other fixed types. Type mix, camp fee and cache odds are tuning values. Each location can be used once. The transient locations show a question mark until visited; permanent sites show their icon.

### Placement areas
The node tool needs a way to mark valid land for generated locations and quest destinations (painted mask, polygons or both; implementation choice). It must support spacing from landmarks and other nodes, avoid invalid terrain and account for practical reachability.

### Affiliation
Every fixed node has an affiliation (one of the 8 factions or Neutral for the wilderness). Generated locations take the affiliation of the nearest fixed landmark. Borders are drawn from node affiliations, with no region polygons. Territory describes the land, not who the enemies are.

## Rumors and generated quests
Cities and villages offer rumors from a pool of quest definitions. The player may accept one; acceptance generates and saves a destination in a valid location; clearing it completes the quest and pays its advertised rewards automatically (no return trip). Example: a village reports bandits, a bandit encounter appears, winning pays two boosters.
- Each offered rumor can be completed once per run; reloads and revisits cannot regenerate it. Quest definitions may be reused by the generator.
- A quest instance saves identity, origin, destination, objective, reward and payment state. Unfinished quests end with the run.

## Combat and difficulty
Existing combat rules. Life persists between fights; a fight starts at the carried life. Healing: city, roadside camps (fee), rarely a cache.
Difficulty scales with **wins and card grade**; no mandatory boss or fight count; bosses are optional with their own rewards. Formula, card-grade meaning, encounter tiers, when a revealed encounter locks its strength and how destruction affects the assessment are open.

## Retirement, death and keeping cards
Both open the final deck as a purchase screen; neither grants a fixed payout.
- Every remaining copy is shown individually (starting cards too); destroyed or exchanged copies are absent.
- Enforce copies left in the run and the collection's ownership limits; grey out cards already at the cap; no buying surplus to convert into crowns.
- Several purchases while silver lasts; purchased copies survive reloads; the player may go to the menu and resume selecting; the next run cannot start until this screen is finished.
- Finishing forfeits unbought cards and silver, with confirmation if a balance remains.
- Provisional keep prices: 15 common, 35 rare, 80 legendary. Smith pays half; rounding rule needed.

## Persistence
Save generated positions, resolved location types and cache outcomes, cleared encounters, deck, life, silver, progression and quest instances; never regenerate or replay rewards after a load. Boss and quest payouts have individual receipts, each applied once, including after interrupted saves. Final purchases are one transaction (validate whole selection, update ownership and silver together, reject stale revisions, record closure before clearing the run).

## Map screen and tools (unchanged decisions)
- Pan and zoom canvas centered on the player's token; tile pyramid cut from the 8k Inkarnate export at build time; markers in normalized coordinates; fog of war as a mask; tap a node to walk the token along a curved line (skippable); dotted trail; soft borders computed from affiliations; no scrolling.
- Full-screen map, no general nav; player info bottom left in the match-screen plate style (bronze chrome); quest log top left (accepted quests and rumors); Menu top right; no map control buttons; run deck shown bigger with the standard sleeve and silver next to it; visited nodes greyed out; Esc never leaves to the main screen; a quest needs an exit.
- The map art contains no text, icons or markers. The node tool (studio, Chrome only) places nodes with site type, affiliation, permanent or transient, landmark and start flags, shows reveal radius and live borders, and exports JSON.
- Location dialog: art, short text, action button(s), a way to leave; actions open sub-views (shop, picks, exchange). All text through i18n.
- Art lookup falls back from faction-specific to generic type to placeholder. Art budget: per-type per-faction pieces for city, village, shrine plus capitals, generic pieces for encounters, camps, merchants, caches.

## Open questions
- Starting silver, encounter rewards, service prices, smith rounding.
- Placement data format, spacing, reachability, fallback when no valid site exists.
- Affiliation distance calculation and border behavior.
- Quest template eligibility, rewards, rumors per settlement.
- Difficulty formula and card grade; when encounter strength is fixed.
- Revisit rules for encounters and services.
- Recovering an interrupted fight without treating it as retirement.
- Transition for active saves from the old daily mode.
- Faction-specific sites (Harbor, Mines and so on) remain undecided.
