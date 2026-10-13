# Adding test cards

The current catalogue has 26 cards across eight factions plus Neutral, including one legendary leader for each faction and the neutral Wanderer. Definitions live in `assets/factions/`, and cards live in `assets/cards/`. Banners of the Crown remains a legal 30-card starter. The original 15 Winter POC cards and Winter Accord starter are retired; the remaining factions start with their leaders for authoring new content. All current cards belong to **RoV: Foundations**, defined in `assets/sets/foundations.json`. The 30-card minimum and normal/legendary copy limits still apply to every deck.

## Sets and expansions

A card belongs to exactly one set via its required `set` ID. All 26 current cards use `"set": "foundations"`. Factions describe the card’s affiliations; sets describe its release. A set may feature one faction, several factions, neutral cards, or introduce factions. Faction focus is descriptive and does not constrain membership or deck construction.

Author one file per set at `assets/sets/<set-id>.json`, with a matching stable `id`:

```json
{
  "id": "foundations",
  "name": "RoV: Foundations",
  "code": "FND",
  "description": "The first age of Varhyr.",
  "color": "#d4bd85",
  "symbol": "⟐",
  "factions": ["crownlands", "winter-league", "neutral"],
  "introduces": ["crownlands", "winter-league"],
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

`assets/schemas/card.schema.json` describes `data.json` and `assets/schemas/card-translation.schema.json` describes `data.<language>.json`. Every card file points at its schema with `$schema`, and `.vscode/settings.json` maps both file patterns, so VS Code offers completion and flags mistakes as you type: unknown factions, sets, energy keys and ability IDs, wrong ability parameters (such as a Charge without a `position`), and spell or bastion restrictions.

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

Ancient Unicorn has no printed energy output (`energyOutputs: []`). Its **Primal** ability (`{"id":"primal","params":{}}`, **Urkraft** in German) exhausts it during the play phase to produce one energy of a chosen faction. It generates no death energy. Other creatures may also omit printed production. Primal is an activated ability, not a separate energy type.

For a spell, omit `stats` and use `type: "spell"`, `timing: ["play"]` and a nonempty `cast` list. Example from Cleansing Light:

```json
"cast": [
  { "id": "damage", "params": { "amount": 2 } },
  { "id": "heal", "params": { "amount": 1 } }
]
```

Normal spells are played before combat. `"death"` timing supports the defender's death-energy window; there is no post-combat normal casting or combat trick window.

## Bastions and activated abilities

Use `type: "bastion"` for defensive field cards. They share the five field slots with creatures, enter exhausted, and ready at the end of their controller's turn. A bastion cannot attack or generate energy, including death energy. It can block even while exhausted and deals its `stats.attack` as **defensive damage** simultaneously with the attacker. Omit `energyOutputs`; the importer normalizes it to `[]` and rejects nonempty outputs.

Crown Bastion is a complete example in `assets/cards/crown-bastion/`: its artwork temporarily reuses Runeguard's still. Its stats and effects are:

```json
"type": "bastion",
"stats": { "attack": 1, "defense": 4 },
"abilities": [
  { "id": "war-banner", "params": { "amount": 1 } },
  { "id": "rally", "params": { "amount": 1 } }
]
```

Continuous modifiers use an extension's `static(source, target, params, registry)` hook. They apply while the source is on the field, even exhausted. War Banner boosts other friendly **creatures**, not bastions.

Activated effects use `activate(ctx, params)` instead of `cast`. Optional `canActivate(source, state, params, registry)` adds a public eligibility restriction, enforced by legal actions and the command validator. Invocation uses this to require an opposing creature in the same position. Activation is available only on a ready field card during its controller's play phase, and exhausts the source before resolving. This initial model has no additional energy cost and no combat or post-combat activation window. Creatures can also have activated abilities; the action popover lets the player choose between channeling and activating. Different activated bindings can coexist; activating any one exhausts the card.

Primal uses `target: "energy-type"` and `activationEnergy(params, registry)` to declare its one-faction output choices. The UI offers those choices as a semicircle of faction symbols above the card and sends the selected faction as the activation's `target`; the engine validates it before exhausting the source. The handler issues `gain-energy` with that faction. Declared activated production also counts in the deck builder and bot funding plans, but it is never included in death energy.

```ts
extension("rally", amountSchema, {
  name: "Restore {amount}",
  description: "Exhaust during your play phase to restore {amount} life to yourself.",
  activate: (ctx, p) => ctx.issue({
    type: "heal", target: ctx.source.controller, amount: amount(p),
  }),
})
```

Rally (`marches-rally`) is exclusive to the Marches. The older healing binding keeps its internal ID `rally`, but displays **Restore**, so it cannot be confused with the new deployment action.

An extension's `target` can be `enemy-any` (enemy player or any enemy field card), `friendly-field`, `enemy-field`, `friendly-creature`, or `enemy-creature`. Targeted activations select their own target at activation, not deployment. They are unavailable when no valid target exists. Creature-only effects and Consume exclude bastions. Bastion entry, blocking and death events are `bastion.enter.before`, `bastion.entered`, `bastion.blocked`, and `bastion.destroyed`; creature events retain the `creature` prefix. Activation emits `ability.activated`. For hand-to-field activations, use `target: "friendly-hand-field"` with `placement: true`: legal actions provide private hand targets and free `slots`, and an `activate` command includes both `target` and `slot`. The handler issues a `deploy` order; deployment reuses normal entry events without energy payment. The client selects a hand card first, then a free position. No valid field card or free position means no activation is offered.

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

Type, subtypes, rarity and rules wording are not translated per card. They are static terms, translated once in `apps/web/src/i18n/de.json` (for example `"Human": "Mensch"`), so a new subtype such as `elf` only needs one dictionary entry, written with a capital letter. The importer merges each `data.de.json` into the generated catalogue, the card browser and deck builder search both languages, and the Settings language choice changes card faces, inspectors, tutorial references and public log text.

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
    "blurb": "Knights, banners and bastions. Only Crownlands cards."
  },
  "starter": {
    "id": "crown",
    "name": "Banners of the Crown",
    "default": true,
    "cards": { "goldfield-farmer": 3, "crown-recruit": 3, "aldric-runewarden": 1 }
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
| `signatureAbility` | Optional registered ability ID: authoring metadata for this faction’s exclusive keyword; does not automatically grant it to cards or add a UI label |
| `pack` | Optional. Adds a store booster that draws only this faction's cards. `pack.id` must be unique (and not `bounty`) and must stay stable once players own packs |

Unknown keys, malformed colors and duplicate pack IDs fail the import with the file's path. A missing `neutral.json` fails too. Cards that name a faction without a file also fail. `npm run import:cards` (or `npm run dev`) validates every faction and generates `packages/content/src/factions.json`; do not edit that file by hand. The UI, deck builder filters, energy symbols, booster packs and card validation all read this one list. To remove a faction, delete its file (which also removes its pack and starter deck) and every card that references it.

## Abilities

In `packages/extensions/src/index.ts`, the active IDs are:

| ID | Params | Behavior |
| --- | --- | --- |
| `armor` | `{ "amount": 1 }` | Reduce each incoming hit |
| `war-banner` | `{ "amount": 1 }` | Other friendly creatures gain Attack |
| `adjacent-banner` | `{ "amount": 1 }` | Formation: immediately neighboring friendly creatures and bastions gain Attack |
| `flank-evasion` | `{}` | A card in either flank cannot block it, so attacking a flank lane hits the player |
| `guard` | `{}` | Attacks aimed at a lane adjacent to this card are blocked by it instead, even if that lane is empty. A Guard in a targeted lane blocks there first; each Guard stops one attacker per combat |
| `charge` | `{ "amount": 4, "position": "Center" }` | On play, damage the enemy creature in that position |
| `damage` | `{ "amount": 2 }` | Target an enemy field card or player (spell operation) |
| `heal` | `{ "amount": 1 }` | Heal the caster (spell operation) |
| `draw` | `{ "amount": 2 }` | Draw cards from the caster's library (spell operation) |
| `rime` | `{ "amount": 1 }` | Opposing field card in the same slot loses Attack while the source remains |
| `invocation` | `{ "amount": 1 }` | Exhaust in the play phase to damage the opposing creature in the same slot; requires a creature there |
| `primal` | `{}` | Exhaust during the play phase to produce 1 energy of a chosen faction; no printed production is implied |
| `channel` | `{ "amount": 2, "energy": "bright-marches" }` | Spell adds that much energy of the chosen faction (or `"neutral"`) to the current casting pool after its cost is paid. Faction energy also pays generic costs; neutral energy cannot pay faction costs |
| `soul-harvest` | `{}` | Black Host only. Soul Harvest: while on the field, draw one card when another friendly creature is destroyed; excludes bastions and the source itself |
| `rally` | `{ "amount": 1 }` | Restore: exhaust during your play phase to restore life (activated ability) |

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

Each player's row is permanently ordered **Left Flank, Left Wing, Center, Right Wing, Right Flank**, with engine slots **0, 1, 2, 3, 4**. The Center is always slot 2, even if the other slots are empty. Deployment chooses an empty position; a creature or bastion cannot move between positions while on the field. Dragging specifies the position directly, and the Deploy button asks you to choose one.

Bind any of these abilities in a card's `abilities` array:

```json
[
  { "id": "adjacent-banner", "params": { "amount": 1 } },
  { "id": "flank-evasion", "params": {} },
  { "id": "charge", "params": { "amount": 4, "position": "Center" } }
]
```

These are independent examples; you can use any one or combine them. `adjacent-banner` affects only slots one step away on the same friendly row, never the source itself. Empty slots do not close the gap and the two flanks are not neighbors. Effects stack and remain active while the source is exhausted.

`flank-evasion` checks the **defender's** position: a card in slot 0 or 4 cannot block that attacker, so attacking Left Flank or Right Flank with it goes through to the player. Blocking is automatic: an attacker targets its own lane or an adjacent one, and the card in the targeted lane blocks if `canBlock` allows it. Each attacker has at most one blocker, each defender blocks at most one attacker (no two attackers may target the same lane), and `legalActions().lanes` publishes each attacker's reachable lanes. The UI and bot use the same rule.

`charge` fires automatically once when this card is played, before combat. `position` must match one of the five names exactly. It targets the opposing creature in that position, regardless of the charger's own deployment position. It uses normal damage and Armor. If the position is empty or contains a bastion, nothing happens; it does not redirect to another card or the player, and does not prevent deployment. Charge grants no additional readiness or ability to attack on entry.

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

`assets/audio/ambience.mp3` is the looping application soundtrack. Replace this file to change the music; Vite includes it in production builds. It starts when the player dismisses the splash, continues across menus and matches, and pauses when the tab is hidden. Settings stores separate music and effect switches and volumes. The splash unlocks audio without overriding a saved mute choice.


## Hero portraits

The nine player heroes are authored in `packages/content/src/avatars.json`, in display order:

| Empire | | |
| --- | --- | --- |
| Alderic | Morie | Bosci |
| Dwell | The Lonely Wanderer | Ilyria |
| Hekata | Brut | The Dark Priest of Run |

Each entry records its original filename in `assets/avatars/` and its optimized portrait URL in `public/avatars/`. Change the name, title, lore, accent, or portrait there; German profile text lives in `apps/web/src/i18n/de.json`. `defaultAvatarId` in `packages/content/src/avatars.ts` explicitly selects the Wanderer, independently of the grid order. Retired or unknown saved avatar IDs fall back to that hero without changing the player's name.


## Foundations leaders

Leaders are normal legendary creatures with the `leader` subtype, not a separate card type or an avatar ability. They use the existing legendary frame/foil and one-copy limit. Alderic uses his restored original knight illustration and animated WebM. The other eight leaders use full-scene painterly card illustrations; the selected avatar portraits served as identity references. Selecting an avatar does not grant or automatically include its card in a deck.

| Faction | Leader / card ID | Role |
| --- | --- | --- |
| Crownlands | Alderic / `aldric-runewarden` | Fealty strengthens every friendly creature, including its source |
| League of Winter | Morie / `morie-grandmistress` | Accord fuels the first spell each turn; Invocation provides positional magic |
| Bright Marches | Bosci / `bosci-lord-of-seacliffe` | Rally deploys reinforcements from hand for free; Guard holds the frontier |
| Mountain Clans | Dwell / `dwell-mountain-merchant` | Trade adds neutral energy to Clan production |
| Neutral | The Lonely Wanderer / `the-lonely-wanderer` | Wayfarer returns a friendly creature to hand |
| Conclave | Ilyria / `ilyria-queen-of-the-elves` | Sanctuary and Guard protect forest approaches |
| Ember Fields | Hekata / `hekata-lady-of-the-fields` | Scorch burns the deployment lane; Invocation sustains pressure |
| Horde | Brut / `brut-chief-of-the-harpies` | Raid rewards neighboring creatures; Flank Evasion pressures edges |
| Black Host | Dark Priest of Run / `dark-priest-of-run` | Rime and Soul Harvest turn casualties into cards |

Alderic's original `aldric-runewarden` ID and deck-limit key are retained for existing collections and the Crown starter. Winter's retired mechanics remain test-only fixtures; do not restore them under `assets/cards/` unless you intend them to rejoin the live catalogue. The three existing neutral Winter-era support cards remain neutral cards.


## Faction signatures

Each faction has a distinct, faction-exclusive keyword representing its identity. All nine are unnumbered, fixed rules and require `"params": {}`. Numeric strengths belong in their descriptions and handlers, not in individual card bindings; passing an `amount` fails validation. Leaders use it, and other cards belonging to that faction can use it too. Ordinary rules boxes show its name and description without a signature badge or special border.

`signatureAbility` in the faction file is authoring metadata only. Its ID must refer to an ability whose `faction` matches that file; generic or other-faction abilities fail import. Cards still need an explicit binding in `abilities`. The pure content compiler enforces affiliation: a Crown/Winter card may use Fealty and Accord, while a Crown-only card cannot use Accord. Neutral's Wayfarer requires a factionless card. Generic abilities such as Armor, Formation and Rime remain available across factions.

| Faction | Ability ID | Example params | Effect |
| --- | --- | --- | --- |
| Crownlands | `fealty` | `{}` | All friendly creatures, including self, gain +1 Attack and +1 Defense |
| League of Winter | `accord` | `{}` | First spell cast during your play phase each turn grants 1 Winter energy; earlier casts count |
| Bright Marches | `marches-rally` | `{}` | Rally: exhaust to deploy a creature or bastion from hand into a free position without paying energy; normal entry effects apply |
| Mountain Clans | `trade` | `{}` | Channeling adds 1 neutral energy; death energy remains the printed output |
| Conclave | `sanctuary` | `{}` | Adjacent friendly creatures gain +1 Defense, or +2 if they are elves; always continuous |
| Ember Fields | `scorch` | `{}` | On deployment, deal 3 damage to the opposite creature **or bastion**; never a player |
| Horde | `raid` | `{}` | Self gains +1 Attack per adjacent friendly creature; bastions do not count |
| Black Host | `soul-harvest` | `{}` | Another friendly creature's death draws one card; excludes bastions and the source itself |
| Neutral | `wayfarer` | `{}` | Exhaust to return a friendly creature, including itself, to hand; clears damage, refunds no costs |

Visual effects are automatic on new cards using these keywords. Fealty, Sanctuary and Raid read the actual static modifiers; triggered and activated abilities supply public event attribution, never private draw identities. Their presentation lives in `apps/web/src/factionEffects.ts`, `FactionAbilityEffects.tsx` and `faction-effects.css`, and follows the shared match presentation for local play, online matches and replays. Reduced motion keeps stationary buff cues.

The nine exclusive keyword handlers live in `packages/extensions/src/signatureAbilities.ts`, with strict empty-parameter schemas. A card binds a keyword as `{ "id": "fealty", "params": {} }`, which displays **Fealty** in English and **Lehnstreue** in German. Their `faction` is enforced during content compilation and included in compatibility hashing. Shared abilities stay in `index.ts`; the old generic Collector example remains commented there as documentation. Raid uses the optional public battlefield context passed to `static(source, target, params, registry, state)`. Inspect printed stats for comparisons, not `effectiveStats`, to avoid recursive modifier evaluation. The context contains only board/card information shared by engine state and player views.

Eight card paintings were created with the built-in image generator and saved to their normal `assets/cards/<leader>/data.png` paths. The complete prompts, style references, original portrait references and destinations are recorded in `assets/hero-art-prompts.json`. Ban Vale Cavalry and Borrowed Wisdom were style references and remain unchanged. Alderic’s `data.png` and `data.webm` were restored from the original assets.

## Faction icon family

Faction emblems are authored as `assets/faction-icons/<faction-id>.svg` and discovered automatically by the renderer. All nine current factions, including Neutral, have matching SVGs. Use a `0 0 24 24` viewBox, `fill="currentColor"`, `fill-rule="evenodd"`, and path geometry only. Use etched shapes with tapered stroke outlines and generous open space, avoiding decorative frames and hairlines. Keep detail restrained: these emblems appear at 14–20px beside energy counts and costs. The faction JSON color tints each emblem; the shape carries its identity without relying on color. `FactionIcon` is shared by card faces, inspectors, energy pools, match portraits, faction-filter selections, collection statistics and faction booster artwork. See `assets/faction-icons/README.md` for the motifs.
