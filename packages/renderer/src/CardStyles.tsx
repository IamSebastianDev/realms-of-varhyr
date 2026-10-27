import { createContext, useContext, type ReactNode } from "react";

import type { CardDefinition } from "@realms/contracts";
import { defaultCardAppearance } from "./cardFinishes";
import type { CardAppearance } from "./cardFinishes";
export type { CardAppearance, CardFinish } from "./cardFinishes";
export type CardStyles = Readonly<Record<string, CardAppearance>>;
const stylesContext = createContext<CardStyles>({});

/** Cosmetic choices belong to presentation, never to card definitions or the rules hash. */
export function CardStylesProvider({
  styles,
  children,
}: {
  styles: CardStyles;
  children: ReactNode;
}) {
  return <stylesContext.Provider value={styles}>{children}</stylesContext.Provider>;
}

export function useCardAppearance(
  card: Pick<CardDefinition, "deckLimitKey" | "type" | "legendary"> | undefined,
): CardAppearance {
  const styles = useContext(stylesContext);
  return card ? (styles[card.deckLimitKey] ?? defaultCardAppearance(card)) : "original";
}

export const useCardAppearances = () => useContext(stylesContext);
