import { t as msg } from "@realms/ui/i18n";
import { positionName } from "@realms/contracts";
import { registry } from "@realms/content";

import { useMatch } from "../../MatchContext";

export function KeyRows() {
  const {
    beginPlay,
    draft,
    hoverBoard,
    inspectBoard,
    live,
    opponent,
    selectBoard,
    selectedActivation,
    selectedLegal,
    stage,
    view,
    you,
  } = useMatch();
  return (
    <>
      <div className="board-key-row enemy-keys">
        {opponent.board.map((id, i) => (
          <button
            key={i}
            onFocus={() => id && hoverBoard(id)}
            onBlur={() => hoverBoard(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (id) inspectBoard(id);
            }}
            onClick={(e) => id && (e.shiftKey ? inspectBoard(id) : selectBoard(id))}
            disabled={!id || !live}
            aria-label={msg("Opponent {v0}: {v1}", {
              v0: positionName(i),
              v1: id ? registry.cards[view.cards[id].definitionId].name : "empty",
            })}
            title={msg("{v0} · {v1}", {
              v0: positionName(i),
              v1: id ? registry.cards[view.cards[id].definitionId].name : "Empty position",
            })}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="board-key-row own-keys">
        {you.board.map((id, i) => (
          <button
            key={i}
            onFocus={() => id && hoverBoard(id)}
            onBlur={() => hoverBoard(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (id) inspectBoard(id);
            }}
            onClick={(e) =>
              id
                ? e.shiftKey
                  ? inspectBoard(id)
                  : selectBoard(id)
                : draft && live && beginPlay({ ...draft, slot: i })
            }
            disabled={
              !live ||
              (!id &&
                (!draft ||
                  stage !== "position" ||
                  !(selectedActivation?.slots ?? selectedLegal?.slots)?.includes(i)))
            }
            aria-label={msg("Your {v0}: {v1}", {
              v0: positionName(i),
              v1: id ? registry.cards[view.cards[id].definitionId].name : "empty",
            })}
            title={msg("{v0} · {v1}", {
              v0: positionName(i),
              v1: id ? registry.cards[view.cards[id].definitionId].name : "Deploy here",
            })}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </>
  );
}
