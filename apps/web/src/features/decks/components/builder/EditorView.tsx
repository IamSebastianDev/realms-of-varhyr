import { CardFilterBar } from "../CardFilters";
import { Workshop } from "../../../../components/Workshop";
import { t as msg } from "@realms/ui/i18n";

import { DeckPane } from "./DeckPane";
import { DeckDialogs } from "./DeckDialogs";
import { FileInput } from "./FileInput";
import { CollectionGallery } from "./CollectionGallery";
import { useDeckBuilderContext } from "../../DeckBuilderContext.tsx";

export function EditorView() {
  const {
    cards,
    drag,
    dropZone,
    filters,
    hiddenCount,
    over,
    ownership,
    remove,
    setFilters,
    setOwnership,
  } = useDeckBuilderContext();
  return (
    <Workshop
      label={msg("Deck builder")}
      className="collection-page builder-page"
      panelLabel={msg("All cards")}
      panel={{
        className: `${drag?.from === "deck" ? "drop-ready" : ""} ${over === "collection" ? "drop-over" : ""}`,
        ...dropZone("collection", "deck", (id) => remove(id)),
      }}
      title={msg("Your cards")}
      subtitle={
        <>
          {cards.length} {msg("cards")}
        </>
      }
      actions={
        <CardFilterBar
          filters={filters}
          setFilters={setFilters}
          ownership={ownership}
          setOwnership={setOwnership}
          count={cards.length}
          hidden={hiddenCount}
          deck
        />
      }
      pane={<DeckPane />}
      overlays={<DeckDialogs />}
    >
      <FileInput />
      <CollectionGallery />
    </Workshop>
  );
}
