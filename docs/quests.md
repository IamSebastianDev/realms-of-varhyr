# Quest mode: expeditions through Varhyr

Design updated 18 October 2026. Transient locations settled the same day: encounter, roadside camp, traveling merchant and cache.

## Status and scope

This document describes the agreed direction for quest mode. It supersedes the daily, timed, single-boss quest structure. The expedition changes below are a design specification; they are not yet implemented. Existing implementation details are recorded separately at the end.

Quest mode becomes a free single-player expedition through Varhyr. There is no entry fee, time limit, mandatory final objective, or fixed completion payout. Players explore, improve their temporary deck, accept quests, defeat bosses, and decide when to retire. Death also ends the expedition.

## Core loop

1. Start a free expedition and build its starting deck using the existing base-deck and draft approach.
2. Explore fixed landmarks and generated travel locations.
3. Fight enemies, heal at roadside camps, buy cards from traveling merchants, search caches, and use settlement services.
4. Accept optional quests from rumors. Acceptance creates a destination; clearing it automatically grants its rewards.
5. Collect rewards from individual quests and bosses while continuing the expedition.
6. Retire or die, then spend remaining silver to keep selected cards from the final deck in the permanent collection.

Defeating a boss does not end the expedition. Returning to the main menu suspends the run rather than retiring it. There is no expiry while away.

## Currency and cards

### Silver and crowns

- **Silver** belongs to the current expedition. It pays for services, temporary card purchases, and end-of-run card purchases.
- **Crowns** remain the account currency. They cannot top up an expedition's silver budget.
- Starting an expedition costs no crowns.
- Unspent silver is discarded when the player finishes the end-of-run purchase screen; it is not converted to account currency.

Starting silver, encounter earnings, healing costs, and shop prices remain tuning values. Renaming run currency does not itself settle those amounts.

### Temporary cards and permanent payouts

Cards added to the expedition deck are temporary unless a reward explicitly grants a permanent collection card. A boss can, for example, grant a powerful card for use during the run and a booster as a permanent payout.

Reward presentations must distinguish expedition benefits from account rewards. Permanent payouts are granted when their boss or quest is completed and remain earned if the expedition later ends in death. There is no universal boss payout, daily alignment completion bonus, or fixed retirement reward; each boss or quest defines its own rewards.

### Smiths: destroy a card for silver

Smiths in cities and villages allow the player to destroy an individual card copy from the expedition deck.

- The player receives half that card's end-of-run purchase price in silver, independently of its account crown price or its original in-run purchase price.
- Destruction cannot reduce the deck below 30 cards. At 30 cards, the player must acquire another card before destroying one.
- A destroyed copy is removed from the deck and cannot be bought into the collection afterward or sold again.
- The same rule applies to starting-deck cards. There is no separate borrowed-card restriction.
- Do not warn about removing energy producers or other strategically useful cards. Choosing what to destroy is player agency; the minimum deck size is the constraint.

### Shrines: exchange cards

Shrines retain their card-exchange role, replacing one expedition card with another. The existing same-rarity exchange can remain. An exchange must finish with a legal deck; surrendering a copy removes that copy from the final purchase options.

## The world and its locations

### Fixed landmarks

Authored landmarks provide the world's stable geography and identity. Cities, villages, shrines, and other permanent sites are fixed locations with defined services or encounters. A standalone market location is replaced by a village; cities still contain a market service.

| Location | Services |
|---|---|
| City | Healing, market, rumors, smith |
| Village | Rumors, smith |
| Shrine | Card exchange |
| Other fixed landmark | Its authored purpose, such as a boss encounter |

Villages do not offer healing or a market.

### Generated travel locations

Additional travel locations are generated upfront between fixed landmarks, within valid placement areas. Their positions persist for the expedition. Their encounter type is rolled on first visit, then saved; leaving, revisiting, or reloading does not reroll it.

These transient locations have exactly four possible types:

| Type | Purpose |
|---|---|
| Encounter | A random fight against an enemy |
| Roadside camp | Healing for a silver fee. Replaces the earlier free refugee camp |
| Traveling merchant | Buying expedition cards |
| Cache | A small find: 1 life, a small amount of silver, or nothing |

A cache is a gamble, not a service: it has no price and can come up empty. Its outcome is rolled on first visit and saved with the location, like its type, so reloading or revisiting never rerolls it.

Random generation must not turn these locations into villages, cities, shrines, or other fixed-landmark types. Quest acceptance can create an additional destination after the initial world generation.

The share of each transient type, the roadside camp's price per life, and the cache's outcome odds and amounts are tuning values.

### Valid placement areas

Map authoring needs a way to mark land where generated locations may be placed. Both initial travel locations and destinations created by accepted quests must respect this data.

The placement system must support spacing from landmarks and other nodes and avoid placing destinations on invalid terrain. The exact editor representation—painted mask, polygons, or a combination—is an implementation choice. Valid placement should also account for practical reachability, rather than merely whether a point is drawn on land.

### Affiliation

