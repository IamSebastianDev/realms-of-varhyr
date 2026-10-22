# Card and effect ideas (drafts)

Brainstorm parking lot, grouped by faction. Unless marked implemented, nothing here exists in the repo yet. Move an idea into `assets/cards/<id>/` only once it is decided.

Design note: similar abilities with a different flavour are fine. They do not all have to be mechanically unique.

# Black Host

Intended identity: **control, reanimate and synergy**.

## Plague Wind (spell) — IMPLEMENTED (one-sided version)

- In the repo as `assets/cards/plague-wind/`: legendary, cost 3 generic + 3 Black Host (6), play timing only, German name Seuchenwind. The `plague` spell ability destroys each enemy creature.
- Art is a placeholder until the real art replaces `data.png`.
- Balance notes: a one-sided wipe is close to a win condition, which is why it is legendary and expensive. Each destroyed creature still gives its owner response energy and opens a response window, which softens it a little.

### Alternative: symmetric version (not built)

- Each player chooses one creature to keep, all the others are destroyed. Original pitch was 4 energy.
- **Effort:** moderate. Needs a new pending decision (like draw and mulligan), the choices routed per player online and in loopback, a bot rule (keep the best creature), a "choose the creature to keep" dialog (the pile picker can be reused) and tests.
- **Open design decisions:**
  1. Hidden simultaneous choice, or caster first and opponent second. Preferred: hidden, with the first pick redacted in the opponent's view and in replays.
  2. Holdings survive (creatures only).
  3. A player with no creatures skips the choice. If neither has any, the spell fizzles.

## Black Shaman — DECIDED: stays as is

- Rare, cost 0, 0/1, Dark Harvest (mill 1, gain 2 Host energy) plus Rest. Now a Black Host + Conclave hybrid with its own lore. The earlier ideas (make it legendary, move the ability to the Dark Priest of Run) were dropped.
- A separate legendary 2-energy producer for the Black Host exists: Envoy of the Black Host (Bind 1 undead).

## Necromancer and 0-Defense undead — IMPLEMENTED as Bind

- The `bind` ability: friendly creatures of a subtype get +N Defense (not positional). On Dark Priest of Run, Gravecaller, Ossuary Warden and Altar of Binding, Envoy of the Black Host. Most small undead are printed with Defense 0 and die at the next state check without a binder.
- **Open risks:** a 0-Defense undead played with no necromancer dies at once (response energy, Soul Harvest). Fragile undead plus Raise Undead and Soul Harvest could loop. Killing the necromancer kills all bound undead at once. Possible UI warning or bot rule still open.
- Other options considered and parked: Graveborn (Defense equals the undead in your discard pile) and Tethered (bonus only while the necromancer is ready).

# Mountain Clans

## Mountain cavalry with Outflank — IMPLEMENTED

- `outflank {amount}`: while on a flank (Left or Right Flank), the creature has +amount Attack. First card: **Highland Riders** (`assets/cards/highland-riders/`, common, 1 + 2 Mountain Clans, 2/3, produces 2, Outflank 3, German Hochlandreiter). Art is a placeholder until real art replaces `data.png`. Stats, cost and rarity are a first proposal.
- **Watch:** +3 on a cheap body is large and there are only two flank slots. A flank creature can only attack its own lane or the adjacent one, which partly offsets the bonus. It can be reanimated into a chosen flank with Raise.

## Next wave of proposals (2026-10-18, all drafts)

Identity so far: cheap producers, armor and sturdy bodies, flank raiders, gold and digging, alpacas and high villages. Existing: Alpaca Farmer, Gil Krag Prospector, Grad (legendary digger), Dwell (legendary merchant), Mountain Cavalry, Alpaca Mountaineers, Find Gold. Costs are written as generic + Clans energy; every stat, cost and rarity is a suggestion. Everything below uses abilities that already exist unless marked **new**.

### Legendary creature (pick one)

