# Adding test cards

The catalogue covers eight factions plus Neutral, all in **RoV: Foundations** (`assets/sets/foundations.json`). Definitions live in `assets/factions/`, and cards live in `assets/cards/`. Banners of the Crown (Crownlands) and Hearth and Stone (Bright Marches) are complete 30-card starters; the Black Host has a small card set, and the other factions have their leader so far. The original Winter POC cards and starter are retired. The 30-card minimum and normal/legendary copy limits apply to every deck.

## Sets and expansions

A card belongs to exactly one set via its required `set` ID. All current cards use `"set": "foundations"`. Factions describe the card’s affiliations; sets describe its release. A set may feature one faction, several factions, neutral cards, or introduce factions. Faction focus is descriptive and does not constrain membership or deck construction.

Author one file per set at `assets/sets/<set-id>.json`, with a matching stable `id`:

```json
{
  "id": "foundations",
  "name": "RoV: Foundations",
  "code": "FND",
  "description": "The first age of Varhyr.",
  "color": "#d4bd85",
  "symbol": "⟐",
  "factions": ["crownlands", "northern-league", "neutral"],
  "introduces": ["crownlands", "northern-league"],
  "pack": {
    "id": "foundations",
    "name": "RoV: Foundations",
    "blurb": "Five cards from Foundations."
  },
  "translations": {
    "de": {
      "name": "RoV: Grundlagen",
      "description": "Das erste Zeitalter Varhyrs.",
      "pack": { "name": "RoV: Grundlagen", "blurb": "Fünf Karten aus Grundlagen." }
    }
  }
}
```

`factions`, `introduces`, `pack` and `translations` are optional. Any named faction must have a faction definition; `introduces` does not create one automatically. Codes must be unique, 2–5 uppercase letters/digits. Pack IDs must be unique across sets, factions and the general `bounty` pack. Keep pack IDs stable because players’ inventories use them.

An optional set booster draws five cards from that set, across all factions, using the existing rarity odds and duplicate rewards. Collection and deck-builder filters use `set`; the inspector shows its name/code and its description on hover. German set/pack text comes from the authored translations. The Store currently offers Foundations and the all-card Realm’s Bounty pack. Retired Crownlands, Winter and Neutral packs convert one-for-one into Realm’s Bounty when loading a saved collection.

Set labels are excluded from the gameplay content hash, so tagging cards or editing set metadata does not invalidate matching replays. Gameplay edits still affect compatibility. Keep card IDs stable: set membership does not create another collection identity. Cosmetic artwork variants will be decoupled later; current artwork still comes from the card’s asset folder.

## Editor validation and autocomplete

`assets/schemas/card.schema.json` describes `data.json` and `assets/schemas/card-translation.schema.json` describes `data.<language>.json`. Every card file points at its schema with `$schema`, and `.vscode/settings.json` maps both file patterns, so VS Code offers completion and flags mistakes as you type: unknown factions, sets, energy keys and ability IDs, wrong ability parameters (such as a Charge without a `position`), and spell or holding restrictions.

The schemas are generated from the factions, sets, ability definitions and card validation. Run `npm run schema:cards`, or any card import, to refresh them after adding a faction, set or ability. Never edit them by hand; the tests fail if they are out of date.

## Card folders

Cards, factions and sets are separate:

```
assets/
  cards/<card-name>/
    data.json    required definition
    data.de.json optional German name and lore
    data.png     required still artwork
    data.webm    optional actual WebM animation
  factions/<faction-id>.json
  sets/<set-id>.json
```

Create one folder per card under `assets/cards/`.

Use lowercase folder names with hyphens. Keep the card `id` stable when renaming its folder or display name. Do not edit generated files in `packages/content/src/cards.json` or `public/cards/`.

A complete creature definition:

```json
{
  "id": "crown-scout",
  "set": "foundations",
  "revision": 1,
  "name": "Crown Scout",
  "deckLimitKey": "crown-scout",
  "type": "creature",
  "factions": ["crownlands"],
  "subtypes": ["creature"],
  "legendary": false,
  "rarity": "common",
  "cost": { "generic": 0, "factions": {} },
  "stats": {
    "attack": 1,
    "defense": 1,
    "energyOutputs": [{ "crownlands": 1 }]
  },
  "lore": "An early scout for the Crown.",
  "abilities": []
}
```

