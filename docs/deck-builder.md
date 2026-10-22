# Deck builder

The collection is a fixed card row above the deck, paged with the arrows. Page size adapts to the available width and card height. Both areas remain visible within the viewport; only the lower deck area scrolls. Left-click a collection card to add one copy, or a deck card to remove one. Hover or right-click in either area to inspect. Copy badges remain; numeric controls are removed. The deck uses larger cards in staggered, overlapping rows, with offset backs representing duplicate copies. Hover or keyboard focus brings a card to the front.

Collection badges show **copies in this deck / copies owned**, including cards not yet added. Cards turn gray when the deck copy limit is reached or all owned copies are already in the deck. Removing a copy immediately makes it available again. Gray cards still support hover and right-click inspection; the inspector uses the same add restriction.

Search matches names, lore, subtypes and ability descriptions. The Filters dialog combines faction, card type, total cost, producer roles and rarity. It also contains sorting by cost, name, Attack or Defense, and the option to show only cards that can be added. The filter button shows how many filters are active.

Deck overview opens from the chart button or producer summary in the deck footer. It counts free producers, all producers and average total cost. Bastions are not producers. The cost curve includes every copy and combines faction and generic requirements; its last bucket contains costs of six or more. Producer counts are information, not deck legality rules.

Deck actions (the ellipsis button) contains loading, New, Duplicate, Import and Export. Load a starter as a new editable copy, or load a saved deck to edit it. The deck name, Save and Undo remain directly accessible above the deck. Duplicate creates a separate draft. Draft changes persist locally; Save deck adds or updates the deck available in Play. Incomplete decks can be saved. Undo restores earlier edits, including New, loading and imports, for the current lobby session.

Export offers a JSON file and a copyable deck code. Import accepts either and creates a new draft only after validating the whole composition. Unknown cards and invalid copy counts are rejected. Stable card IDs make exports independent of local deck IDs.

The builder lives in `apps/web/src/features/decks/components/DeckBuilder.tsx`; pure filtering, statistics and sharing helpers live in `apps/web/src/features/decks/lib/deckTools.ts`. Card definitions and game rules are unchanged by these tools.

## Collection integration

`collection.ts` defines `OwnedCopies`, a map from stable card ID to count. Missing IDs mean zero owned. Artwork variants have separate ownership counts, but variants still share their deck limit through `deckLimitKey`. Copies can be reused in different saved decks; a deck never consumes the collection. `deckCardAvailability` and `addDeckCard` in `decks.ts` enforce both owned copies and the legal cap. Filters, card tiles and inspector actions use this same calculation.

`Lobby` now passes the persisted collection counts directly. New collections receive the Crownlands starter cards and five Realm’s Bounty boosters. No other cards are granted. Unowned cards remain visible and inspectable, with a gray face and `0/0` badge. Saved/imported decks remain compositions; missing owned copies are reported in the builder and prevent starting a match. Editing or saving a deck never spends or destroys collection copies. See `docs/collection.md` for economy values and migration.
