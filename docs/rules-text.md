# Rules text

How ability text is written, in English and German. Every ability description follows these rules, so cards read as one system.

## Two kinds of ability text

- **Keywords** (Guard, Armor, Banner, Shield Wall, Outflank, Covert, Quickened) have a name and only reminder text. The name is bold, the reminder is italic.
- **Everything else** is nameless rules text, shown plain. Channel counts as evergreen but is always written out in full.

## Sentence shape

- A cost comes first, followed by a colon: `Exhaust: gain 1 Horde energy this casting phase.` German: `Erschöpfen: Erhalte …`
- A trigger comes first, followed by a comma in English and a colon in German: `When played, draw 2 cards.` / `Beim Ausspielen: Ziehe 2 Karten.`
- Effects are imperative and short: `Deal`, `Destroy`, `Draw`, `Restore`, `Return`, `Search`, `Gain`, `Sacrifice`. German: `Füge … zu`, `Zerstöre`, `Ziehe`, `Stelle … wieder her`, `Nimm … zurück`, `Suche`, `Erhalte`, `Opfere`.
- A spell states only the effect. When the same effect is printed on a creature or holding, `fieldDescription` adds the trigger (`When played, …`).

## Vocabulary

| Use                                                | Not                                 |
| -------------------------------------------------- | ----------------------------------- |
| target X (a chosen target)                         | an X (when you choose)              |
| each X (all of them)                               | all X, every X                      |
| friendly / enemy                                   | your / opposing (for cards)         |
| adjacent (next to), opposite (facing)              | neighbouring, across from           |
| get +N Attack (a bonus), has -N Attack (a penalty) | have, receive                       |
| free position (where a card goes)                  | free slot, free place               |
| your library, your hand, your discard pile         | the deck, the graveyard             |
| energy cost of N or more / or less                 | cost of at least N                  |
| restore N life                                     | heal, gain N life                   |
| the opposing player, the enemy player              | the opponent (when a player is hit) |

German terms: `Bahn` (lane), `Position`, `Besitzung` (holding), `Bibliothek`, `Ablagestapel`, `kanalisieren` (channel), `Art {subtype}` (subtype), `erhält +N Angriff`.

## Conventions

- A creature's own bonus is `this creature`. If a holding can carry it too, `this card`.
- A buff that excludes the carrier says `Other`.
- A subtype is written `one {subtype} creature`, never `a {subtype}`, so vowels never need `an`.
- Energy reads `{amount} {energy} energy`, German `{amount} {energy}-Energie`.
- No parentheses or asides in the main sentence. If something needs explaining, it belongs in its own sentence.

## Wording that depends on a parameter

A template can switch on a parameter: `{?first|text if set|text if not}`. A parameter is set when it is true, a non-zero number or a non-empty word, and `{?a&b|…|…}` needs both. Both branches may contain placeholders and may be empty. Bolster uses this to word an attack bonus, a defense bonus or both. Search abilities use it, so a card that takes the topmost match says "put the topmost …" and a card that lets the player choose says "search your library for …".

## Modal spells

A spell with `"modal": true` is "choose one": its `cast` list holds the modes (at least two) and the caster picks exactly one when playing it. Only that mode's effect resolves, and its targets and position are chosen after the mode. A mode that cannot resolve right now (no legal target, no free position) is not offered. On the card the text reads `Choose one:` followed by one line per mode (German `Wähle eines:`). Each mode keeps its own ordinary ability text, so a mode never needs wording of its own.

The play command carries `mode` (an index into `cast`). The legal actions list the playable modes in `modes`, each with its own `targets`, `requiresTarget` and `slots`.

## Return and bounce

**Return** is an additional cost: the card is played by returning a friendly creature to its owner's hand. **Bounce** is an effect: it returns target creatures to their owner's hand, friendly, enemy or either (`target`). Neither is a keyword, so both are plain rules text.

## Refresh

**Refresh** readies exhausted creatures: `refresh` readies one chosen friendly creature, `refresh-all` readies each friendly creature. As a spell it resolves on cast; on a creature it happens when the creature is played. A ready creature is unaffected, and enemy creatures are never readied. It is plain rules text, not a keyword.

## Reprise

**Reprise** is a when-played ability: choose a spell in your discard pile and cast it for free. The first step is one choice from the discard pile (spells you could not cast now are not offered). The chosen spell is then cast like any spell from your hand, with its usual mode choice, target and position, but it costs no energy and no additional cost (such as Return). Until it is cast, nothing else can be played and the turn cannot end. The spell counts as cast this turn (Accord, prowess and kindle see it) and stays in your discard pile. It is plain rules text, not a keyword.
