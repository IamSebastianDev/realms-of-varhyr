import type { DeckBuilderProps } from "../../lib/deckBuilderTypes";
import { useDeckBuilderState } from "./useDeckBuilderState";
import { useDeckBuilderDerived } from "./useDeckBuilderDerived";
import { useDeckBuilderActions } from "./useDeckBuilderActions";

/** Everything the deck builder knows and can do, built from small hooks that each add to the result of the previous ones. */
export function useDeckBuilder(props: DeckBuilderProps) {
  const c0 = useDeckBuilderState(props);
  const c1 = { ...c0, ...useDeckBuilderDerived(c0) };
  const c2 = { ...c1, ...useDeckBuilderActions(c1) };
  return c2;
}

export type DeckBuilderController = ReturnType<typeof useDeckBuilder>;
