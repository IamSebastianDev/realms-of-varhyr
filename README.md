# Realms of Varhyr

A collectible fantasy card game. Five battlefield slots, energy from your own creatures, and a deterministic rules engine that runs in the browser. Play the bot, a friend on the same device, or a friend online.

> **Vibecoded, on purpose.** This project is built almost entirely by AI coding agents (Claude and GPT) working from my specs and design decisions. I steer, review and playtest; I do not read and hand-verify every line. It is a hobby prototype: expect rough edges, unbalanced cards, and code that is correct mostly because there are tests. Treat it accordingly before you build on it or trust it with anything important. Bug reports and balance opinions are welcome.

The game is a static web app. There is no account system and no game backend. Everything you own is saved in your browser, and online matches run peer to peer over WebRTC (PeerJS Cloud is used only for the handshake).

## Run

Requires Node.js 22.18 or newer (see `.nvmrc`) and npm 10.

```sh
npm install
npm run dev
```

Open **<http://localhost:5173>**. `npm install` also installs the git hooks. The first run imports the card catalogue from `assets/`, and it re-imports whenever you change a card file. To rebuild the generated catalogue by hand, run `npm run assets`.

## The game in short

- **Setup:** 10 life, a 30-card minimum deck (three copies per card, one per legendary), five cards in hand, five empty battlefield slots.
- **Energy:** creatures produce it. Click a ready creature to channel, click again to undo until you play something. Costs have a generic part and a faction part.
- **Turn:** draw two and keep one (the other goes to the discard pile or under the library), channel, play cards, attack, end turn. Drawing your last card loses the game.
- **Slots:** Left Flank, Left Wing, Center, Right Wing, Right Flank. A card stays where you deploy it. New creatures and holdings enter exhausted unless an effect says otherwise.
- **Combat:** each attacker picks its own lane or an adjacent one (one attacker per lane). The card opposite blocks automatically, and an empty lane hits the player. You review the arrows before damage resolves.
- **Response step:** whenever a creature dies, its owner receives that creature's energy as response energy and a chance to cast response-timed spells. The attacker's window comes first.
- **Cards:** creatures, spells and holdings (persistent defensive cards that cannot attack). Spells declare `play` and/or `response` timing.

The full rules and the engine's decisions are in [docs/prototype.md](docs/prototype.md) and the [architecture draft](docs/architecture.md). Both are historical in places: when they disagree with the code, the code and this README win.

## What is in the box

- One set so far, **RoV: Foundations**, across the Crownlands, Bright Marches, Black Host, Horde, Mountain Clans, Ember Fields, Conclave, Northern League and Neutral. The Crownlands and Bright Marches have complete 30-card starters (Banners of the Crown and Hearth and Stone); the Black Host has a small card set, and each remaining faction has only its leader so far.
- **English and German.** All card names, lore and ability text are translated, and so is the interface.
- **Play modes:** practice against the bot, hotseat on one device, online room, scripted tutorial, and read-only replay viewing.
- **Collection:** new players receive the default starter and five Realm's Bounty boosters. Wins pay 25 Crowns and a booster. Extra copies turn into Crowns, and Crowns buy boosters or individual cards in the Store. Tutorials and imported replays pay nothing.
- **Touch and fullscreen:** the menu and Play drawer have touch-sized controls. A fullscreen button is in the menu and in Settings. On iPad, keyboard use leaves fullscreen (a Safari limit); adding the game to the Home Screen gives a fullscreen app without browser chrome.
- **Card studio:** a local editor for card data (`npm run dev:studio`), see below.

Matches are not saved. Reloading or leaving a match ends it. Collection, decks, profile, settings and whether you finished the tutorial stay in the browser, and **Settings → Full reset** wipes them.

## Online play

Both players need the same build. Host a room, share the eight-character code, and the other player joins with a legal deck. The host's browser runs the authoritative engine and sends each player only their own view: hands, libraries, shuffle seed and the other player's choices are never sent.

Keep the host tab open: if the host reloads, the match is gone. A guest can reload and rejoin from the same tab. This is a trusted-friends setup and does not protect against a dishonest host. Details and the optional signaling variables (`VITE_PEER_*`, `VITE_RTC_ICE_SERVERS`) are in [docs/multiplayer.md](docs/multiplayer.md).

Local matches use the same machinery as online ones. The bot is simply a remote seat answered by a loopback room around the same authority, so there is one match session class and one place where the rules are enforced.

## Make cards

Each card is a folder in `assets/cards/<card-id>/`:

| File           | Purpose                                                              |
| -------------- | -------------------------------------------------------------------- |
| `data.json`    | Name, type, cost, stats, factions, subtypes, rarity, abilities, lore |
| `data.de.json` | German name and lore                                                 |
| `data.png`     | Required artwork (optional `data.webm` for animated art)             |

Factions are `assets/factions/<id>.json` and sets are `assets/sets/<id>.json`. Copy an existing card folder, give it a new `id` and `deckLimitKey`, and the importer, UI and engine pick it up. Bump `revision` when you change a card. Generated files (`packages/content/src/*.json`, `public/cards/`) are never edited by hand. `npm run assets` rebuilds them, reports the file and reason for any error, and keeps the last good import.

