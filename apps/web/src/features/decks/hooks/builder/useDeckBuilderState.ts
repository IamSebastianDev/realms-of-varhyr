import { type BuilderFilters, initialBuilderFilters } from "../../lib/deckTools";
import { type Ownership, defaultOwnership } from "../../components/CardFilters";
import { useLanguage } from "@realms/ui/i18n";
import { useLayoutEffect, useRef, useState } from "react";
import { type DeckBuilderProps } from "../../lib/deckBuilderTypes";

/** Screen-local state: filters, open dialogs, drag and drop, and refs. */
export function useDeckBuilderState({
  draft,
  decks,
  ownedCopies,
  crowns,
  message,
  canUndo,
  reduced,
  change,
  add,
  remove,
  load,
  save,
  renameDeck,
  deleteSaved,
  removeDeck,
  undo,
  buyMissing,
  inspect,
  openCollection,
  guardRef,
}: DeckBuilderProps) {
  useLanguage();
  const [filters, setFilters] = useState<BuilderFilters>(initialBuilderFilters);
  // The builder opens on the shelf of saved decks; choosing one (or starting a new one) opens the editor.
  const [editing, setEditing] = useState(false);
  const [importError, setImportError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const deckGalleryRef = useRef<HTMLDivElement>(null);
  const [ownership, setOwnership] = useState<Ownership>(defaultOwnership);
  const [deckCost, setDeckCost] = useState<number | null>(null);
  // Drag and drop: cards go from the collection into the deck, and rows go back out to remove them.
  const [drag, setDrag] = useState<{ id: string; from: "collection" | "deck" } | null>(null);
  const [over, setOver] = useState<"deck" | "collection" | null>(null);
  const startDrag = (event: React.DragEvent, id: string, from: "collection" | "deck") => {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = from === "deck" ? "move" : "copy";
    setDrag({ id, from });
  };
  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };
  const dropZone = (
    target: "deck" | "collection",
    accept: "collection" | "deck",
    apply: (id: string) => void,
  ) => ({
    onDragOver: (event: React.DragEvent) => {
      if (drag?.from !== accept) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = accept === "deck" ? "move" : "copy";
      if (over !== target) setOver(target);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
    },
    onDrop: (event: React.DragEvent) => {
      if (drag?.from !== accept) return;
      event.preventDefault();
      apply(drag.id);
      endDrag();
    },
  });
  const [dialog, setDialogState] = useState<"deck" | "details" | "import" | "export" | null>(null);
  const setDialog = (next: typeof dialog) => {
    setConfirmDelete(false);
    setDialogState(next);
  };
  const sharing = dialog === "import" || dialog === "export" ? dialog : null;
  const [pending, setPending] = useState<{ run: () => void } | null>(null);
  const [deckCode, setDeckCode] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const sharingOrigin = useRef<HTMLElement | null>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    deckGalleryRef.current?.scrollTo({ top: 0 });
  }, [draft.id]);
  return {
    draft,
    decks,
    ownedCopies,
    crowns,
    message,
    canUndo,
    reduced,
    change,
    add,
    remove,
    load,
    save,
    renameDeck,
    deleteSaved,
    removeDeck,
    undo,
    buyMissing,
    inspect,
    openCollection,
    guardRef,
    filters,
    setFilters,
    editing,
    setEditing,
    importError,
    setImportError,
    confirmDelete,
    setConfirmDelete,
    fileRef,
    deckGalleryRef,
    ownership,
    setOwnership,
    deckCost,
    setDeckCost,
    drag,
    over,
    startDrag,
    endDrag,
    dropZone,
    dialog,
    setDialog,
    sharing,
    pending,
    setPending,
    deckCode,
    setDeckCode,
    copyMessage,
    setCopyMessage,
    sharingOrigin,
    codeRef,
  };
}
