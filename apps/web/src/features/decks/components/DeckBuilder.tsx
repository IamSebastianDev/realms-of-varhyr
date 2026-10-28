import { useState } from "react";
import { DeckStatsPage } from "../../stats/components/DeckStatsPage";
import { DeckBuilderProvider } from "../DeckBuilderContext";
import { useDeckBuilder } from "../hooks/builder/useDeckBuilder";
import type { DeckBuilderProps } from "../lib/deckBuilderTypes";
import { EditorView } from "./builder/EditorView";
import { ShelfView } from "./builder/ShelfView";

/** Your decks: the shelf of saved decks, and the editor for the one you open. */
export function DeckBuilder(props: DeckBuilderProps) {
  const controller = useDeckBuilder(props);
  const [statsFor, setStatsFor] = useState<{ id: string; name: string } | null>(null);
  if (statsFor && controller.shelf)
    return (
      <DeckStatsPage deckId={statsFor.id} deckName={statsFor.name} back={() => setStatsFor(null)} />
    );
  return (
    <DeckBuilderProvider value={controller}>
      {controller.shelf ? (
        <ShelfView openStats={(id, name) => setStatsFor({ id, name })} />
      ) : (
        <EditorView />
      )}
    </DeckBuilderProvider>
  );
}