- **Hjorna Stonemother, Matriarch of the Herds** (human, leader, 1+3, 2/5, produces 3, Armor 1, Shield-wall 1). A defensive producer that makes the whole row sturdier. Lore: "Every clan owns a mountain. She owns the herds that walk across all of them."
- **Barak Ironvoice, Warhorn of the Clans** (dwarf, leader, 1+3, 4/4, produces 2, Outflank 2, Drillmaster 1 dwarf). The aggressive option, supports Mountain Cavalry. Lore: "The clans have never agreed on anything. They all answer his horn, each for a different reason."

### Producers

- **Quarry Foreman** — IMPLEMENTED in a changed form (`assets/cards/quarry-foreman/`, German Steinbruch-Vorarbeiter): common, dwarf, 0 cost, 1/1, produces 1. Originally proposed as 1+0, 1/3, produces 2. Lore: "He counts the stone. The hours are someone else's problem."
- **Muleteer of the Salt Road** (rare, human, 0, 0/3, two outputs of 1 like Riverlands Envoy, one Clans and one neutral). Lore: "Salt, wool and news. He sells all three and takes payment in whichever you can spare."

### Creatures

- **Ill-Tempered Alpaca** — IMPLEMENTED (`assets/cards/ill-tempered-alpaca/`, German Launisches Alpaka; subtype `alpaca`): common, 1+0, 1/2, produces 1, Charge 1. Lore: "It judges a man's worth on sight. Most are found wanting, usually in the face." (New subtype `alpaca`, or `beast`.)
- **Passkeeper** (common, human, 1+1, 1/4, produces 1, Guard). Lore: "The pass is open to anyone who can explain, to the passkeeper's satisfaction, why."
- **Sling-Clan Skirmisher** (common, human, 1+1, 2/2, produces 1, Longshot 1). Lore: "Stones cost nothing. The mountain supplies them unasked."
- **Hammerband Sergeant** (rare, dwarf, 1+2, 2/3, produces 2, Drillmaster 1 dwarf). Lore: "Dwarves march in step. It is the one thing they never argue about."
- **Deepwall Veteran** (rare, dwarf, 1+3, 2/5, produces 2, Armor 2, Shield-wall 1). Lore: "Ten years under the mountain. The first thing he lost was his fear of the dark. The second was the ability to be moved."

### Holdings

- **Log Palisade** — IMPLEMENTED (`assets/cards/log-palisade/`, German Holzpalisade): common, 0+2 Clans, 0/5, Guard. Originally proposed as 1+1. Cheap wall without attack, so it does not compete with Borderpost. Lore: "Built in a week by everyone, and argued over for a decade."
- **Clanhold Redoubt** (rare, fortification, 1+3, 2/5, Armor 2, Shield-wall 1). Lore: "No clan built it. Every clan claims to have."
- **Gemstone Mine** — IMPLEMENTED (`assets/cards/gemstone-mine/`): rare, free, 0/2, Primal 1. Very strong fixing for no cost, kept fragile on purpose. Lore: "Its seam is bright enough to read by. The clans keep it off every map." German Edelsteinmine.
- **Gil Krag Mine** — IMPLEMENTED (`assets/cards/gil-krag-mine/`): common, 1 generic, 0/3, Channel 2 Mountain Clans. German Mine von Gil Krag.
- Mines are holdings that carry an activated energy ability, not producers: they have no energy output and leave no death energy. To allow this, holdings may now carry `primal` and `channel`, and `channel` got an activate hook (exhaust to gain the energy; Find Gold still works as a spell). Art for all three new cards is a placeholder.

### Spells

- **Rockslide** — IMPLEMENTED in a changed form (`assets/cards/rockslide/`, German Felssturz): common, 0+1 Clans, Damage 3, with Consume 1 (sacrifice a creature). Originally proposed as 1+1 with no extra cost. Lore: "The mountain has been waiting. It only needed someone to stand below."
- **Hold the Pass** (common, play and response, 0+1, Steadfast 3). Lore: "No one passes. Not even the ones who were invited."
- **Down from the Ridge** (common, play, 1+1, Rage 3). Fits flank raiders. Lore: "They do not come at you. They come down at you."

### Also added by Sebastian (2026-10-18)

