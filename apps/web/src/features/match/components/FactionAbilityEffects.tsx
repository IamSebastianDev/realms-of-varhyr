import { maybeRectOf, rectOf } from "@realms/ui/stage";
import { useLayoutEffect, useState, type CSSProperties } from "react";
import { Coins, Crown, Flame, Leaf, Shield, Waves, Sparkles, Swords, Wind } from "lucide-react";
import type { PlayerId } from "@realms/contracts";
import type { SlotLayout } from "@realms/renderer/Board";
import type {
  FactionAura,
  FactionEffect,
  FactionEffectKind,
  FactionEffectSpot,
} from "../lib/factionEffects";
import "../styles/faction-effects.css";

const icons = {
  fealty: Crown,
  rally: Swords,
  raid: Swords,
  trade: Coins,
  scorch: Flame,
  sanctuary: Leaf,
  accord: Waves,
  "soul-harvest": Sparkles,
  wayfarer: Wind,
};
const colors: Record<FactionEffectKind, string> = {
  fealty: "#efcf78",
  rally: "#ffb872",
  raid: "#ed8468",
  trade: "#f5d38b",
  scorch: "#ff8c4c",
  sanctuary: "#a6d8a0",
  accord: "#b7e8ff",
  "soul-harvest": "#c0a2ef",
  wayfarer: "#c8e3d0",
};
type Box = { x: number; y: number; w: number; h: number };
const particles = Array.from({ length: 8 }, (_, i) => i);

/** Screen-space accents surround the real R3F cards; neither effects nor overlays receive pointer input. */
export function FactionAbilityEffects({
  auras,
  bursts,
  board,
  slots,
  viewer,
  reduced,
}: {
  auras: FactionAura[];
  bursts: FactionEffect[];
  board: HTMLElement | null;
  slots: SlotLayout[];
  viewer: PlayerId;
  reduced: boolean;
}) {
  const [, measure] = useState(0);
  useLayoutEffect(() => {
    if (!board) return;
    const observer = new ResizeObserver(() => measure((n) => n + 1));
    observer.observe(board);
    const update = () => measure((n) => n + 1);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [board]);
  if (!board) return null;
  const origin = rectOf(board);
  const box = (spot: FactionEffectSpot): Box | undefined => {
    if ("slot" in spot) {
      const found = slots.find((s) => s.player === spot.player && s.slot === spot.slot);
      return found
        ? { x: origin.left + found.x, y: origin.top + found.y, w: found.width, h: found.height }
        : undefined;
    }
    const side = spot.player === viewer ? "own" : "opponent";
    const node =
      spot.area === "pool"
        ? document.querySelector(`.player-banner.${side} .energy-meter`)
        : spot.player === viewer
          ? document.querySelector(".hand-scroll")
          : document.querySelector(`.player-banner.${side} .hand-count`);
    const rect = maybeRectOf(node);
    return rect ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : undefined;
  };
  const center = (rect: Box) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  const style = (rect: Box, color: string) =>
    ({
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      "--ability-color": color,
    }) as CSSProperties;
  return (
    <div
      className={`faction-effects ${reduced ? "faction-motion-reduced" : ""}`}
      aria-hidden="true"
    >
      {auras.map((aura) => {
        const source = box(aura.source);
        if (!source) return null;
        const Icon = icons[aura.kind],
          color = colors[aura.kind];
        return (
          <div
            key={aura.id}
            className={`faction-aura aura-${aura.kind}`}
            data-faction-aura={aura.kind}
          >
            <span
              className={`ability-source-mark ${aura.buffs.length ? "is-active" : ""}`}
              style={
                {
                  left: source.x + source.w - 10,
                  top: source.y - 10,
                  "--ability-color": color,
                } as CSSProperties
              }
            >
              <Icon size={12} />
            </span>
            {aura.buffs.map((buff) => {
              const target = box(buff.spot);
              if (!target) return null;
              const same = source.x === target.x && source.y === target.y;
              const x1 = source.x + source.w / 2,
                y1 = source.y + source.h + 4,
                x2 = target.x + target.w / 2,
                y2 = target.y + target.h + 4;
              return (
                <div key={buff.id}>
                  {!same && (
                    <svg className="ability-threads">
                      <path
                        d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.max(y1, y2) + 24} ${x2} ${y2}`}
                        stroke={color}
                      />
                    </svg>
                  )}
                  <span
                    className={`ability-ward ${buff.defense > 1 ? "strong-ward" : ""}`}
                    style={style(target, color)}
                  >
                    {aura.kind === "sanctuary" ? (
                      <>
                        <i className="ward-leaf left" />
                        <i className="ward-leaf right" />
                        {buff.defense > 1 && <Shield className="elf-ward" size={14} />}
                      </>
                    ) : aura.kind === "raid" ? (
                      <span
                        className="raid-claws"
                        style={{ "--raid-strength": buff.attack } as CSSProperties}
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <>
                        <i className="oath-corner top" />
                        <i className="oath-corner bottom" />
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
      {!reduced &&
        bursts.map((effect) => {
          const source = box(effect.source),
            fromBox = box(effect.from),
            toBox = effect.to && box(effect.to);
          if (!source || !fromBox) return null;
          const from = center(fromBox),
            to = toBox ? center(toBox) : from,
            color = colors[effect.kind],
            Icon = icons[effect.kind];
          const path = `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - Math.min(90, Math.hypot(to.x - from.x, to.y - from.y) * 0.22)} ${to.x} ${to.y}`;
          return (
            <div
              key={effect.id}
              className={`ability-burst burst-${effect.kind}`}
              data-faction-burst={effect.kind}
              style={{ "--ability-color": color } as CSSProperties}
            >
              <span className="ability-origin" style={style(source, color)}>
                <i className="ability-sigil">
                  <Icon size={22} />
                </i>
                <i className="ability-ring" />
                <i className="ability-ring second" />
              </span>
              {toBox && (
                <>
                  <svg className="ability-trail">
                    <path d={path} />
                  </svg>
                  {particles.map((i) => (
                    <i
                      key={i}
                      className="ability-mote"
                      style={{ offsetPath: `path("${path}")`, "--i": i } as CSSProperties}
                    />
                  ))}
                </>
              )}
              <span className="ability-destination" style={style(toBox ?? source, color)}>
                <i className="ability-impact" />
                {particles.map((i) => (
                  <i
                    key={i}
                    className="ability-fragment"
                    style={{ "--i": i, "--angle": `${i * 45 + 13}deg` } as CSSProperties}
                  />
                ))}
              </span>
            </div>
          );
        })}
    </div>
  );
}
