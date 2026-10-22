import { DeckShelf } from "../DeckShelf";
import { newDeck } from "../../lib/deckBuilderHelpers";

import { LeaveDialog } from "./LeaveDialog";
import { useDeckBuilderContext } from "../../DeckBuilderContext.tsx";

export function ShelfView() {
  const {
    change,
    decks,
    deleteSaved,
    draft,
    guard,
    importFromShelf,
    load,
    openCollection,
    ownedCopies,
    renameDeck,
    setEditing,
  } = useDeckBuilderContext();
  return (
    <>
      <DeckShelf
        decks={decks}
        draft={draft}
        ownedCopies={ownedCopies}
        open={(id) => {
          const go = () => {
            if (id) load(id);
            setEditing(true);
          };
          if (id && id !== draft.id) guard(go);
          else go();
        }}
        create={() =>
          guard(() => {
            change(newDeck());
            setEditing(true);
          })
        }
        importDeck={importFromShelf}
        openCollection={openCollection}
        rename={renameDeck}
        remove={deleteSaved}
      />
      <LeaveDialog />
    </>
  );
}
