# Realms of Varhyr

React + React Three Fiber card-game prototype with a 2.5D battlefield and a deterministic browser/server-capable engine. Gameplay runs in the frontend; no account or game backend is required. Online rooms use PeerJS Cloud for signaling and WebRTC for match traffic.

## Run

Requires Node.js 22.12+.

```sh
npm install
npm run dev
```

Open **<http://localhost:5173>**. Browse cards and build decks from the main menu. Matches, custom decks and drafts save locally in this browser.

The current catalogue contains **26 cards** across **eight factions plus Neutral**, all in **RoV: Foundations**. The nine legendary leaders match the lore and player portraits; they are creatures with the `leader` subtype and the normal one-copy legendary limit. **Banners of the Crown** remains the complete 30-card starter. The original Winter POC cards and Winter Accord starter have been retired; the other factions currently provide their leaders as a foundation for new content. Their definitions live in `assets/factions/<faction-id>.json`, cards and artwork in `assets/cards/<card-name>/`, and sets in `assets/sets/<set-id>.json`. All active cards have German names and lore and bilingual ability descriptions.

Existing Crown/Wanderer card IDs remain stable. Old Winter ownership is retained in local storage but those cards no longer appear in the live catalogue or boosters. Decks containing retired cards need rebuilding; earlier match/replay content is incompatible with the new roster. The [Winter balance audit](assets/winter-balance.json) is historical, and retired card definitions used by mechanics tests live only in `tests/fixtures/winterContent.ts`.

New collections receive the starter's cards and **five free boosters**. Decks require at least **30 cards**, with at most three copies per card identity and one per legendary, and must use copies you own. Extra copies become **Crowns**, which buy boosters in the Store. Wins award 25 Crowns and one Realm’s Bounty booster; tutorials and imported replays do not grant rewards. All progression is saved on this device.

## Play, learn and review

- **Play** opens the setup drawer: practice against the bot, an online room, or two players sharing one device. Opponent deck, match seed and skirmish options are under Advanced.
- **Collection** contains the card browser and deck builder. Cards, factions and sets reload automatically while developing. The card browser shows owned cards by default; enable **Show unowned** in its filters to browse the full catalogue. Set filters are available in both the browser and deck builder; inspectors identify each card’s set. The Store offers a Foundations booster and the all-card Realm’s Bounty booster. Previously owned Crownlands, Winter and Neutral boosters become Realm’s Bounty packs on loading the collection.
- **Profile** sets the name and portrait used in matches. **Settings** selects English or German, animation mode (system/full/reduced), and separate music/effect switches and volumes, and starts the tutorial or opens a replay. A brief, immediately dismissible splash unlocks browser audio; the soundtrack loops across screens and pauses while the tab is hidden. Preferences persist on this device and apply to menus, matches, replays and card previews. The match gear exposes the same preferences without disconnecting an online game. Full reset in Settings deletes all locally saved game data (including legacy saves and online seat tokens), then restarts with the starter collection and five free boosters after confirmation.
- The tutorial uses a scripted opponent and the normal rules engine. Reloading a saved tutorial restores its progress.
- Finished matches show a summary and can export a replay. Recordings contain only one player's view, including their hand and public events; they exclude the opponent's hand, libraries and shuffle seed. Replay viewing is read-only and requires matching rules/content versions.

For **online play**, both players need the same build and card content. Host a room, share its eight-character code, and have the other player join with an owned legal deck. The host validates commands and sends each player their own view. A disconnected guest can reconnect or reload and rejoin from the same tab; the host must keep the page open. Host reload recovery, accounts and protection against a dishonest host are future work. This remains a trusted-player POC.

Optional signaling configuration: `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH`, and `VITE_PEER_SECURE`. `VITE_RTC_ICE_SERVERS` accepts a JSON array of ICE servers for custom STUN/TURN configuration. Defaults use PeerJS Cloud and PeerJS's bundled ICE configuration.

## Add your test content

The files you need are:

| File | Edit here for |
| --- | --- |
| `assets/cards/<card-name>/data.json` | Card name, cost, stats, faction IDs, text and ability bindings |
| `assets/cards/<card-name>/data.png` | Required still artwork |
| `assets/cards/<card-name>/data.webm` | Optional animated artwork |
| `assets/sets/<set-id>.json` | A set: name, code, description, faction focus, introduced factions and optional booster |
| `assets/factions/<faction-id>.json` | A faction: name, short label, color, optional booster pack and starter deck |
| `packages/extensions/src/index.ts` | Existing ability handlers and commented reference implementations |
| `packages/contracts/src/deckRules.ts` | Shared deck size and copy limits |

See **[the card authoring guide](assets/README.md)** for a full JSON template, spell examples and the ability list.

Start with a copy of a retained card folder and give it a new stable `id` and `deckLimitKey`. Add a new faction as one file in `assets/factions/`; the importer, UI and engine use that definition. Add starter references after the card exists. Ordinary cards allow three copies; legendary cards allow one. Each card must specify one known `set` ID, currently `foundations`. Set membership is independent of factions and does not restrict decks. Artwork choices will later be separate from logical card identity; changing a set label does not create more collection copies.

During development, asset changes validate and reload automatically. Run `npm run import:cards` for a manual import. `npm run assets` is an alias. Missing PNGs, malformed JSON, removed faction IDs, disabled abilities, duplicate IDs or invalid starter references report the source of the error and preserve the last successful import. Unfinished starter decks may be imported. Generated `packages/content/src/{cards,factions,sets}.json` and `public/cards/` should not be edited.