`cost.generic` accepts any energy; `cost.factions` requires the named energy and can be omitted when there are no faction costs. Entries in `energyOutputs` are alternatives: `[{"crownlands":1},{"another-faction":1}]` means choose either. One entry with two keys produces both. Neutral cards can use `factions: ["neutral"]` or `factions: []`; both import as factionless cards. Do not combine Neutral with named factions. To produce two generic energy (energy without a faction), use `energyOutputs: [{"neutral":2}]`. The output key `neutral` is the existing data ID for generic energy; it can only pay generic costs. All faction energy can also pay generic costs. In a cost, `generic` describes how much of any energy is required. Neutral appears in the collection and deck builder's faction filter.

Ancient Unicorn has no printed energy output (`energyOutputs: []`). Its **Primal** ability (`{"id":"primal","params":{"amount":1}}`, **Urkraft** in German) exhausts it during the play phase to produce one energy of a chosen faction. It generates no death energy. Other creatures may also omit printed production. Primal is an activated ability, not a separate energy type.

For a spell, omit `stats` and use `type: "spell"`, `timing: ["play"]` and a nonempty `cast` list. Example from Cleansing Light:

```json
"cast": [
  { "id": "damage", "params": { "amount": 2 } },
  { "id": "heal", "params": { "amount": 1 } }
]
```

Normal spells are played before combat. `"death"` timing supports the defender's death-energy window; there is no post-combat normal casting or combat trick window.

## Holdings and activated abilities

Use `type: "holding"` for persistent defensive field cards: landmarks, buildings, relics, banners, shrines, and similar enduring presences. They share the five field slots with creatures, enter exhausted, and ready at the end of their controller's turn. A holding cannot attack or generate energy through `energyOutputs`, including death energy, but it can carry activated abilities, including the energy abilities `primal` and `channel` (a mine). It can block even while exhausted and deals its `stats.attack` as **defensive damage** simultaneously with the attacker. Omit `energyOutputs`; the importer normalizes it to `[]` and rejects nonempty outputs. Use `subtypes` to state what it is, such as `"relic"`, `"landmark"`, or `"building"`.

Crown Holding is a complete example in `assets/cards/crown-holding/`: its artwork temporarily reuses Runeguard's still. Its stats and effects are:

```json
"type": "holding",
"stats": { "attack": 1, "defense": 4 },
"abilities": [
  { "id": "banner", "params": { "amount": 1 } },
  { "id": "rest", "params": { "amount": 1 } }
]
```

Continuous modifiers use an extension's `static(source, target, params, registry)` hook. They apply while the source is on the field, even exhausted. Banner boosts its neighbouring friendly creatures and holdings.

Activated effects use `activate(ctx, params)` instead of `cast`. Optional `canActivate(source, state, params, registry)` adds a public eligibility restriction, enforced by legal actions and the command validator. Activation is available only on a ready field card during its controller's play phase, and exhausts the source before resolving. This initial model has no additional energy cost and no combat or post-combat activation window. Creatures can also have activated abilities; the action popover lets the player choose between channeling and activating. Different activated bindings can coexist; activating any one exhausts the card.

Primal uses `target: "energy-type"` and `activationEnergy(params, registry)` to declare its one-faction output choices. The UI offers those choices as a semicircle of faction symbols above the card and sends the selected faction as the activation's `target`; the engine validates it before exhausting the source. The handler issues `gain-energy` with that faction. Declared activated production also counts in the deck builder and bot funding plans, but it is never included in death energy.

```ts
extension("rest", amountSchema, {
  name: "Rest {amount}",
  description: "Exhaust: restore {amount} life.",
  activate: (ctx, p) => ctx.issue({
    type: "heal", target: ctx.source.controller, amount: amount(p),
  }),
})
```

Rally (`marches-rally`) is the Marches leader keyword, usable on any card. The healing keyword is called `rest` (**Rast** in German), so it cannot be confused with the Marches deployment action.

