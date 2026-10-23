import { describe, expect, it } from "vitest";
import { starterDefinitions } from "@realms/content";
import { starterOffers } from "../src/features/onboarding/lib/onboardingState";

describe("starter deck offers", () => {
  it("offers every starter deck on the first-run screen", () => {
    // A starter needs a hero whose avatar names its faction; without one the deck silently disappears from the picker.
    expect(starterOffers().map((offer) => offer.id)).toEqual(
      starterDefinitions.map((deck) => deck.id),
    );
  });
  it("gives each offer a leader card and its full deck", () => {
    for (const offer of starterOffers()) {
      const deck = starterDefinitions.find((d) => d.id === offer.id)!;
      expect(offer.total, offer.id).toBe(deck.cards.length);
      expect(
        offer.cards.reduce((sum, card) => sum + card.copies, 0),
        offer.id,
      ).toBe(offer.total);
    }
  });
});
