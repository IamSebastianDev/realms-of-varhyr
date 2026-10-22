import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { X } from "lucide-react";
import { factionInfo } from "@realms/content";
import { FactionIcon, GenericEnergyIcon } from "@realms/renderer/FactionIcon";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import type { CreatureAction } from "./creatureActions";
import "./energy-choice-arc.css";

export type EnergyAction = Extract<CreatureAction, { kind: "channel" | "activate" }> & {
  output: Record<string, number>;
};
export type CardAnchor = { left: number; top: number; width: number; height: number };

/** Keep every hit target on screen, even when the source is in a flank slot. */
export function energyArcLayout(anchor: CardAnchor, count: number, width: number, height: number) {
  const size = width < 600 ? 40 : 44,
    margin = 12,
    half = size / 2;
  const rx = Math.min(count < 5 ? 80 + count * 8 : 144, (width - margin * 2 - size) / 2);
  const ry = count < 5 ? 78 : 108;
  const x = Math.max(
    margin + rx + half,
    Math.min(width - margin - rx - half, anchor.left + anchor.width / 2),
  );
  const y = Math.max(margin + ry + half, Math.min(height - margin - half, anchor.top - 14));
  const start = count < 5 ? (Math.PI * 5) / 6 : Math.PI,
    end = Math.PI - start;
  return {
    x,
    y,
    rx,
    ry,
    size,
    points: Array.from({ length: count }, (_, i) => {
      const angle = count === 1 ? Math.PI / 2 : start + ((end - start) * i) / (count - 1);
      return { x: x + Math.cos(angle) * rx, y: y - Math.sin(angle) * ry };
    }),
  };
}

export function EnergyChoiceArc({
  cardName,
  actions,
  getAnchor,
  onChoose,
  onClose,
  containerRef,
  reduced = false,
  actionName,
}: {
  cardName: string;
  actions: EnergyAction[];
  getAnchor: () => CardAnchor | null;
  onChoose: (action: EnergyAction) => void;
  onClose: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  reduced?: boolean;
  actionName: (action: EnergyAction) => string;
}) {
  useLanguage();
  const [layout, setLayout] = useState<ReturnType<typeof energyArcLayout> | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useLayoutEffect(() => {
    const update = () => {
      const anchor = getAnchor();
      if (anchor)
        setLayout(energyArcLayout(anchor, actions.length, window.innerWidth, window.innerHeight));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [getAnchor, actions.length]);
  if (!layout) return null;
  return (
    <div
      ref={containerRef}
      className={`energy-choice-arc ${reduced ? "reduced" : ""}`}
      role="dialog"
      aria-label={msg("{v0}: choose energy", { v0: cardName })}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
          return;
        }
        const index = buttons.current.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? actions.length - 1
              : event.key === "ArrowRight"
                ? (index + 1) % actions.length
                : event.key === "ArrowLeft"
                  ? (index - 1 + actions.length) % actions.length
                  : null;
        if (next !== null) {
          event.preventDefault();
          buttons.current[next]?.focus();
        }
      }}
    >
      <svg className="energy-arc-track" aria-hidden="true">
        <path
          d={`M ${layout.x - layout.rx} ${layout.y} A ${layout.rx} ${layout.ry} 0 0 1 ${layout.x + layout.rx} ${layout.y}`}
        />
      </svg>
      {actions.map((action, i) => {
        const [faction, amount] = Object.entries(action.output)[0],
          info = factionInfo[faction];
        const name = faction === "neutral" ? msg("Generic: any energy") : msg(info.name);
        const label = `${actionName(action)} · ${msg("{v0} {v1} energy", { v0: amount, v1: name })}`;
        return (
          <button
            key={`${action.kind}-${action.kind === "activate" ? action.ability : action.option}-${faction}`}
            ref={(node) => {
              buttons.current[i] = node;
            }}
            autoFocus={i === 0}
            className="energy-arc-choice"
            aria-label={label}
            style={
              {
                left: layout.points[i].x,
                top: layout.points[i].y,
                width: layout.size,
                height: layout.size,
                "--energy-color": info.color,
                "--choice-delay": `${i * 15}ms`,
              } as CSSProperties
            }
            onClick={() => onChoose(action)}
          >
            {faction === "neutral" ? <GenericEnergyIcon /> : <FactionIcon faction={faction} />}
            {amount !== 1 && <b>{amount}</b>}
          </button>
        );
      })}
      <button
        className="energy-arc-close"
        style={{ left: layout.x, top: layout.y + 7 }}
        aria-label={msg("Close card actions")}
        title={msg("Close card actions")}
        onClick={onClose}
      >
        <X size={14} />
      </button>
    </div>
  );
}