An extension's `target` can be `enemy-any` (enemy player or any enemy field card), `enemy-reach` (the enemy player or an enemy creature in the chosen position's lane or the two beside it; deployment effects only), `friendly-field`, `enemy-field`, `friendly-creature`, or `enemy-creature`, or `friendly-discard-creature` (a creature in your own discard pile, filtered by the binding's `subtype` param). Targeted activations select their own target at activation, not deployment. They are unavailable when no valid target exists. Creature-only effects and Consume exclude holdings. Holding entry, blocking and death events are `holding.enter.before`, `holding.entered`, `holding.blocked`, and `holding.destroyed`; creature events retain the `creature` prefix. Activation emits `ability.activated`. For hand-to-field activations, use `target: "friendly-hand-field"` with `placement: true`: legal actions provide private hand targets and free `slots`, and an `activate` command includes both `target` and `slot`. The handler issues a `deploy` order; deployment reuses normal entry events without energy payment. The client selects a hand card first, then a free position. No valid field card or free position means no activation is offered.

`legendary: true` gives a one-copy limit and the gilded frame; also set `rarity: "legendary"`. Keep `id` and `deckLimitKey` stable for the logical card. Future artwork choices will be separate from ownership and do not create additional card copies.

Optional `lore` is the card text, styled in italics above the ability boxes in the inspector. Rules text comes directly from ability descriptions; there is no separate handwritten rules summary. The old `text` field is no longer used. It works for creatures and spells and is included in card searches. Omit it or leave it empty when a card has no lore. Plain text only; use `\n` for line breaks.

```json
"lore": "The crown endures where its runes still shine."
```

## English and German card text

`data.json` holds the English, canonical card. German lives in a separate file next to it, with only the translated fields:

```
assets/cards/crown-scout/
  data.json      English card (no translations)
  data.de.json   German name and lore
```

```json
{
  "$schema": "../../schemas/card-translation.schema.json",
  "name": "Späher der Krone",
  "lore": "Ein erster Kundschafter für die Krone."
}
```

`name` is required. `lore` is optional, but provide it whenever the English card has lore; `lore: ""` deliberately hides lore in German. Nothing else is allowed in the file. A `translations` key inside `data.json` is rejected with a pointer to `data.de.json`. A card without `data.de.json` falls back to its English text. `de` is the only supported language for now; any other `data.<language>.json` is rejected.

Type, subtypes, rarity and rules wording are not translated per card. They are static terms, translated once in `packages/ui/src/i18n/de.json` (for example `"Human": "Mensch"`), so a new subtype such as `elf` only needs one dictionary entry, written with a capital letter. The importer merges each `data.de.json` into the generated catalogue, the card browser and deck builder search both languages, and the Settings language choice changes card faces, inspectors, tutorial references and public log text.

Ability names and descriptions belong to the extension, with the same optional `translations` map:

```ts
translations: {
  de: {
    name: "Rüstung {amount}",
    description: "Verringere jeden erlittenen Schaden um {amount}, bis auf null.",
  },
},
```

Translated ability templates use the same binding parameters and are validated alongside the base templates. IDs, costs, stats and mechanics remain unchanged. Translation-only edits do not change the gameplay content hash or invalidate saves/replays. All active cards and abilities currently include German text.

## Factions

Each faction is one file, `assets/factions/<faction-id>.json`. The file name must match the `id`, and IDs use lowercase letters, digits and hyphens. `neutral.json` is required: Neutral is authored like any faction (name, short label, color), but its rules are built in. Neutral cards have no named faction and pay with generic energy; Neutral is not valid in `cost.factions`. Neutral can have a `pack` like any faction, and its pack draws the factionless cards.

```json
{
  "id": "crownlands",
  "name": "The Crownlands",
  "short": "Crown",
  "color": "#deb966",
  "pack": {
    "id": "crown",
    "name": "Banners of the Crown",
    "blurb": "Knights, banners and holdings. Only Crownlands cards."
  },
  "starter": {
    "id": "crown",
    "name": "Banners of the Crown",
    "default": true,
    "cards": { "goldfield-farmer": 3, "crownlands-recruit": 3, "alderic-warmaster-of-the-empire": 1 }
  }
}
```

| Field | Meaning |
| --- | --- |
| `id` | Stable faction ID used in card `factions`, `cost.factions` and `energyOutputs` |
| `name` | Full name, shown in card details and filters |
| `short` | Short label on card faces |
| `color` | `#rrggbb` accent for energy, packs and highlights |
| `starter` | Optional. A ready-made deck for this faction: its stable `id`, a `name`, and `cards` as card ID → copies (the list shown is shortened). `"default": true` makes it the deck new players start with; only one faction may set it, and without one the first starter (by faction ID) is used |
| `pack` | Optional. Adds a store booster that draws only this faction's cards. `pack.id` must be unique (and not `bounty`) and must stay stable once players own packs |

Unknown keys, malformed colors and duplicate pack IDs fail the import with the file's path. A missing `neutral.json` fails too. Cards that name a faction without a file also fail. `npm run import:cards` (or `npm run dev`) validates every faction and generates `packages/content/src/factions.json`; do not edit that file by hand. The UI, deck builder filters, energy symbols, booster packs and card validation all read this one list. To remove a faction, delete its file (which also removes its pack and starter deck) and every card that references it.

## Abilities

Abilities live in three lists under `packages/extensions/src/`:

- `index.ts` holds the **evergreen** keywords (`evergreenAbilities`): scalable ones such as Banner and Armor, and parameterless fixed-rule keywords such as Fealty and Soul Harvest that mostly appear on faction leaders. Any card of any faction can use any of them.
- `spellAbilities.ts` holds the **spell** abilities (`spellAbilities`). They resolve when a spell is cast and are not tied to a faction.

Evergreen:

| ID | Params | Behavior |
| --- | --- | --- |
| `armor` | `{ "amount": 1 }` | Reduce each incoming hit |
| `banner` | `{ "amount": 1 }` | Immediately neighboring friendly creatures and holdings gain Attack |
| `outflank` | `{ "amount": 3 }` | While on the Left or Right Flank, the creature gains Attack |
| `drillmaster` | `{ "amount": 1, "subtype": "archer" }` | Immediately neighboring friendly creatures of that subtype gain Attack |
| `bind` | `{ "amount": 1, "subtype": "undead" }` | All your other creatures of that subtype gain Defense, wherever they stand. A creature with 0 Defense is destroyed at the next state check, so bound creatures can be printed with Defense 0 |
| `consume` | `{ "amount": 1 }` | Additional cost of playing the card (creature, holding or spell): sacrifice one of your creatures whose total cost is at least that much. A creature enters the sacrificed creature's position |
| `shield-wall` | `{ "amount": 1 }` | Immediately neighboring friendly creatures and holdings gain Defense |
| `guard` | `{}` | Attacks aimed at a lane adjacent to this card are blocked by it instead, even if that lane is empty. A Guard in a targeted lane blocks there first; each Guard stops one attacker per combat |
| `sneaky` | `{}` | The creature cannot be blocked, neither by the card in its lane nor by a Guard, so its attack always damages the opposing player. It still blocks normally itself |
| `forced-march` | `{}` | The creature enters ready instead of exhausted, so it can attack or channel energy the turn it is played. Holdings are unaffected |
| `muster` | `{ "card": "card-id" }` | When played, search your library for every copy of that card (by card ID) and put them all into your hand. Finding none is allowed and just logs it. Also works as a spell operation. The importer rejects unknown card IDs |
| `ransack` | `{}` | When played (or cast, as a spell operation), look at your opponent's hand and choose one card; they discard it. Opens a private choice for you, so the match waits until you pick. An empty hand just logs it |
| `scorch` | `{ "amount": 3 }` | On play, choose an enemy creature in range (the lane opposite or one beside the position it enters) or the enemy player, and deal that much damage. Holdings cannot be chosen. Entering by Rally or Raise has no chosen target, so nothing is burned |
| `charge` | `{ "amount": 4 }` | On play, damage the enemy creature directly opposite |
| `rest` | `{ "amount": 1 }` | Exhaust: restore life |
| `weaken` | `{ "amount": 1 }` | The opposing field card in the same slot loses Attack while the source remains |
| `longshot` | `{ "amount": 1 }` | Exhaust in the play phase to damage any enemy creature |
| `primal` | `{ "amount": 1 }` | Exhaust during the play phase to produce that much energy of one chosen faction; no printed production is implied |

Spell:

| ID | Params | Behavior |
| --- | --- | --- |
| `damage` | `{ "amount": 2 }` | Target an enemy field card or player |
| `barrage` | `{ "amount": 1 }` | Damage every enemy creature |
| `heal` | `{ "amount": 1 }` | Heal the caster |
| `draw` | `{ "amount": 2 }` | Draw cards from the caster's library |
| `rage` | `{ "amount": 1 }` | A friendly creature gains Attack until end of turn |
| `steadfast` | `{ "amount": 1 }` | A friendly creature gains Defense until end of turn |
| `destroy` | `{}` | Destroy a target enemy creature (holdings and players cannot be chosen) |
| `raise` | `{ "subtype": "undead" }` | Choose a creature of that subtype in your discard pile, then a free friendly slot; it returns to the battlefield ready. Only castable with a match in the pile and a free slot |
| `channel` | `{ "amount": 2, "energy": "bright-marches" }` | Adds that much energy of the chosen faction (or `"neutral"`) to the current casting pool after the cost is paid. Faction energy also pays generic costs; neutral energy cannot pay faction costs |

Faction keywords such as `soul-harvest` (Black Host: draw a card when another friendly creature is destroyed) and `dark-harvest` (Black Host: exhaust to put your top library card into the discard pile and gain 2 Host energy; unavailable when it would empty your library) are described with their faction.

Spell abilities are cast-only: creatures and holdings cannot carry them, and the import rejects a field card that does. A spell effect with `placement: true` (such as `raise`) also asks the player for a free friendly slot; the `play` command then includes `slot`.

Ready, Consume, Battlecry, Deathbound, Collector, Return, Blood Price and Reckoning are kept as commented reference implementations in that file. Uncomment an entry and any indicated helper/import before using its ID. Unknown or disabled abilities fail import; they are never silently ignored. A genuinely new mechanic needs a validated engine handler and a meaningful test. Increment the handler's `version` when its behavior changes.

Every ability definition requires a player-facing `name` and `description`. The inspector stacks one text box per ability, with its name and explanation together, including spell `cast` effects. Both strings can use `{param}` placeholders from the card's binding:

```ts
extension("armor", amountSchema, {
  name: "Armor {amount}",
  description: "Reduce each incoming damage hit by {amount}, down to zero.",
  // Existing rules handler goes here.
})
```

A card binding `{ "id": "armor", "params": { "amount": 2 } }` displays **Armor 2** and the description with **2** substituted. Write the description once in the ability definition, not in every card JSON. Empty names/descriptions or missing text parameters fail import. Use card `lore` for flavor; define all rules through abilities and their descriptions.

## Battlefield positions

Each player's row is permanently ordered **Left Flank, Left Wing, Center, Right Wing, Right Flank**, with engine slots **0, 1, 2, 3, 4**. The Center is always slot 2, even if the other slots are empty. Deployment chooses an empty position; a creature or holding cannot move between positions while on the field. Dragging specifies the position directly, and the Deploy button asks you to choose one.

Bind any of these abilities in a card's `abilities` array:

```json
[
  { "id": "banner", "params": { "amount": 1 } },
  { "id": "guard", "params": {} },
  { "id": "charge", "params": { "amount": 4 } }
]
```

These are independent examples; you can use any one or combine them. `banner` affects only slots one step away on the same friendly row, never the source itself. Empty slots do not close the gap and the two flanks are not neighbors. Effects stack and remain active while the source is exhausted.

`charge` fires automatically once when this card is played, before combat. It targets the creature directly opposite the slot the card was played into. It uses normal damage and Armor. If the position is empty or contains a holding, nothing happens; it does not redirect to another card or the player, and does not prevent deployment. Charge grants no additional readiness or ability to attack on entry.

For new extensions, import `battlefieldPositions`, `positionSlot`, `positionName`, or `areAdjacent` from `packages/contracts/src`. Static modifiers already receive both field cards, including their slots. Hooks receive `ctx.registry` alongside `ctx.state`, so they can inspect a positional occupant's definition. `canBlock(source, attacker, blocker, params, registry)` is a pure restriction on either participant: return false to forbid the pair. Restrictions are combined; they cannot make an otherwise invalid block legal. Keep effects in the existing queued `ctx.issue(...)` flow.

## Import and test decks

Run `npm run import:cards`, or leave `npm run dev` running for automatic imports. Each card needs a valid PNG; animations must be real WebM files, not renamed MP4s. Do not set `art` or `animation` paths in JSON; the importer derives them from your folder. Invalid edits report their source path and retain the last successful catalogue. Replacing artwork refreshes its URL automatically.

Starter decks are part of the faction file (`starter` above). Names, IDs and card counts are edited there. Unfinished starter decks can be imported and edited, but cannot start a game. Unknown card references and excess copies still fail import. Removing a card requires removing its starter references too.

The menu, card browser and deck builder work before any deck is complete. Play requires at least 30 cards, at most three per card identity, and one per legendary. A complete custom deck can play a mirror if no starter is complete yet. A valid second starter becomes the opponent when available.

Removed prototype cards and inactive abilities are retained only as regression fixtures under `tests/fixtures/`; these do not appear in the game. The old seed/art generators have been removed so they cannot overwrite your content. Existing saved matches/decks that reference removed cards cannot be resumed with this reset; browser storage is not erased automatically.

## Boosters and collection testing

The **Store** opens owned five-card boosters and sells more for Crowns. A new collection receives the starter's cards and five Realm’s Bounty boosters. Foundations draws from its set; Realm’s Bounty uses the whole catalogue. Retired faction boosters convert one-for-one into Realm’s Bounty on loading, without changing card counts or Crowns. Each slot independently rolls common 70%, rare 25%, legendary 5%, then chooses uniformly within that rarity. Duplicates are allowed, with no guaranteed rarity. Missing rarity weights are omitted and the remaining weights normalized. Tune these POC odds in `packages/content/src/boosters.ts`; the sampler accepts an injected random source and has no browser dependency.

Collections keep at most three copies per card ID, or one per legendary. Extras grant 10/25/100 Crowns for common/rare/legendary cards. Boosters cost 100 Crowns; eligible wins grant 25 Crowns and one Realm’s Bounty booster. Economy values are centralized in `apps/web/src/collection.ts`. The Store's debug button grants 1,000 Crowns for testing.

Rewards are granted once when opening begins and saved under `varhyr-collection-v1`. Revealing, inspecting or closing a pack does not grant additional cards. Animation can be skipped, and reduced motion reveals cards immediately. The deck builder and Play enforce owned copy counts as well as deck copy limits. Previous prototype booster rewards are migrated into the collection. This is local progression; online ownership is not independently verified by a backend.

## Background music

Every `.mp3` in `assets/audio/` is part of the application soundtrack; add or remove files to change it. Tracks play in random order, never the same one twice in a row, and Vite includes them in production builds. Music starts when the player dismisses the splash, continues across menus and matches, and pauses when the tab is hidden. Settings stores separate music and effect switches and volumes. The splash unlocks audio without overriding a saved mute choice.


## Hero portraits

The nine player heroes are authored in `packages/content/src/avatars.json`, in display order:

| Empire | | |
| --- | --- | --- |
| Alderic | Morie | Bosci |
| Dwell | The Lonely Wanderer | Ilyria |
| Hekata | Brut | The Dark Priest of Run |

Each entry records its original filename in `assets/avatars/` and its optimized portrait URL in `public/avatars/`. Change the name, title, lore, accent, or portrait there; German profile text lives in `packages/ui/src/i18n/de.json`. `defaultAvatarId` in `packages/content/src/avatars.ts` explicitly selects the Wanderer, independently of the grid order. Retired or unknown saved avatar IDs fall back to that hero without changing the player's name.


## Foundations leaders

Leaders are normal legendary creatures with the `leader` subtype, not a separate card type or an avatar ability. They use the existing legendary frame/foil and one-copy limit. Alderic uses his restored original knight illustration and animated WebM. The other eight leaders use full-scene painterly card illustrations; the selected avatar portraits served as identity references. Selecting an avatar does not grant or automatically include its card in a deck.

| Faction | Leader / card ID | Role |
| --- | --- | --- |
| Crownlands | Alderic / `alderic-warmaster-of-the-empire` | Fealty strengthens every friendly creature, including its source |
| Northern League | Morie / `morie-grandmistress-of-winter` | Accord fuels the first spell each turn; Charge hits the lane opposite |
| Bright Marches | Bosci / `bosci-lord-of-seacliffe` | Rally deploys reinforcements from hand for free; Guard holds the frontier |
| Mountain Clans | Dwell / `dwell-merchant-of-the-mountains` | Trade adds neutral energy to Clan production |
| Neutral | The Lonely Wanderer / `the-lonely-wanderer` | Wayfarer returns a friendly creature to hand |
| Conclave | Ilyria / `ilyria-queen-of-the-elves` | Sanctuary and Guard protect forest approaches |
| Ember Fields | Hekata / `hekata-lady-of-the-fields` | Scorch burns the deployment lane; Charge strikes the opposite creature |
| Horde | Brut / `brut-chief-of-the-harpies` | Raid rewards neighboring creatures |
| Black Host | Dark Priest of Run / `the-dark-priest-of-run` | Weaken and Soul Harvest turn casualties into cards; Dark Harvest (Black Shaman) trades library cards for Host energy |

Alderic's original `alderic-warmaster-of-the-empire` ID and deck-limit key are retained for existing collections and the Crown starter. Winter's retired mechanics remain test-only fixtures; do not restore them under `assets/cards/` unless you intend them to rejoin the live catalogue. The three existing neutral Winter-era support cards remain neutral cards.


## Faction signatures

Faction leaders carry fixed-rule keywords such as Fealty and Accord. They are unnumbered and require `"params": {}`; passing an `amount` fails validation. They are ordinary abilities, not tied to a faction, so any card can use them. Rules boxes show their name and description without a badge or special border.

A card binds a keyword with an explicit entry in `abilities`. Abilities are not restricted by faction; the studio and the importer offer and accept every ability on every card it can sensibly be on.

| Faction | Ability ID | Example params | Effect |
| --- | --- | --- | --- |
| Crownlands | `fealty` | `{}` | All friendly creatures, including self, gain +1 Attack and +1 Defense |
| Northern League | `accord` | `{}` | First spell cast during your play phase each turn grants 1 Northern League energy; earlier casts count |
| Bright Marches | `marches-rally` | `{}` | Rally: exhaust to deploy a creature or holding from hand into a free position without paying energy; normal entry effects apply |
| Mountain Clans | `trade` | `{}` | Channeling adds 1 neutral energy; death energy remains the printed output |
| Conclave | `sanctuary` | `{}` | Adjacent friendly creatures gain +1 Defense, or +2 if they are elves; always continuous |
| Horde | `raid` | `{}` | Self gains +1 Attack per adjacent friendly creature; holdings do not count |
| Black Host | `soul-harvest` | `{}` | Another friendly creature's death draws one card; excludes holdings and the source itself |
| Neutral | `wayfarer` | `{}` | Exhaust to return a friendly creature, including itself, to hand; clears damage, refunds no costs |

Visual effects are automatic on new cards using these keywords. Fealty, Sanctuary and Raid read the actual static modifiers; triggered and activated abilities supply public event attribution, never private draw identities. Their presentation lives in `apps/web/src/factionEffects.ts`, `FactionAbilityEffects.tsx` and `faction-effects.css`, and follows the shared match presentation for local play, online matches and replays. Reduced motion keeps stationary buff cues.

The parameterless keyword handlers live in `packages/extensions/src/index.ts`, with strict empty-parameter schemas. A card binds a keyword as `{ "id": "fealty", "params": {} }`, which displays **Fealty** in English and **Lehnstreue** in German. Shared abilities stay in `index.ts`; the old generic Collector example remains commented there as documentation. Raid uses the optional public battlefield context passed to `static(source, target, params, registry, state)`. Inspect printed stats for comparisons, not `effectiveStats`, to avoid recursive modifier evaluation. The context contains only board/card information shared by engine state and player views.

Eight card paintings were created with the built-in image generator and saved to their normal `assets/cards/<leader>/data.png` paths. The complete prompts, style references, original portrait references and destinations are recorded in `assets/hero-art-prompts.json`. Ban Vale Cavalry and Borrowed Wisdom were style references and remain unchanged. Alderic’s `data.png` and `data.webm` were restored from the original assets.

## Faction icon family

Faction emblems are authored as `assets/faction-icons/<faction-id>.svg` and discovered automatically by the renderer. All nine current factions, including Neutral, have matching SVGs. Use a `0 0 24 24` viewBox, `fill="currentColor"`, `fill-rule="evenodd"`, and path geometry only. Use etched shapes with tapered stroke outlines and generous open space, avoiding decorative frames and hairlines. Keep detail restrained: these emblems appear at 14–20px beside energy counts and costs. The faction JSON color tints each emblem; the shape carries its identity without relying on color. `FactionIcon` is shared by card faces, inspectors, energy pools, match portraits, faction-filter selections, collection statistics and faction booster artwork. See `assets/faction-icons/README.md` for the motifs.
