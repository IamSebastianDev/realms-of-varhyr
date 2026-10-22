import { BuilderDialog } from "../BuilderDialog";
import { Check, Trash2 } from "lucide-react";
import { t as msg } from "@realms/ui/i18n";

import { useDeckBuilderContext } from "../../DeckBuilderContext.tsx";

export function LeaveDialog() {
  const { draft, pending, setPending, settle } = useDeckBuilderContext();
  return (
    <>
      {pending && (
        <BuilderDialog title={msg("Unsaved changes")} origin={null} close={() => setPending(null)}>
          <p>
            {msg("“{v0}” has changes you haven’t saved.", {
              v0: draft.name.trim() || msg("Untitled deck"),
            })}
          </p>
          {!draft.name.trim() && (
            <p className="builder-dialog-error" role="alert">
              {msg("Name your deck to save it.")}
            </p>
          )}
          <div className="builder-dialog-actions">
            <button className="outline-button" onClick={() => setPending(null)}>
              {msg("Keep editing")}
            </button>
            <button className="outline-button builder-discard" onClick={() => settle(false)}>
              <Trash2 size={15} />
              {msg("Discard changes")}
            </button>
            <button
              className="gold-button"
              data-autofocus
              disabled={!draft.name.trim()}
              onClick={() => settle(true)}
            >
              {msg("Save")}
              <Check size={14} />
            </button>
          </div>
        </BuilderDialog>
      )}
    </>
  );
}
