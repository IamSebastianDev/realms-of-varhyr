import type { CardDefinition } from "@realms/contracts";

/** Presentation-only finishes. Ordering also defines the shared shader's material index. */
export const cardFinishes = ["foil", "pearlescent", "etched-foil", "prismatic"] as const;
export type CardFinish = (typeof cardFinishes)[number];
export type CardAppearance = "original" | CardFinish;
export const isCardFinish = (value: unknown): value is CardFinish =>
  typeof value === "string" && (cardFinishes as readonly string[]).includes(value);
export const finishIndex = (finish: CardFinish): number => cardFinishes.indexOf(finish);
export const finishLabels: Record<CardAppearance, string> = {
  original: "Original",
  foil: "Foil",
  pearlescent: "Pearlescent",
  "etched-foil": "Etched Foil",
  prismatic: "Prismatic",
};
export const finishDescriptions: Record<CardAppearance, string> = {
  original: "The original artwork and finish.",
  foil: "A holographic finish that catches the light. Your original artwork underneath.",
  pearlescent: "Soft ivory, rose and blue reflections, like mother-of-pearl.",
  "etched-foil": "Fine silver and champagne grooves catch the light across the foil coating.",
  prismatic: "Faceted reflections split the light into shifting spectral colours.",
};

/** Legendary cards include standard foil; its selector option stays available. */
export const includesStandardFoil = (card: Pick<CardDefinition, "type" | "legendary">): boolean =>
  !!card.legendary;
export const defaultCardAppearance = (
  card: Pick<CardDefinition, "type" | "legendary">,
): CardAppearance => (includesStandardFoil(card) ? "foil" : "original");
