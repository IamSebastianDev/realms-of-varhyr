# Draft modes: design (draft, updated 2026-10-22)

Status: the **Faction draft was redesigned on 2026-10-22** (see "Why the draft changed"). **Migrated on 2026-10-22**: engine, table, rooms, rewards and UI now run the v2 faction draft; old saved runs are discarded. The v1 notes at the bottom are kept as history. Items marked **(open)** need a decision.

Terms: a **producer** always means a creature with cost 0 that produces energy. Deck rules today: at least 30 cards, 3 copies per card, 1 per legendary. Store boosters are 5 cards at 70/25/5 (common/rare/legendary). Existing starter decks run 9-10 zero-cost producers in 30 cards.

## Loaded draft

- You open **30 fresh set boosters** one after another (5 cards each) and **pick 1 card per pack**, so the pool is 30 cards. Packs are always fresh: the draft never reads or changes the collection.
- Set boosters draw from all factions of the set, so the pool is mixed on purpose.
- **Deck building:** you then build a deck from the 30 picks plus **free 0-cost producers from the base**, cutting the worst picks to fit. Deck space is the constraint, so more producers means fewer real cards.
- Realistic result: **two colours at most**. A third colour costs consistency, so there is no rule against it.
- **Hybrids are not free.** Only mono-faction base producers are free; a hybrid has to be picked in the draft.
- Intended to replace the quest start ("15 base cards, 15 drafted") with this mode. Silver, smith, shrine and keep-price rules stay as designed in `quest-mode-design.md`.
- **Copy limit (decided):** drafts are exempt from the 3-copy rule, free producers included. Only **legendaries stay limited to 1 copy**. This needs a mode-aware deck check: `validateDeck` currently enforces `copiesPerCard` for every deck.
- **Deck size (decided):** 30 cards minimum, no maximum. A 48-card deck is legal, just a bad idea.
- **Duplicates (decided):** no duplicate protection in packs. In the quest draft **nothing is dusted except legendaries**: a second legendary is unusable (limit 1), so it is dusted into silver at the end of the draft. Cutting cards from the pool gives nothing.
- **(open)** Silver per dusted legendary. Suggestion: half the provisional legendary keep price (40), like the smith, so dusting and buying back cannot be looped.

## Faction draft (v2, decided 2026-10-22)

### Why the draft changed (decision record)

