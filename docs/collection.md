# Collection and Crowns

An account begins empty, then receives the default starter deck's card copies and five **Realm’s Bounty** boosters once. The current default starter is Banners of the Crown. Other starters remain available as opponent decks and editable blueprints; playing a deck requires owning its cards. Saved decks can reuse the same owned copies.

Ownership caps are three copies per card ID and one per legendary card ID. Deck limits still apply across alternate artwork variants through `deckLimitKey`. Packs contain five cards with the existing rarity odds. A pack can contain repeated IDs; every draw is applied in order, so duplicates within that pack can overflow the ownership cap and become Crowns.

The provisional economy is centralized in `apps/web/src/collection.ts`:

| Action | Amount |
| --- | --- |
| Welcome grant | Starter cards + 5 Realm’s Bounty packs |
| Buy any booster | 100 Crowns |
| Buy a specific card | 50 / 150 / 400 Crowns (common / rare / legendary) |
| Excess common | 10 Crowns |
| Excess rare | 25 Crowns |
| Excess legendary | 100 Crowns |
| Win a game as player one | 25 Crowns + 1 Realm’s Bounty pack |
| Store debug button | +1,000 Crowns |

Opening consumes one pack of the selected kind and applies its rewards before the reveal animation. Closing, skipping or inspecting that reveal does not grant again. Buying adds a pack of the selected kind to inventory; it does not open it automatically. Crowns are credited immediately for excess cards, and each reveal shows the conversion and total reclaimed Crowns. No manual conversion, crafting or real-money purchases are included.

Wins are keyed by a UUID per match, separate from the shuffle seed. The claimed IDs are saved with the collection so revisiting a result or reloading cannot duplicate rewards. The collection belongs to player one. Their wins in practice, hotseat and skirmish games grant rewards. Losses, draws and imported replays do not grant rewards. Imported replay eligibility stays disabled after saving/resuming it.

`collectionStore.ts` shares the wallet across the lobby and match. It persists `varhyr-collection-v1` in browser storage. The first load migrates previous `varhir-booster-rewards-v1` copies as additional grants and converts surplus to Crowns, preserving the old storage as a backup. Existing saved decks and drafts remain intact; matches are no longer saved. Retired card IDs and pack IDs are retained in the new profile. Content changes that lower a card's ownership limit normalize surplus into Crowns on the next saved load.

The pure collection functions contain no browser APIs. The storage/React adapter is separate, ready to be replaced by a server-backed collection later. This remains a local POC economy; the debug button is intentionally exposed.