- **Mountain Outpost** (`assets/cards/mountain-outpost/`, German Bergposten): common creature, 2+1 Clans, 1/4, Longshot 2. Art shows a clan banner next to a Crownlands lion banner.
- **Halls of Old** (`assets/cards/halls-of-old/`, German Die Alten Hallen): legendary holding, 0+3 Clans, 2/4, Banner 2. Dwarven hall with torches and clan banners.

### Also added by Sebastian (2026-10-18, later)

- **Avalanche** (`assets/cards/avalanche/`, German Lawine): rare spell, subtype Barrage, 2+3 Clans, Barrage 5. Lore: "It starts with one stone and a clan that stopped to argue about whose it was."
- **Clan Irregulars** (`clan-irregulars`, German Clan-Freischärler): common creature, 1+1 Clans, 2/2, Outflank 1. Lore: "No two carry the same banner. They agree on the flank, and on nothing else."
- **Dwarven Honourguard** (`dwarven-honourguard`, German Zwergische Ehrengarde): rare creature, 2+2 Clans, 3/4, produces 3, Guard, Shield-wall 2. Lore: "They swore to hold the gate until the mountain falls. The mountain has been informed."
- **Jaina, Mistress of the Herd** (`jaina-mistress-of-the-herd`, German Jaina, Herrin der Herde): legendary human creature, 2+2 Clans (cost 4), 3/5, produces 3, Drillmaster 2 alpaca. Net cost 1 energy, the energy only comes in on later turns. Lore: "The herd follows no one. It simply happens to walk wherever she is going."
- Still without subtypes at the time of writing: Clan Irregulars, Dwarven Honourguard, Mountain Outpost.

### Mountain Clans lore — DECIDED (2026-10-18)

1. **Leadership: deliberately leaderless.** Each clan stands alone and they unite only against outsiders. No high chief and no king of the mountain. Legendaries are famous individuals, never rulers. Consequence: the unbuilt Hjorna and Barak cards need lore that does not make them commanders of the clans (Barak's "they all answer his horn" works only as a rallying call, not as authority); avoid titles like "king" or "high chief".
2. **Dwarves and human clansfolk: allies.** Shared cause, so subtype synergies may cross over (for example Drillmaster dwarf can also support humans).
3. **Alpacas: human clans only.** They are livestock of the high villages. Dwarves do not keep or ride them, so alpaca cards stay human and the `alpaca` subtype stays with the human side (Alpaca Farmer, Mountaineers, Ill-Tempered Alpaca, Jaina).
4. **Magic: folk rites and small charms.** Weather, herds and passes, not battle magic and no runes (the Crownlands keep Runeguard). Fits the existing Rite spells and small protective spells such as Hold the Pass. Avoid rune-carving, spellcasters and elemental spells as clan identity.

# Spell subtypes — IMPLEMENTED (2026-10-18)

Spells carry one subtype, shown on the card as "Spell · Strike" (German labels live in `packages/ui/src/i18n/de.json`). Current vocabulary:

| Subtype | German | Meaning | Cards |
|---|---|---|---|
| Strike | Schlag | Damage to one target | Puncture, Strike the Hammer, Revenge, Rockslide |
| Barrage | Sperrfeuer | Damage to every enemy creature | Volley |
| Tactic | Taktik | Combat bonus for a friendly creature | Close Ranks, Moment of Glory |
| Rite | Ritus | Holy, dark and communal rites (healing, reanimation, drawing) | Cleansing Light, Battlefield Hymn, Raise Undead, Grave Exchange |
| Curse | Fluch | Destroys creatures outright | Death, Plague Wind |
| Divination | Weissagung | Knowledge and finding things (draw, energy) | Borrowed Wisdom, Gift of the March, Find Gold |

Subtypes on spells are freeform like creature subtypes, so new ones can be added without code. Holdings now show their subtype too ("Holding · Fortification").

# Any faction

## Fetch effect (library or discard)

- Idea: instead of tokens, effects that fetch a named creature from the deck or discard pile, building on the Raise pile picker.
- Not requested yet, just a possible follow-up.

## Decided against

- **Heroes:** a separate non-legendary kind that cannot produce energy but has abilities. Too close to planeswalkers.
- **Tokens:** creatures conjured inline rather than from the deck. Prefer fetching named creatures from the deck.