The first version drew every pack from one alignment booster (three factions each: Hearth and Crown, Wanderer's Road, Gathering Dark). It is replaced for two reasons, stated by Sebastian:

1. **Hybrids are free over faction and alignment boundaries.** In the long term hybrids should exist in every direction, so every faction crosses pack boundaries anyway. A hybrid whose factions sit in different alignment packs was a half-dead card in the old draft, and the alignment packs were always placeholders for a single set booster in the collection.
2. **We do not want to do what everybody else is doing; we do something only we can do with the faction system.** A normal pack-passing draft squeezed into small boosters and a three-drafter pod is the standard approach, and it does not use what makes this game different. The new draft is built on factions and hybrids.

Background from the discussion:

- A mixed all-faction pool is too thin at this size. 24 packs of 6 cards are 144 cards; with nine factions in the pool, a two-faction deck can use only about a quarter of it. The old alignment pool (three factions) gave about 80 relevant cards.
- Other games commit identity first or offer curated choices instead of drafting a wide faction pool by luck: Star Wars Unlimited (leader and base set your colours), Flesh and Blood (hero and class), Legends of Runeterra Expeditions (solo, champions first, pick one of three packs, up to three regions), Lorcana (4 packs of 12, 48 picks). Magic's Grid and Winston drafts exist for small pods. None of them builds the draft around a faction pod.
- Alternatives considered and set aside: fixed alignment packs, curated triples of factions, bringing your own boosters, an anchor (legendary) pick first, Grid draft.

### Structure

**Three drafters** (you and two others, bots by default), **48 picks each, 24 draft boosters, 144 cards**. Two phases of four rounds each.

1. **Draft starts.** You pick a faction. Two more drafters with the same faction join (bots fill empty seats). Because the pod shares one faction, **the more players want a faction, the more packs of it circulate**.
2. **Phase 1 (rounds 1 to 4):** 12 draft boosters of that faction are opened, one per drafter per round. Each drafter makes 24 picks, all from that faction's pool (mono cards, hybrids, neutrals). Your own four packs each contain a guaranteed free producer, so you can take 4 producers.
3. **Phase 2 (rounds 5 to 8):** each drafter picks a faction **at the same time**; the choices are revealed when everyone has chosen and are public from then on. They can be the same or different. Each drafter opens 4 boosters of their faction, passed in the usual way. You pick first from your own packs and see each one again with 3 cards left, so you get **8 more guaranteed picks of your faction**, with neutrals and other factions' cards available. The other 16 picks come from what the other drafters' packs offer and may or may not suit you.
4. **Deckbuilding:** build from your 48 picks. 30 cards minimum, no maximum. **No copy limit except legendaries (1).** No free producers.

Passing is the same as before: a pack travels you, bot, bot, you, bot, bot, so its size shrinks 6, 5, 4, 3, 2, 1; each drafter sees every pack twice and the last pick of each pack is forced. Every card in the 24 packs ends up in somebody's pool.

### Draft boosters

- **6 cards:** 5 drawn from the faction's **mono cards + hybrids that include the faction + neutrals** at the usual 70/25/5 odds, plus **1 guaranteed free producer of that faction as the sixth card**. The guaranteed producer comes **only from the faction's mono, non-legendary free producers; hybrids and legendaries are never the guaranteed card.**
- You pick hybrids from the packs. **Taking a hybrid early is a real risk:** it is dead unless you end up in the partner faction.
- **No duplicate protection** in packs.
- **Draft boosters are for drafting only.** They are not sold, not in the store and not in the collection. They need not look like boosters, though that would be nicer.

### Hybrid structure (direction settled)

Hybrids connect neighbouring factions in a single chain:

**Ember Fields – Mountain Clans – Bright Marches – Crownlands – League of Winter – Horde – Conclave – Black Host**

- 7 links, in two arcs (a good arc and an evil arc) with the Horde and Conclave bridging. Ember Fields and Black Host sit at the ends on purpose and have one partner each.
- Existing hybrids all lie on the chain: Exiled Company and Riverlands Envoy (Marches–Crownlands), Deeptunnel Smugglers and Toll Collector (Ember–Clans), Black Shaman (Black Host–Conclave).
- Planned: League–Horde (the secret plot of the League using the goblins to destabilise the frontier) and Clans–Marches, Crownlands–League, Horde–Conclave.
- **(open)** Hybrids per link: 4 (28 cards, 23 more) was the starting count; 2 (14 cards, 9 more) is possible.
- Curated drafts by faction triples are no longer needed; the faction pod and the phase 2 choice replace them.

### Pool facts (repo snapshot, 2026-10-22)

| Faction | Mono cards | Free producers for the guaranteed slot (mono, non-legendary) |
|---|---|---|
| Bright Marches | 19 | 3 (a 4th, Grendel, is legendary) |
| Crownlands | 19 | 3 (Merchant of Tris Vale is legendary) |
| Black Host | 19 | 3 (Envoy of the Black Host is legendary) |
| Ember Fields | 19 | 3 |
| Mountain Clans | 19 | 3 |
| League of Winter | 1 | none |
| Horde | 1 | none |
| Conclave | 1 | none (Black Shaman is a hybrid) |

- **Five factions are draftable now. League, Horde and Conclave must be finished first**: a roster (target 4 legendary, 6 rare, 10 common) and mono non-legendary free producers. Producer variety is thin (3 per faction) and is accepted for now; it will grow over time.

### Play

- After the draft you build a deck from your 48 picks (30 minimum, no maximum) and play. **The 3-copy rule does not apply** in these matches; legendaries stay at 1.
- **Match structure (decided): double round-robin.** Every pair of drafters plays **twice**, so each drafter plays **4 matches** (6 matches in total). There is no final and no ranking: the payout depends only on your own wins.
- Alternate who goes first within each pair.
- Opponents are the other two drafters, bots by default, playing the decks they build from their own 48 picks. This needs **bot deck building** (curve, two colours, producers). Matches between two bots have no effect on anyone's payout, so they do not need to be simulated; they are only useful if a league table is shown.
- **Suspend, resume, drop early (decided):** a run can be suspended and resumed, or dropped early.
- **(open)** Dropping early: assumed to end the run, grant the cards as normal, and pay out for the wins so far (unplayed matches pay nothing). Confirm.

### Cost and payout

- **Entry fee: 1500 crowns.** Because draft boosters are not sold, the fee stays in crowns. The payout comes on top of the cards, in crowns and boosters, by wins out of 4. The 0-win payout is 250 crowns + 1 booster (decided); the rest is proposed and was made more generous on request. A booster counts as 100 crowns. The paid-out boosters are normal collection boosters.

| Wins | Payout | Value |
|---|---|---|
| 0 | 250 crowns + 1 booster | 350 |
| 1 | 450 crowns + 2 boosters | 650 |
| 2 | 600 crowns + 3 boosters | 900 |
| 3 | 800 crowns + 5 boosters | 1300 |
| 4 | 1100 crowns + 8 boosters | 1900 |

- **Economy check (generous version):** the 48 cards are worth about 960 crowns at booster prices (5 cards per 100 crowns), more because you choose them. Counting cards at that floor, a player who wins 30% of matches nets about +165, 40% about +290, 50% about +430, 60% about +575, 70% about +740 and 80% about +925. Only a run with no wins loses crowns (about 190). The mode is a net crown source for every skill level; the sinks are boosters (100) and buying specific cards (50 / 150 / 400). An earlier, flatter table (0 wins 350 up to 4 wins 1200) netted +130 at 50% and was replaced as too stingy.
- **(open)** Tune the table. A normal win pays 25 crowns + 1 booster today, which is small next to a run.
- **(open)** Which booster the payout gives once collection boosters become a single set booster (today it pays in the preset's alignment pack).
- **The cards are kept like a big 48-card booster:** when the run ends, all 48 picks go into the collection with the normal ownership rules (3 copies, legendaries 1). Whatever is over the limit is **dusted for crowns** by the existing duplicate rule (`grantCopies`: 10 common, 25 rare, 100 legendary). Keeping the cards does not depend on results.

## Faction draft with other players (via invite)

The faction draft can be played against bots and against other players, joined by invite.

- **Seats:** 3 seats, each a human or a bot. The host creates a room and shares a code, as in the existing online lobby; empty seats are filled by bots. All-bot opponents stay the default.
- **Pods by faction:** humans who pick the same faction in phase 1 form a pod; bots fill empty seats. Phase 2 faction choices are committed privately and revealed together, a simple commit-then-reveal.
- **Entry and payout are per human:** every human pays the 1500-crown entry and is paid by their own wins. Bot seats cost nothing.
- **Draft timing:** passing is synchronous, so a human pick needs a timer. On timeout the seat auto-picks with the bot logic. **(open)** Timer length.
- **Matches between humans are live matches;** matches against bots run as before. Because the structure is a plain double round-robin, no extra rule is needed for mixed tables.
- **Scheduling:** with three humans, each round has one match and one idle player: A-B, B-C, C-A, repeated twice, 6 rounds. The idle player can watch (spectator views exist). Bot matches run in parallel and instantly, so a table with one or two bots takes only about 4 rounds.
- **(open) Leaving.** Suspend and resume are simple against bots only. With humans, a drop or disconnect needs a rule: remaining matches count as losses for the person who left, or a bot takes over their deck. Cards and payout for wins so far stay as in "drop early".
- **Technical note:** the current online mode is a two-seat peer-to-peer room (host and guest, 8-character code, host is the authority, protocol seats p1/p2). A three-seat draft room needs the host to act as the hub for the draft and to run or relay matches between the other two seats. This is new infrastructure, so it is best built after the solo version works.

## Interface

Status: flow decided by Sebastian, details proposed. The flow below is updated for the v2 draft; the screens built so far follow v1 (see "Implementation status"). Items marked **(open)** need a decision.

### Start page and blades

Today all three start cards open the same Play blade (`GameSetup.tsx`, the `game-setup-pane` dialog) with a mode toggle. The new structure gives **each start card its own blade with its own content**:

| Start card | Blade content |
|---|---|
| **Play a match** (replaces Quick match and Play a friend) | Opponent row: Computer, Friend online, Same device. Then the deck picker and Start. Online shows the room lobby, as today. |
| **Faction draft** (new) | Your faction for phase 1, and the draft to enter or resume. |
| **Quest** | Resume or new quest (`QuestPicker`), moved out of the Play blade. |

### Faction draft flow

1. **Faction draft card** opens its blade.
2. **Blade:** pick the faction for phase 1 (replaces the alignment group choice). Continue goes to the overview.
3. **Draft overview screen** (before the draft): match structure, payout table, entry fee. Primary button: **Start draft**, or **Invite to draft** for a run with other players.
4. **Dialog** handles the choice: Start draft confirms the fee; Invite shows the room code and seats (bots fill empty seats).
5. **Draft screen, phase 1:** pick from packs of the pod's faction (pack in the middle, picks at the side, who passes to whom, producer counter).
6. **Phase 2 faction dialog:** every drafter chooses a faction at the same time; the choices are revealed together; then the draft screen continues with the new packs.
7. **Deckbuilder** when the draft ends: the run's 48 picks as the card source.
8. **Draft overview screen again:** the primary button is now **Play match**.
9. **Matches in sequence.** After each match you return to the overview, which shows the result, wins so far, the payout tier reached and the best still possible.
10. After the last match the button is **Finish draft**, which opens a **payout dialog** in the style of the card reveal: crowns, boosters and the 48 cards going into the collection, with dusted overflow shown.

There is no separate payout or matches screen. The overview is the one hub for the whole run.

### Draft overview screen

One screen whose content follows the run state:

- **Structure:** the four matches (opponent, who goes first, result), plus the entry fee and the draft boosters used (24: 12 in each phase).
- **Payout table:** five tiers by wins, the reached tier marked, the best still possible shown. While matches are played this is the expected payout.
- **Progress:** stage (Phase 1, Phase 2, Build deck, Matches, Finish), draft round and picks, wins so far.
- **Primary button by state:** Start draft or Invite to draft, Continue draft (if suspended mid-draft), Build deck, Play match, Finish draft.
- **Secondary:** Edit deck (between matches, within the pool), Suspend (leave, the run is kept), Drop run (confirm states what is paid out).
- A suspended run is resumed by opening the Faction draft card, which goes straight to its overview.

### Draft deckbuilder

- Reuses `DeckBuilder.tsx`, with the run's 48 picks as the card source instead of the collection. Ownership checks become picked copies.
- 3-copy limit off, legendaries stay at 1 (mode-aware deck check). Minimum 30 cards, no maximum. No free producers; they must be drafted.
- The deck belongs to the run: it is not saved with the normal decks and cannot be used in other modes.
- Mandatory before the first match; reachable later via Edit deck.
- Unused picks go to the collection with the others at the end.

### Named drafts

A **named draft** is a preset: its name, entry fee and payout table. Each named draft has its own run, so **one run can be suspended per named draft**.

- **Superseded by v2:** presets are no longer per alignment group, and the chaos draft (all boosters mixed) is no longer planned, since packs now follow the drafters' faction choices.
- The preset stays data (name, entry fee, payout table), so new named drafts can be added without UI changes. The payout table is shared for now; a preset may override it later.

### Open

- **(open)** Quest keeps its own blade, assumed for consistency.

## Rework needed for v2 (DONE 2026-10-22)

Not started. The first version below is built and works; v2 changes it as follows.

- **Pool and packs:** `packCards` selects cards by alignment pack today (a card enters if any faction matches). v2 builds a faction booster pool from mono + hybrids that include the faction + neutrals. `makeDraftPack` draws the guaranteed producer from the faction's mono, non-legendary free producers only (it now picks from the whole pool).
- **Two phases:** `startDraft` deals 24 packs from alignment presets today. v2 deals phase 1 packs from the pod's faction and phase 2 packs from each drafter's chosen faction, dealt after the simultaneous choice.
- **Presets:** drop the booster list and alignment groups; keep name, fee, payout.
- **Bots:** need a rule for the phase 1 faction (the pod faction), the phase 2 faction choice, and hybrid handling in picks and deck building.
- **UI:** blade (faction choice), the phase 2 dialog, overview text (24 boosters per faction no longer applies), German text.
- **Tests:** the 17 draft tests assume alignment packs and 8 rounds of one pack per faction.
- **Content first:** League, Horde and Conclave need rosters and free producers before they can be drafted.

## Implementation status (2026-10-19, first version)

Built and on the device: the **Faction draft against two bots**, end to end, with alignment packs (v1). 318 tests pass, including 17 new ones for the draft.

- **Engine** (`packages/draft/src/index.ts`, pure, seeded): named presets, 6-card packs with a guaranteed free producer, 24 boosters per run, three-seat passing with forced last picks (you see each pack twice), bot picks (colours, producers, no second legendary), bot deck building, run state, double round-robin schedule, payout lookup. Presets are data: one per alignment booster today; boosters, fee and payout table are per preset.
- **Deck rules:** `validateDeck(deck, registry, { draft: true })` waives every copy limit except the legendary one; `createMatch` takes `draft: true`. Draft decks must also come from your own picks.
- **Economy** (`apps/web/src/draft/rewards.ts`): entry fee taken at start; payout once per run through a receipt in the collection (`draftPayouts`); all 48 picks granted like one big booster with the normal limits, overflow dusted by `grantCopies`; boosters paid in the preset's own pack.
- **UI:** start page now has Play a match, Faction draft and Quest, each opening its own blade. Faction draft blade lists the named drafts with their state. One overview page carries the structure, matches, payout table (reached tier and best still possible marked) and the one primary button; pick screen; draft deckbuilder (opens with a suggested deck); payout dialog in the style of the card reveal. Suspend, resume per named draft and end early work. German text is in.

### Differences from the design to confirm

- **First player is not alternated** in the four matches: the engine decides, as in any match. Alternating needs seat swapping and the result mapping.
- **Invite to draft** is on the overview but disabled. The three-seat room is not built.
- **End run** pays the tier for the wins so far and grants the cards, as assumed.
- You can **edit the deck between matches** (not while a match is open).
- Draft matches give **no normal victory reward**, and Draw counts as no win.
- Bot names are fixed and picked by seed.

### Still open

- Pick timer and leaving rules for the human draft (needs the invite room).
- Loaded draft for quest start (the engine is reusable; the 30-pack flow and free producers are not built).
- Whether a Draw should replay.
