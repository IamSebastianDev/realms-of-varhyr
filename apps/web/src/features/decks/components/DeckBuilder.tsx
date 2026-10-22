import { DeckBuilderProvider } from "../DeckBuilderContext";
import { useDeckBuilder } from "../hooks/builder/useDeckBuilder";
import type { DeckBuilderProps } from "../lib/deckBuilderTypes";
import { EditorView } from "./builder/EditorView";
import { ShelfView } from "./builder/ShelfView";

/** Your decks: the shelf of saved decks, and the editor for the one you open. */
export function DeckBuilder(props: DeckBuilderProps) {
  const controller = useDeckBuilder(props);
  return (
    <DeckBuilderProvider value={controller}>
      {controller.shelf ? <ShelfView /> : <EditorView />}
    </DeckBuilderProvider>
  );
}