Generated locations derive their affiliation from the nearest fixed landmark. This gives procedural content a geographic relationship to the authored world. Affiliation describes the surrounding territory; it does not require every enemy in that territory to belong to its ruling faction.

## Rumors and generated quests

Cities and villages offer rumors drawn from a pool of quest definitions. A rumor describes an optional task and its rewards. The player chooses whether to accept it.

1. Generate a rumor from an eligible quest definition.
2. On acceptance, generate and save a new destination in a valid location.
3. Track the accepted quest and its destination in the expedition UI.
4. Clearing the destination completes the quest and automatically grants its advertised rewards. The player does not need to return to the originating settlement.

For example: a village reports nearby bandits; the player accepts; a bandit encounter appears; defeating it awards two boosters.

Rumors and their associated quests are transient expedition content. Each individual offered rumor can be completed only once in that run. Revisiting a settlement or reloading cannot regenerate that same rumor for another payout. Quest definitions may be reused by the generator; this does not make an individual quest instance repeatable.

Each accepted quest needs a saved identity, origin, destination, objective, reward definition, and completion/payment state. Unfinished quests end with the expedition.

## Combat and difficulty

Existing combat rules remain in place. Life persists between fights; deck changes persist through the expedition. Healing is available through city services and roadside camps, both for a fee, and a cache can occasionally give 1 life.

Difficulty scales with expedition progression, based on **wins and card grade**. There is no mandatory final boss or required number of fights. Bosses remain optional encounters with their own rewards.

The exact scaling formula, meaning of card grade, encounter tiers, and timing of difficulty updates require tuning. The design should let deck improvements feel useful rather than immediately canceling every upgrade with an equal enemy increase. How revealed encounters lock their difficulty, and how destruction affects the strength assessment, remain decisions to resolve during implementation.

## Retirement, death, and keeping cards

Retirement and death both open the final deck as a purchase screen. Neither grants a fixed completion payout. Permanent boss and quest payouts already earned remain in the account.

Players select individual copies to keep, spending remaining expedition silver. Preserve the existing purchase behavior:

- Show every remaining copy individually, including starting-deck cards. Destroyed or exchanged-away copies are absent.
- Enforce both the number of copies remaining in the run and the permanent collection's ownership limits.
- Grey out cards already at the collection cap. Surplus copies cannot be bought merely to convert them into crowns.
- Allow multiple purchases while silver remains, and preserve exactly which copies have already been bought across reloads.
- Allow returning to the menu and resuming card selection. Require finishing the previous expedition's purchase screen before starting another run.
- Finishing forfeits unbought cards and unused silver, with confirmation when a balance remains. Already purchased cards are permanent.

The existing keep prices—15 for a common, 35 for a rare, and 80 for a legendary—are the provisional silver prices, not finalized balance. Smith proceeds use half these prices. Fractional-price rounding needs a consistent rule when implementation begins.

## Persistence and reward integrity

An expedition must save its generated positions, resolved location types, cleared encounters, deck, life, silver, progression, and quest instances. Restoring a save must not regenerate those decisions or replay completed rewards.

Boss and quest payouts need individual receipts rather than a single daily boss payout marker. Each payout must be applied once, including after reloads or an interrupted save. Finishing the expedition must not pay those rewards again.

Keep the existing transaction guarantees for final card purchases: validate the full selection, update collection ownership and silver together, reject stale purchase revisions, and record closure before clearing the active run. A failed save must leave the transaction unapplied and retryable.

## Current implementation and transition

The code currently implements the older daily quest structure: a 50-crown entry fee, 24-hour expiry, one target boss, and a once-per-alignment daily payout of 150 account crowns and three boosters. These are legacy behavior to replace, not expedition rules.

Current reward persistence provides a foundation for the transition:

- The collection's optional `questSettlements` stores receipts with the final deck's copy counts, remaining coin budget, purchased copies, revision, reward, and closed status.
- Account rewards and their once-only receipts share one storage write. Each card purchase updates ownership, purchased copies, revision, and remaining coins in one write.
- Closing is recorded before the active run is cleared, preventing stale runs from reopening purchases.
- Fight reports are acknowledged only after the resulting run has been saved.
- Legacy `run.reward` summaries and daily paid markers are respected to avoid duplicate payouts.

The implementation must preserve already earned account rewards and purchase receipts while defining how active legacy runs transition. Removing the time limit must also remove expiry checks from run loading and fight-result processing.

## Remaining implementation and tuning decisions

- Starting silver, encounter rewards, service prices (including the roadside camp's healing fee), cache odds and amounts, the mix of transient types, and smith rounding.
- Placement data format, spacing, reachability, and destination placement when a valid site is unavailable.
- Affiliation distance calculation and border behavior.
- Quest template eligibility, rewards, and how many rumors a settlement offers.
- Difficulty formula and card-grade assessment, including when encounter strength is fixed.
- Encounter and service revisit rules; revisits must not duplicate consumed rewards or reroll resolved content.
- Recovery of an interrupted fight without treating a normal application interruption as deliberate retirement.
- Transition policy for active saves from the daily quest mode.
