import { useMatch } from "../../MatchContext";

export function LaneBands() {
  const { drag, hoverLane, laneAtX, slotLayout, view, viewer } = useMatch();
  return (
    <>
      <div className="lane-bands" aria-hidden="true">
        {view.players[viewer].board.map((_, lane) => {
          const s = slotLayout.find((x) => x.player === viewer && x.slot === lane);
          if (!s) return null;
          const hot = (drag ? laneAtX(drag.x) : hoverLane) === lane;
          return (
            <i
              key={lane}
              className={`${lane % 2 ? "odd" : ""} ${hot ? "hot" : ""}`}
              style={{ left: s.x - 12, width: s.width + 24 }}
            />
          );
        })}
      </div>
    </>
  );
}
