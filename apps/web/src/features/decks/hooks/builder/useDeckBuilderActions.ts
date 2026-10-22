import { exportDeck, importDeck } from "../../lib/deckTools";
import { t as msg } from "@realms/ui/i18n";
import { newDeck } from "../../lib/deckBuilderHelpers";
import { registry } from "@realms/content";

import type { useDeckBuilderState } from "./useDeckBuilderState";
import type { useDeckBuilderDerived } from "./useDeckBuilderDerived";

/** Exporting, importing, opening dialogs and switching between the shelf and the editor. */
export function useDeckBuilderActions(
  c: ReturnType<typeof useDeckBuilderState> & ReturnType<typeof useDeckBuilderDerived>,
) {
  const {
    change,
    codeRef,
    deckCode,
    dialog,
    draft,
    editing,
    guard,
    setCopyMessage,
    setDeckCode,
    setDialog,
    setEditing,
    setImportError,
    sharingOrigin,
  } = c;
  function download() {
    const url = URL.createObjectURL(new Blob([exportDeck(draft)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      draft.name
        .trim()
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase() || "deck"
    }.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openDialog(kind: NonNullable<typeof dialog>) {
    if (!dialog) sharingOrigin.current = document.activeElement as HTMLElement;
    setDialog(kind);
  }
  function openSharing(kind: "import" | "export") {
    setDeckCode(kind === "export" ? exportDeck(draft) : "");
    setImportError("");
    setCopyMessage("");
    openDialog(kind);
  }
  function importCode(raw: string) {
    const imported = importDeck(raw, registry);
    change({ ...newDeck(), ...imported });
    setImportError("");
    setDialog(null);
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(deckCode);
      setCopyMessage(msg("Deck code copied."));
    } catch {
      codeRef.current?.select();
      setCopyMessage(msg("Select the code and copy it with your keyboard."));
    }
  }
  async function readFile(file: File) {
    try {
      if (file.size > 100_000) throw new Error(msg("This file is too large for a deck export."));
      importCode(await file.text());
    } catch (error) {
      setImportError(error instanceof Error ? error.message : msg("Could not read this deck."));
    }
  }

  const shelf = !editing && dialog !== "import";
  const importFromShelf = () =>
    guard(() => {
      setEditing(true);
      openSharing("import");
    });
  return {
    download,
    openDialog,
    openSharing,
    importCode,
    copyCode,
    readFile,
    shelf,
    importFromShelf,
  };
}
