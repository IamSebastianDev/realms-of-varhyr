import { createContext, useContext, type ReactNode } from "react";
import type { DeckBuilderController } from "./hooks/builder/useDeckBuilder";

const DeckBuilderContext = createContext<DeckBuilderController | null>(null);

export function DeckBuilderProvider({
  value,
  children,
}: {
  value: DeckBuilderController;
  children: ReactNode;
}) {
  return <DeckBuilderContext.Provider value={value}>{children}</DeckBuilderContext.Provider>;
}

/** The deck being edited: its cards, filters, dialogs and every action the builder offers. */
export function useDeckBuilderContext(): DeckBuilderController {
  const ctl = useContext(DeckBuilderContext);
  if (!ctl) throw new Error("useDeckBuilderContext must be used inside a DeckBuilderProvider.");
  return ctl;
}
