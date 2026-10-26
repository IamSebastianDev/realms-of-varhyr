import { t as msg, localizedAbility } from "@realms/ui/i18n";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

/** Choose one: a modal spell asks which of its effects to cast before targets and positions. */
export function ModePicker() {
  const { beginPlay, covered, draft, live, setDraft, setSelected, setStage, stage, view } =
    useMatch();
  const legal = draft && view.legal.playable.find((a) => a.cardId === draft.cardId);
  const definition = draft && registry.cards[view.cards[draft.cardId]?.definitionId];
  if (!live || stage !== "mode" || covered || !draft || !legal?.modes || !definition) return null;
  const cancel = () => {
    setDraft(null);
    setStage("none");
    setSelected(null);
  };
  return (
    <div className="modal-backdrop" onClick={view.freeCast ? undefined : cancel}>
      <section
        className="pile-picker mode-picker"
        role="dialog"
        aria-modal="true"
        aria-label={msg("Choose the effect")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{msg(definition.name)}</h2>
        <p>{msg("Choose one:")}</p>
        <div className="mode-options">
          {legal.modes.map(({ mode }) => (
            <button
              key={mode}
              className="outline-button mode-option"
              onClick={() => beginPlay({ ...draft, mode })}
            >
              {
                localizedAbility(
                  definition.cast![mode],
                  registry.abilities[definition.cast![mode].id],
                ).description
              }
            </button>
          ))}
        </div>
        {!view.freeCast && (
          <button className="outline-button" onClick={cancel}>
            {msg("Cancel")}
          </button>
        )}
      </section>
    </div>
  );
}
