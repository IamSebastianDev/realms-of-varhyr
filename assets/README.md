# Adding test cards

Crownlands is the only faction right now. Its definition is `assets/factions/crownlands.json`; its fifteen cards live in `assets/cards/`. The 30-card minimum and normal/legendary copy limits apply to every deck, and the Crown starter deck is deliberately unfinished until more content exists.

## Card folders

Cards and factions are separate:

```
assets/
  cards/<card-name>/
    data.json    required definition
    data.png     required still artwork
    data.webm    optional actual WebM animation
  factions/<faction-id>.json
```

Create one folder per card under `assets/cards/`.

Use lowercase folder names with hyphens. Keep the card `id` stable when renaming its folder or display name. Do not edit generated files in `packages/content/src/cards.json` or `public/cards/`.

A complete creature definition:

```json
{
  "id": "crown-scout",
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

`cost.generic` accepts any energy; `cost.factions` requires the named energy and can be omitted when there are no faction costs. Entries in `energyOutputs` are alternatives: `[{"crownlands":1},{"another-faction":1}]` means choose either. One entry with two keys produces both. Neutral cards can use `factions: ["neutral"]` or `factions: []`; both import as factionless cards. Do not combine Neutral with named factions. To produce two neutral energy, use `energyOutputs: [{"neutral":2}]`. `generic` describes a payment requirement, not an output energy type. Neutral appears in the collection and deck builder's faction filter.

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

Activated effects use `activate(ctx, params)` instead of `cast`. Activation is available only on a ready field card during its controller's play phase, and exhausts the source before resolving. This initial model has no additional energy cost and no combat or post-combat activation window. Creatures can also have activated abilities; the action popover lets the player choose between channeling and activating. Different activated bindings can coexist; activating any one exhausts the card.

```ts
extension("rally", amountSchema, {
  name: "Rally {amount}",
  description: "Exhaust during your play phase to restore {amount} life to yourself.",
  activate: (ctx, p) => ctx.issue({
    type: "heal", target: ctx.source.controller, amount: amount(p),
  }),
})
```

An extension's `target` can be `enemy-any` (enemy player or any enemy field card), `friendly-field`, `enemy-field`, `friendly-creature`, or `enemy-creature`. Targeted activations select their own target at activation, not deployment. They are unavailable when no valid target exists. Creature-only effects and Consume exclude bastions. Bastion entry, blocking and death events are `bastion.enter.before`, `bastion.entered`, `bastion.blocked`, and `bastion.destroyed`; creature events retain the `creature` prefix. Activation emits `ability.activated`.

`legendary: true` gives a one-copy limit and the gilded frame; also set `rarity: "legendary"`. Versions of the same card should share `deckLimitKey`, so alternate art does not bypass the copy limit.

Optional `lore` is the card text, styled in italics above the ability boxes in the inspector. Rules text comes directly from ability descriptions; there is no separate handwritten rules summary. The old `text` field is no longer used. It works for creatures and spells and is included in card searches. Omit it or leave it empty when a card has no lore. Plain text only; use `\n` for line breaks.

```json
"lore": "The crown endures where its runes still shine."
```

## Factions

Each faction is one file, `assets/factions/<faction-id>.json`. The file name must match the `id`, and IDs use lowercase letters, digits and hyphens. `neutral.json` is required: Neutral is authored like any faction (name, short label, color, symbol), but its rules are built in. Neutral cards have no named faction and pay with generic energy; Neutral is not valid in `cost.factions`. Neutral can have a `pack` like any faction, and its pack draws the factionless cards.

```json
{
  "id": "crownlands",
  "name": "The Crownlands",
  "short": "Crown",
  "color": "#deb966",
  "symbol": "♜",
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
| `symbol` | One distinct character (at most four) for its energy and booster pack |
| `starter` | Optional. A ready-made deck for this faction: its stable `id`, a `name`, and `cards` as card ID → copies (the list shown is shortened). `"default": true` makes it the deck new players start with; only one faction may set it, and without one the first starter (by faction ID) is used |
| `pack` | Optional. Adds a store booster that draws only this faction's cards. `pack.id` must be unique (and not `bounty`) and must stay stable once players own packs |

Unknown keys, malformed colors, duplicate symbols and duplicate pack IDs fail the import with the file's path. A missing `neutral.json` fails too. Cards that name a faction without a file also fail. `npm run import:cards` (or `npm run dev`) validates every faction and generates `packages/content/src/factions.json`; do not edit that file by hand. The UI, deck builder filters, energy symbols, booster packs and card validation all read this one list. To remove a faction, delete its file (which also removes its pack and starter deck) and every card that references it.

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
| `rally` | `{ "amount": 1 }` | Exhaust during your play phase to restore life (activated ability) |

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

## Test boosters

**Open booster** in the menu or card browser grants five cards from the current imported catalogue. Each slot independently rolls common 70%, rare 25%, legendary 5%, then chooses a card uniformly within that rarity. Duplicates are allowed, with no guaranteed rarity. If a rarity has no cards, its weight is omitted and the remaining weights are normalized. Edit `packages/content/src/boosters.ts` to tune these POC odds; the sampler has no browser dependency and accepts an injected random source.

The seal animation and sequential flips can be skipped, and reduced-motion settings reveal the cards immediately. Rewards are granted once when opening begins and saved on this device under `varhir-booster-rewards-v1`; revealing, inspecting or closing the pack does not grant extra copies. The browser shows earned copy counts. The testing deck builder continues to use the full catalogue without ownership limits. This is local test progression; account rewards and online validation can use the same sampler later.
