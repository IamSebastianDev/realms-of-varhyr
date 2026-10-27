# Card styles

Four unlockable finishes preserve the original illustration, crop and optional animation:

- **Foil:** the original moving holographic spectrum.
- **Pearlescent:** broad, soft ivory, rose and blue reflections.
- **Etched Foil:** fine directional grooves in a silver/champagne coating; the illustration itself is never etched or processed.
- **Prismatic:** triangular facets that split the light into shifting colours.

Legendary cards include standard Foil for free and use it by default, including before the card is owned. Its inspector option remains available, already unlocked, with no lock or purchase price. They can still select Original or unlock other finishes normally. Nonlegendary cards do not receive free Foil. Legendary borders identify rarity independently of the selected finish.

## Unlocking and choosing

Open a card in the collection or deck-builder inspector. Original and the four finishes can all be previewed without spending or changing the saved selection. Own at least one copy to unlock a finish for **150 Crowns per card per finish**. Unlocking also equips it. Switching between unlocked finishes and Original is free. Paid finishes are independently owned; only one finish is equipped at a time. Standard Foil on legendary cards is included automatically and cannot be purchased.

The unlock belongs to the logical card (`deckLimitKey`), independently of copies, artwork versions, rarity and game rules. It neither grants nor consumes copies. Optional `cardStyles` stores identities grouped by finish in `unlocked` and an identity-to-appearance mapping in `equipped`. An explicit `original` selection persists when opting out of a legendary card’s default foil. Included foil does not require a stored entitlement. Older saves work without it. Legacy `foil` and experimental `etched` unlocks migrate to basic Foil, retaining the selection without charging again; they do not unlock the new Etched Foil.

Purchases commit the Crown debit, unlock and selection in the same required storage write; a failed save grants nothing and spends nothing.

This is a local appearance selection for each card identity throughout the browser: collection, inspectors, hands and battlefield. Style choices are not yet exchanged between multiplayer peers or recorded in replays. There are no per-deck or per-copy overrides.

## Implementation

- `apps/web/src/features/card-styles/`: purchases, save migration and inspector controls. `finishPrice` is the shared price; `grantFinish` supports quest or achievement rewards without charging Crowns or granting a card.
- `packages/renderer/src/cardFinishes.ts`: known finishes, labels, descriptions and shader indices. Adding a finish requires its visual treatment too.
- `HolographicFoil.tsx`, `holographicShader.ts` and `foil.css`: shared surfaces. Idle and reduced-motion DOM cards use distinct static fallbacks; active previews allocate WebGL contexts. The battlefield uses the same shader in its existing R3F canvas. Offscreen and hidden-page animation pauses.
- `CardStyles.tsx`: presentation-only selection context. The web provider mounts after onboarding so reading the collection cannot prematurely create an account.

Full reset clears styles with the collection. No game rules, card revisions or gameplay content hashes change when a style is unlocked or selected.
