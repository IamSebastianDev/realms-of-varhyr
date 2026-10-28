import { useLayoutEffect, useRef } from "react";
import { ArtCard } from "@realms/ui/CardPresentation";
import { maybeRectOf } from "@realms/ui/stage";
import type { PlayerId } from "@realms/contracts";
import {
  DRAW_FLIGHT,
  DRAW_STAGGER,
  KEEP_FLIGHT,
  useDrawFlights,
  useKeepFlights,
  type DrawFlight,
  type KeepFlight,
} from "../lib/drawFx";

/** A face-down card flying from a library to a hand. Screen-space decoration only: the engine already moved the card. */
function Ghost({
  player,
  mine,
  cardId,
  index,
  lead,
}: {
  player: PlayerId;
  mine: boolean;
  cardId?: string;
  index: number;
  lead: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const ghost = ref.current;
    if (!ghost) return;
    let frame = 0,
      tries = 0,
      animation: Animation | undefined;
    const launch = () => {
      const library = document.querySelector(`[data-library="${player}"]`),
        face = library?.querySelector<HTMLElement>(".card-back-face"),
        from = maybeRectOf(library),
        target = mine
          ? // A card dealt into the draw dialog lands there; any other lands in the hand.
            (document.getElementById(`draw-card-${cardId}`) ??
            document.getElementById(`hand-${cardId}`))
          : document.querySelector(`[data-hand="${player}"]`),
        // A card still turning over is edge-on, so its box is measured by its layout size around the same centre.
        spot = target && maybeRectOf(target),
        to =
          spot && target instanceof HTMLElement && mine
            ? {
                left: spot.left + spot.width / 2 - target.offsetWidth / 2,
                top: spot.top + spot.height / 2 - target.offsetHeight / 2,
                width: target.offsetWidth,
                height: target.offsetHeight,
              }
            : spot;
      // The hand card is rendered by the same update that announced the draw, but a slow frame can still be ahead of it.
      if ((!from || !to) && tries++ < 8) {
        frame = requestAnimationFrame(launch);
        return;
      }
      if (!from || !to) {
        // React owns this node: hide it rather than detaching it, or the unmount that follows throws removeChild.
        ghost.style.display = "none";
        return;
      }
      if (face) ghost.style.backgroundImage = getComputedStyle(face).backgroundImage;
      // The ghost has the size of the card it becomes (or of the opponent's pile), and is moved by its centre.
      const width = mine ? to.width : from.width * 0.7,
        height = mine ? to.height : from.height * 0.7;
      ghost.style.width = `${width}px`;
      ghost.style.height = `${height}px`;
      ghost.style.left = `${to.left + to.width / 2 - width / 2}px`;
      ghost.style.top = `${to.top + to.height / 2 - height / 2}px`;
      const dx = from.left + from.width / 2 - (to.left + to.width / 2),
        dy = from.top + from.height / 2 - (to.top + to.height / 2),
        start = Math.min(0.5, (from.height * 0.9) / height);
      // A short arc: up and over rather than a straight line, so a draw reads as dealt.
      const lift = Math.min(70, Math.abs(dy) * 0.18 + 24) * (mine ? 1 : -1) * (dy < 0 ? -1 : 1);
      animation = ghost.animate(
        [
          {
            offset: 0,
            opacity: 0,
            transform: `translate(${dx}px, ${dy}px) scale(${start}) rotate(-10deg)`,
          },
          { offset: 0.12, opacity: 1 },
          {
            offset: 0.5,
            opacity: 1,
            transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(${(start + 1) / 2 + 0.05}) rotate(4deg)`,
          },
          mine
            ? {
                offset: 0.78,
                opacity: 1,
                transform: "translate(0px, 0px) scale(1.04) rotate(0deg) rotateY(0deg)",
              }
            : {
                offset: 0.85,
                opacity: 1,
                transform: "translate(0px, 0px) scale(0.8) rotate(0deg)",
              },
          mine
            ? {
                offset: 1,
                opacity: 1,
                transform: "translate(0px, 0px) scale(1) rotate(0deg) rotateY(90deg)",
              }
            : { offset: 1, opacity: 0, transform: "translate(0px, 0px) scale(0.55) rotate(0deg)" },
        ],
        {
          duration: DRAW_FLIGHT,
          delay: lead + index * DRAW_STAGGER,
          easing: "cubic-bezier(0.3, 0.1, 0.25, 1)",
          fill: "both",
        },
      );
    };
    launch();
    return () => {
      cancelAnimationFrame(frame);
      animation?.cancel();
    };
  }, [player, mine, cardId, index, lead]);
  return <div ref={ref} className="draw-flight card-back-face" aria-hidden="true" />;
}

/** The card that was kept from the turn's draw, face up, carried from the dialog to its place in the hand. */
function KeepGhost({ keep }: { keep: KeepFlight }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const ghost = ref.current;
    if (!ghost) return;
    let frame = 0,
      tries = 0,
      animation: Animation | undefined;
    const { from } = keep;
    ghost.style.left = `${from.left}px`;
    ghost.style.top = `${from.top}px`;
    ghost.style.width = `${from.width}px`;
    ghost.style.height = `${from.height}px`;
    // It stays where it was shown until the hand has its slot, which the engine answer may still be on its way to fill.
    const launch = () => {
      const target = document.getElementById(`hand-${keep.cardId}`),
        spot = target && maybeRectOf(target);
      if (!target || !spot) {
        if (tries++ < 90) frame = requestAnimationFrame(launch);
        else ghost.style.display = "none"; // Hidden, not removed: React still owns the node.
        return;
      }
      const w = (target as HTMLElement).offsetWidth || spot.width,
        h = (target as HTMLElement).offsetHeight || spot.height,
        dx = spot.left + spot.width / 2 - (from.left + from.width / 2),
        dy = spot.top + spot.height / 2 - (from.top + from.height / 2);
      animation = ghost.animate(
        [
          { transform: "translate(0px, 0px) scale(1)" },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${w / from.width}, ${h / from.height})`,
          },
        ],
        { duration: KEEP_FLIGHT, easing: "cubic-bezier(0.3, 0.1, 0.25, 1)", fill: "forwards" },
      );
    };
    launch();
    return () => {
      cancelAnimationFrame(frame);
      animation?.cancel();
    };
  }, [keep]);
  return (
    <div ref={ref} className="draw-flight keep">
      <ArtCard detail={false} card={keep.card} reduced />
    </div>
  );
}

export function DrawFlow({ viewer }: { viewer: PlayerId }) {
  const flights = useDrawFlights(),
    keeps = useKeepFlights();
  return (
    <div className="draw-flows" aria-hidden="true">
      {keeps.map((keep) => (
        <KeepGhost key={keep.id} keep={keep} />
      ))}
      {flights.map((flight: DrawFlight) =>
        Array.from({ length: flight.count }, (_, i) => (
          <Ghost
            key={`${flight.id}-${i}`}
            player={flight.player}
            mine={flight.player === viewer}
            cardId={flight.cardIds[i]}
            index={i}
            lead={flight.lead ?? 0}
          />
        )),
      )}
    </div>
  );
}
