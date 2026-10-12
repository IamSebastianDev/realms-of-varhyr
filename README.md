# Realms of Varhyr

React + React Three Fiber card-game prototype with a 2.5D battlefield and a deterministic browser/server-capable engine. Entirely frontend; no account, server or external assets required.

## Run

Requires Node.js 22.12+.

```sh
npm install
npm run dev
```

Open **<http://localhost:5173>**. Browse cards and build decks from the main menu. Matches, custom decks and drafts save locally in this browser.

The initial content seed contains **six Crownlands cards**: Crownlands Recruit, Dawn Standard-bearer, Cleansing Light, Runeguard, Aldric, the Runewarden, and Crown Bastion. Runeguard and Aldric are Crown-only. New cards are imported from `assets/<card-name>/`; Goldfield Farmer has since been added. No other faction is active. neutral remains a generic energy type.

The **30-card minimum** is unchanged, with three copies normally and one per legendary. The Crownlands starter has 16 cards and is deliberately unfinished. Browsing, previews, deck editing and saving work now; Play unlocks once a deck is complete. A complete custom deck can play a mirror while no starter is complete.

## Add your test content

The files you need are:

| File | Edit here for |
| --- | --- |
| `assets/cards/<card-name>/data.json` | Card name, cost, stats, faction IDs, text and ability bindings |
| `assets/cards/<card-name>/data.png` | Required still artwork |
| `assets/cards/<card-name>/data.webm` | Optional animated artwork |
| `assets/factions/<faction-id>.json` | A faction: name, short label, color, symbol, optional booster pack and starter deck |
| `packages/extensions/src/index.ts` | Existing ability handlers and commented reference implementations |
| `packages/contracts/src/deckRules.ts` | Shared deck size and copy limits |

See **[the card authoring guide](assets/README.md)** for a full JSON template, spell examples and the ability list.

Start with a copy of a retained card folder and give it a new stable `id` and `deckLimitKey`. Add a new faction as one file in `assets/factions/`; the importer, UI and engine use that definition. Add starter references after the card exists. Ordinary cards allow three copies; legendary cards allow one. Alternate versions should share a `deckLimitKey`.

During development, asset changes validate and reload automatically. Run `npm run import:cards` for a manual import. `npm run assets` is an alias. Missing PNGs, malformed JSON, removed faction IDs, disabled abilities, duplicate IDs or invalid starter references report the source of the error and preserve the last successful import. Unfinished starter decks may be imported. Generated `packages/content/src/cards.json` and `public/cards/` should not be edited.

Armor, War Banner, Damage and Heal are enabled. Ready, Consume, Battlecry, Deathbound, Collector, Draw, Return, Blood Price and Reckoning remain commented in the extension file. Uncomment an entry and its indicated helper/import to use it again. Card rules text is display text; behavior comes from the registered handlers. Handler behavior changes require a version bump and meaningful tests.

The obsolete card seed and temporary art generators were removed. Old content remains only in regression fixtures under `tests/fixtures/`, which are not bundled with the game. Saved decks or matches referring to removed cards cannot resume with the current pool; browser storage is not erased automatically.

## Check changes

```sh
npm test                 # rules, active content, importer, deck and input checks
npm run check:engine     # check the engine without browser/DOM libraries
npm run build            # type-check and build dist/
npm run simulate         # complete matches + exact replay, once starters are legal
npm run audit:bot        # starter matchup audit, once starters are legal
npm run audit:balance -- --pairs 1000 # paired mirror matches with first-player reversal
npm run preview          # serve the built site
```

The rules regression suite uses stable test-only content, so adding or removing your authored cards does not break unrelated combat fixtures. Active content and authoring paths are checked separately. Headless simulations and bot audits explain when no starter is complete yet.

## Playing a complete deck

Drag cards onto legal slots or targets. Click ready creatures to channel energy; click again to undo until a play or phase change commits the choice. Hover/focus previews cards; right-click opens a pinned preview. Animated artwork plays on hover, in full previews and on the battlefield; reduced motion uses still artwork.

Cast normal spells before combat, then choose attackers. Each attacker chooses a lane (its own or an adjacent one, one attacker per lane); the card in that lane blocks automatically, and an empty lane lets the hit through to the player. The attacker reviews the arrows and confirms before damage resolves. Attackers and blockers strike simultaneously; exhausted creatures and bastions can still block. Destroyed defenders generate death energy for eligible spells. There are no combat tricks or second normal spell phase. End turn readies your field cards and clears damage/energy. Drawing the last card loses immediately; discards do not recycle.

Card types are `creature`, `spell`, and `bastion` (`monster` has been renamed). Bastions share the five field slots, cannot attack or generate energy, and use their Attack value only when blocking. Continuous effects remain active while on the field; activated abilities exhaust a ready card during its controller’s play phase. Crown Bastion demonstrates both with War Banner and Rally; its still artwork temporarily reuses Runeguard. See the [content guide](assets/README.md) for definitions and ability hooks.

The engine lives in `packages/core/src`, shared types in `packages/contracts/src`, presentation in `packages/renderer/src`, and the React client in `apps/web/src`. `apply(state, envelope, registry)` is also usable in a future server. The original [architecture draft](fantasy-card-game-architecture.md) and [prototype history](docs/prototype.md) preserve earlier designs; this README and the authoring guide describe the current Crown-only setup.

Battlefield positions are Left Flank, Left Wing, Center, Right Wing and Right Flank. Deployment is permanent while a card is on the field. Position abilities and JSON examples are documented in [the card authoring guide](assets/README.md#battlefield-positions).