Armor, War Banner, Formation (Adjacent Banner), Shield Wall, Flank Evasion, Guard, Charge, Damage, Heal, Restore (internal `rally` ID), Draw, Rime, Invocation, Channel Neutral, Fealty, Accord, Soul Harvest, Rally (Marches), Trade, Sanctuary, Scorch, Raid and Wayfarer are enabled. Faction files select their exclusive `signatureAbility` as authoring metadata. These keywords belong to their factions and appear as ordinary ability rules in inspectors, with no extra label. Each faction keyword is an unnumbered fixed rule with `params: {}`; shared abilities such as Armor and Formation remain scalable. Cards shared by multiple factions can use the keywords of those factions. Ready, Consume, Battlecry, Deathbound, Collector, Return, Blood Price and Reckoning remain commented in the extension file. Uncomment an entry and its indicated helper/import to use it again. Ability descriptions supply displayed rules text; behavior comes from the registered handlers. Optional card lore supplies flavor text. Handler behavior changes require a version bump and meaningful tests.

The obsolete card seed and temporary art generators were removed. Old content remains only in regression fixtures under `tests/fixtures/`, which are not bundled with the game. Saved decks or matches referring to removed cards cannot resume with the current pool; browser storage is not erased automatically.

## Check changes

```sh
npm test                 # rules, active content, importer, deck and input checks
npm run check:engine     # check the engine without browser/DOM libraries
npm run build            # type-check and build dist/
npm run simulate         # complete matches + exact replay
npm run audit:bot        # starter matchup audit
npm run audit:balance -- --pairs 1000 # paired mirror matches with first-player reversal
npm run preview          # serve the built site
```

The rules regression suite uses stable test-only content, so adding or removing your authored cards does not break unrelated combat fixtures. Active content and authoring paths are checked separately. Headless simulations and bot audits explain when no starter is complete yet.

## Playing a complete deck

Drag cards onto legal slots or targets. Click ready creatures to channel energy; click again to undo until a play or phase change commits the choice. Hover/focus previews cards; right-click opens a pinned preview. Animated artwork plays on hover, in full previews and on the battlefield; reduced motion uses still artwork.

Click the phase button or press Space once to advance. Each phase transition locks further advances for 500 ms; the button displays transition progress. Presses and clicks during the transition are ignored, and holding Space cannot repeat into the next phase.

Cast normal spells before combat, then choose attackers. Each attacker chooses a lane (its own or an adjacent one, one attacker per lane); the card in that lane blocks automatically, and an empty lane lets the hit through to the player. The attacker reviews the arrows and confirms before damage resolves. Guard can intercept an adjacent lane; Flank Evasion can bypass flank defenders. Attackers and blockers strike simultaneously; exhausted creatures and bulwarks can still block. Destroyed defenders generate death energy for eligible spells. There are no combat tricks or second normal spell phase. End turn readies your field cards and clears damage/energy. Drawing the last card loses immediately; discards do not recycle.

Card types are `creature`, `spell`, and `bulwark` (`monster` has been renamed). Bulwarks are persistent defensive cards such as landmarks, buildings, relics, banners, and shrines. They share the five field slots, cannot attack or generate energy, and use their Attack value only when blocking. Continuous effects remain active while on the field; activated abilities exhaust a ready card during its controller’s play phase. Crown Bulwark demonstrates both with War Banner and Rally; its still artwork temporarily reuses Runeguard. See the [content guide](assets/README.md) for definitions and ability hooks.

The engine lives in `packages/core/src`, shared types in `packages/contracts/src`, presentation in `packages/renderer/src`, and the React client in `apps/web/src`. `apply(state, envelope, registry)` is also usable in a future server. The original [architecture draft](fantasy-card-game-architecture.md) and [prototype history](docs/prototype.md) preserve earlier designs; this README and the authoring guide describe the current prototype.

### Client match boundaries

`apps/web/src/match/MatchSession.ts` defines the shared match-session reader and its adapters:

- `LocalMatchSession` owns local engine state, accepted commands, channel undo and review frames. Practice, hotseat and tutorial play use this adapter; tutorial guidance still chooses which commands to allow.
- `OnlineMatchSession` wraps the WebRTC room, records received projections and forwards commands to the host. It never predicts engine state or changes the received seat.
- `ReplayMatchSession` reads recorded projections. It has no command or reconnect methods and no live connection.

The match screen reads state and review frames through `useMatchSession`. `useMatchPresentation` owns combat animation playback, spell/energy flights, sound and their cleanup; it renders accepted transitions without changing session state. Saved local matches keep the existing initial-state/command format, and exported replay files keep their existing format.

Battlefield positions are Left Flank, Left Wing, Center, Right Wing and Right Flank. Deployment is permanent while a card is on the field. Position abilities and JSON examples are documented in [the card authoring guide](assets/README.md#battlefield-positions).

Faction abilities have presentation-only effects: Fealty uses gold oath links, Sanctuary leafy wards (a stronger elf ward), and Raid stacking claw accents. Rally, Trade, Scorch, Accord, Soul Harvest and Wayfarer each have a short burst or flight. Static cues read the real ability handlers; resolved hooks decorate their existing public event with `effects` attribution (ability, source and target), preserving event sequencing and saved choices, without revealing drawn cards. `factionEffects.ts` builds cues from accepted transitions and `FactionAbilityEffects.tsx` paints them around the actual battlefield cards. Effects also work in online projections and replay steps; reduced motion retains static cues and suppresses bursts.