`npm run schema:cards` regenerates `assets/schemas/card.schema.json` after you change an ability, which gives editors autocomplete and validation.

**Abilities** are registered once and cards bind them by ID. They live in three files under `packages/extensions/src/`:

- `index.ts`: field keywords any card can use. Scalable ones (Armor, Banner, Drillmaster, Shield Wall, Bind, Guard, Charge, Rest, Weaken, Longshot, Primal) and fixed-rule ones mostly carried by faction leaders (Fealty, Rally, Soul Harvest, Dark Harvest, Raid, Trade, Scorch, Sanctuary, Accord, Wayfarer).
- `spellAbilities.ts`: effects that resolve when a spell is cast, listed under `cast`. They are Damage, Barrage, Heal, Draw, Rage, Steadfast, Channel, **Destroy** and **Raise**. Creatures and holdings cannot carry them, and the import rejects a field card that does.

Two of the spell effects have parameters worth knowing: `raise` takes a creature `subtype`, lets you choose a matching creature from your discard pile and a free slot, and returns it ready; `destroy` takes none and destroys a target enemy creature.

The complete guide, with JSON templates, ability tables, targeting kinds and hooks, is [assets/README.md](assets/README.md). A genuinely new mechanic needs an engine handler and a test.

**Card studio:** `npm run dev:studio` opens a local form editor over the same folders. It is a development tool and is not deployed.

## Check your changes

```sh
npm run check            # typecheck + tests + lint + format check + css ratchet
npm test                 # all workspace tests through turbo (cached)
npm run typecheck        # every workspace, engine packages without DOM libs
npm run lint             # oxlint
npm run format           # oxfmt (npm run format:check only verifies)
npm run build            # generate assets, type-check and build apps/web/dist
npm run build:studio     # build apps/studio/dist
npm run simulate         # complete matches with exact replay
npm run audit:bot        # starter matchup audit
npm run audit:balance -- --pairs 1000   # paired mirror matches, first player reversed
npm run preview          # serve the built site
```

Git hooks (lefthook, installed by `npm install`): `pre-commit` lints and format-checks the staged files (`npm run format` fixes them), `commit-msg` checks the message with commitlint ([Conventional Commits](https://www.conventionalcommits.org), e.g. `feat(draft): add sleeve picker`), and `pre-push` runs typecheck and tests. CI runs the same `npm run check` on every push and pull request.

Tests live next to the workspace they cover (`packages/*/tests`, `apps/*/tests`). The rules tests use their own fixed content in `packages/testing/src`, so adding or rebalancing cards does not break unrelated combat tests.

## Code layout

This is an npm-workspaces monorepo orchestrated by [turbo](https://turbo.build). Packages are `@realms/*`, export their TypeScript source directly (no build step) and share `tsconfig.base.json`.

| Path                   | Contents                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `apps/web`             | The game client (Vite, React)                                       |
| `apps/studio`          | The card studio                                                     |
| `packages/contracts`   | Shared types, command and order shapes, deck rules                  |
| `packages/core`        | The engine: `apply(state, envelope, registry)`, legal actions, bot  |
| `packages/extensions`  | Ability handlers                                                    |
| `packages/content`     | Compiler, generated catalogue, boosters                             |
| `packages/draft`       | Draft rules and tables                                              |
| `packages/quest`       | Expedition engine and map rules                                     |
| `packages/multiplayer` | Match authority and wire protocol (no browser APIs)                 |
| `packages/renderer`    | React Three Fiber battlefield                                       |
| `packages/ui`          | Shared UI, card presentation, translations                          |
| `packages/testing`     | Fixed test content shared by the suites                             |
| `tools`                | Card importer, schema generator, simulations, audits, build plugins |
| `assets`, `public`     | Card, faction and set sources; static media                         |
| `docs`                 | Design notes and specs                                              |

### Inside `apps/web/src`

```text
main.tsx               entry: styles, providers, root
app/                   App shell, providers (audio) and global styles
components/            shared UI used by more than one feature
hooks/  lib/           shared hooks and plain helpers
features/<name>/       one folder per area of the game
  components/          screens and views
  hooks/               React hooks of that feature
  stores/              persisted state (localStorage, subscribed with useSyncExternalStore)
  lib/                 rules and helpers without React
  styles/              the feature's CSS
```

Features: `match` (the board, combat presentation, sessions), `lobby` (menu shell, start page, game setup), `decks`, `collection`, `store`, `boosters`, `card-backs`, `goals`, `profile`, `settings`, `onboarding`, `tutorial`, `draft`, `quest`, `multiplayer` and `audio`. The two big screens, the match and the deck builder, are split the same way: a controller hook built from small ordered hooks, shared through a context, and many small view components that read from it (`features/match/hooks/controller`, `features/match/components/screen`, `features/decks/hooks/builder`, `features/decks/components/builder`).

The engine takes a command and returns a new state or a rejection; nothing outside `packages/core` decides legality. The client reads projections of that state, so a seat never sees what it should not.

## Deploying

The build is static files. [docs/deployment.md](docs/deployment.md) covers Cloudflare (Workers static assets or Pages) and the WebP art conversion done at build time.

## Credits

Card art, portraits and music are prototype assets. Check where they came from before reusing or redistributing any of them.
