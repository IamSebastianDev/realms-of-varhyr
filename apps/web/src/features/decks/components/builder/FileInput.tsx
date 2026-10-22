import { t as msg } from "@realms/ui/i18n";

import { useDeckBuilderContext } from "../../DeckBuilderContext.tsx";

export function FileInput() {
  const { fileRef, readFile } = useDeckBuilderContext();
  return (
    <>
      <input
        ref={fileRef}
        className="deck-file-input"
        type="file"
        accept=".json,application/json"
        aria-label={msg("Import deck file")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void readFile(file);
        }}
      />
    </>
  );
}
