import { t as msg, useLanguage } from "@realms/ui/i18n";
import { useEffect, type CSSProperties } from "react";
import type { PlayerId } from "@realms/contracts";
import type { SlotLayout } from "@realms/renderer/Board";
import type { PoseSpec, PopSpec, Spot } from "./combatReplay";
import { lungeVector } from "./cardMotion";

export type FxBatch = {
  key: string;
  poses: PoseSpec[];
  pops: PopSpec[];
  ms?: number;
  caption?: string;
};
type Box = { x: number; y: number; w: number; h: number };
const embers = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Screen-space accents around a fight: damage numbers, an impact flash where a card is hit, embers where one falls.
 * The cards themselves are never drawn here; they are the real cards, moved by useCardMotion.
 */
export function ClashLayer({
  batches,
  board,
  slots,
  viewer,
  onSkip,
}: {
  batches: FxBatch[];
  board: HTMLElement | null;
  slots: SlotLayout[];
  viewer: PlayerId;
  onSkip?: () => void;
}) {
  useLanguage();
  const amountOf = (pop: PopSpec) => Number(pop.text.replace(/\D/g, "")) || 0;
  const pops = batches.flatMap((b) => b.pops);
  const heavyKey = pops
    .filter((p) => p.tone !== "heal" && (p.tone === "lethal" || amountOf(p) >= 3))
    .map((p) => p.id)
    .join();
  const lifeKey = pops
    .filter((p) => "life" in p.at && p.tone !== "heal")
    .map((p) => `${p.id}:${(p.at as { life: PlayerId }).life}`)
    .join();
  // Weight: the whole board jolts on a big hit, and a life counter that was struck bumps.
  useEffect(() => {
    if (!heavyKey || !board) return;
    board.classList.remove("impact");
    void board.offsetWidth;
    board.classList.add("impact");
    const t = setTimeout(() => board.classList.remove("impact"), 460);
    return () => clearTimeout(t);
  }, [heavyKey, board]);
  useEffect(() => {
    if (!lifeKey) return;
    const els = [...new Set(lifeKey.split(",").map((k) => k.split(":")[1] as PlayerId))]
      .map((id) =>
        document.querySelector(
          `.player-banner.${id === viewer ? "own" : "opponent"} .life-counter`,
        ),
      )
      .filter(Boolean) as Element[];
    els.forEach((el) => {
      el.classList.remove("bump");
      void (el as HTMLElement).offsetWidth;
      el.classList.add("bump");
    });
    const t = setTimeout(() => els.forEach((el) => el.classList.remove("bump")), 520);
    return () => clearTimeout(t);
  }, [lifeKey, viewer]);
  if (!board || !batches.length) return null;
  const bigHit = pops.find(
    (p) => "life" in p.at && p.at.life === viewer && p.tone !== "heal" && amountOf(p) >= 3,
  );
  const origin = board.getBoundingClientRect();
  const slotBox = (player: PlayerId, slot: number): Box | null => {
    const found = slots.find((s) => s.player === player && s.slot === slot);
    return found
      ? { x: origin.left + found.x, y: origin.top + found.y, w: found.width, h: found.height }
      : null;
  };
  const lifeBox = (player: PlayerId): Box | null => {
    const r = document
      .querySelector(`.player-banner.${player === viewer ? "own" : "opponent"} .life-counter`)
      ?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  const spotBox = (spot: Spot) =>
    "life" in spot ? lifeBox(spot.life) : slotBox(spot.player, spot.slot);
  // Where a card stands right now: a striker that has lunged is out at its target.
  const centre = (pose: PoseSpec, moved: PoseSpec[]) => {
    const box = slotBox(pose.player, pose.slot);
    if (!box) return null;
    const mover = moved.find((m) => m.lunged && m.player === pose.player && m.slot === pose.slot);
    const [dx, dy] = mover ? lungeVector(mover, slots, viewer) : [0, 0];
    return { x: box.x + box.w / 2 + dx, y: box.y + box.h / 2 + dy, box };
  };
  return (
    <div className="clash-layer" aria-hidden="true">
      {onSkip && <div className="clash-skip" onClick={onSkip} />}
      {bigHit && <div key={bigHit.id} className="damage-vignette" />}
      {batches.map((batch) => (
        <div
          key={batch.key}
          className="clash-batch"
          style={{ "--ms": `${batch.ms ?? 600}ms` } as CSSProperties}
        >
          {batch.poses.map((pose) => {
            const c = centre(pose, batch.poses);
            if (
              !c ||
              (pose.mode !== "hit" &&
                pose.mode !== "die" &&
                pose.mode !== "arrive" &&
                pose.mode !== "strike")
            )
              return null;
            return (
              <span
                key={`${pose.id}-${pose.mode}`}
                className={`clash-fx ${pose.mode}`}
                style={{ left: c.x, top: c.y, width: c.box.w, height: c.box.h } as CSSProperties}
              >
                {pose.mode === "hit" && (
                  <>
                    <i className="clash-flash" />
                    <i className="clash-burst" />
                  </>
                )}
                {pose.mode === "strike" && <i className="clash-burst" />}
                {pose.mode === "die" && <i className="clash-shock" />}
                {pose.mode === "die" &&
                  embers.map((i) => (
                    <i
                      key={i}
                      className="ember"
                      style={
                        {
                          "--a": `${i * 45 + 14}deg`,
                          "--d": `${34 + (i % 3) * 14}px`,
                        } as CSSProperties
                      }
                    />
                  ))}
                {pose.mode === "arrive" && <i className="clash-ring" />}
              </span>
            );
          })}
          {batch.pops.map((pop) => {
            const box = spotBox(pop.at);
            if (!box) return null;
            let x = box.x + box.w / 2,
              y = "life" in pop.at ? box.y + box.h / 2 : box.y + box.h * 0.34;
            if (!("life" in pop.at)) {
              const at = pop.at,
                mover = batch.poses.find(
                  (g) => g.lunged && g.player === at.player && g.slot === at.slot,
                );
              if (mover) {
                const [dx, dy] = lungeVector(mover, slots, viewer);
                x += dx;
                y += dy;
              }
            }
            return (
              <span key={pop.id} className="clash-pop-anchor" style={{ left: x, top: y }}>
                {"life" in pop.at && <i className={`life-flash ${pop.tone}`} />}
                <b className={`clash-pop ${pop.tone}`}>{pop.text}</b>
              </span>
            );
          })}
          {batch.caption &&
            batch.poses[0] &&
            (() => {
              const c = centre(batch.poses[0], batch.poses);
              return (
                c && (
                  <span className="clash-caption" style={{ left: c.x, top: c.box.y }}>
                    {msg(batch.caption)}
                  </span>
                )
              );
            })()}
        </div>
      ))}
    </div>
  );
}
