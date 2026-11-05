import {
  Compass,
  Crown,
  LocateFixed,
  ScrollText,
  ShoppingBag,
  Skull,
  Swords,
  Tent,
} from "lucide-react";
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { options, text, type AdventureDef, type NodeType, type RunState } from "@realms/adventure";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { clampPan, focusPosition } from "../lib/mapLayout";

const Table = lazy(() => import("./AdventureTable"));
export const nodeInfo: Record<NodeType, { name: string; Icon: ComponentType<{ size?: number }> }> =
  {
    battle: { name: "Battle", Icon: Swords },
    elite: { name: "Elite battle", Icon: Skull },
    event: { name: "Story", Icon: ScrollText },
    shop: { name: "Shop", Icon: ShoppingBag },
    improve: { name: "Camp", Icon: Tent },
    final: { name: "Final battle", Icon: Crown },
  };

/** A rendering failure leaves the accessible, playable parchment map in place. */
class TableBoundary extends Component<
  { children: ReactNode; failed: () => void },
  { broken: boolean }
> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  componentDidCatch(error: Error) {
    console.error("Adventure table could not render", error);
    this.props.failed();
  }
  render() {
    return this.state.broken ? null : this.props.children;
  }
}

/** The same destinations are keyboard-accessible HTML controls and miniature locations on the table. */
export function AdventureMap({
  def,
  run,
  travel,
  reduced = false,
  active = true,
}: {
  def: AdventureDef;
  run: RunState;
  travel: (node: string) => void;
  reduced?: boolean;
  active?: boolean;
}) {
  const language = useLanguage();
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const wake = useRef(() => {});
  const target = useRef(focusPosition(def.nodes.find((n) => n.id === run.at)!));
  const drag = useRef<{ y: number; from: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [palette, setPalette] = useState<{
    bronze: string;
    gold: string;
    wood: string;
    ivory: string;
    ink: string;
    torch: string;
    halo: string;
    haloLight: string;
  }>();
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(() => setFailed(true), []);
  useEffect(() => {
    const css = getComputedStyle(host.current!);
    const value = (name: string) => css.getPropertyValue(name).trim();
    setPalette({
      bronze: value("--parchment-dark"),
      gold: value("--gilt"),
      wood: value("--wood-light"),
      ivory: value("--ivory"),
      ink: value("--ink-brown"),
      torch: value("--torchlight"),
      halo: value("--adventure-halo"),
      haloLight: value("--adventure-halo-light"),
    });
  }, []);
  const focus = (id: string) => {
    const node = def.nodes.find((entry) => entry.id === id);
    if (node) {
      target.current = focusPosition(node);
      wake.current();
      if (failed) labels.current.get(id)?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  };
  useEffect(() => {
    focus(run.at);
  }, [run.at, failed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (failed) return;
      event.preventDefault();
      target.current = clampPan(target.current + event.deltaY * 0.018);
      wake.current();
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [failed]);
  // Hovering a chip should not reconstruct the scene's route geometry.
  const reachable = useMemo(() => new Set(options(run, def)), [run, def]);
  const states = useMemo(() => {
    const visited = new Set(run.visited);
    return new Map(
      def.nodes.map(
        (node) =>
          [
            node.id,
            node.id === run.at
              ? "current"
              : visited.has(node.id)
                ? "visited"
                : reachable.has(node.id)
                  ? "open"
                  : "ahead",
          ] as const,
      ),
    );
  }, [def, run.at, run.visited, reachable]);
  const byId = useMemo(() => new Map(def.nodes.map((node) => [node.id, node])), [def]);
  return (
    <div
      ref={host}
      className={`adv-map ${failed ? "is-flat" : ready ? "is-3d" : "is-loading"}`}
      role="group"
      aria-label={msg("Route map")}
      aria-busy={!ready && !failed}
      onPointerDown={(event) => {
        if (event.button !== 0 || failed) return;
        suppressClick.current = false;
        drag.current = { y: event.clientY, from: target.current, moved: false };
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d || (!d.moved && Math.abs(event.clientY - d.y) < 6)) return;
        d.moved = true;
        suppressClick.current = true;
        host.current?.setPointerCapture(event.pointerId);
        target.current = clampPan(d.from - (event.clientY - d.y) * 0.024);
        wake.current();
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
        suppressClick.current = false;
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
    >
      {palette && !failed && (
        <TableBoundary failed={onFailure}>
          <Suspense fallback={null}>
            <Table
              def={def}
              states={states}
              highlighted={highlighted}
              target={target}
              labels={labels}
              wake={wake}
              reduced={reduced}
              active={active}
              ready={onReady}
              failed={onFailure}
              palette={palette}
            />
          </Suspense>
        </TableBoundary>
      )}
      <div
        className="adv-locations"
        style={{
          backgroundImage:
            failed && def.mapArt ? `url(/adventures/${def.id}/${def.mapArt}.webp)` : undefined,
        }}
      >
        {failed && (
          <svg
            className="adv-edges"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {def.nodes.flatMap((node) =>
              node.next.map((to) => {
                const next = byId.get(to);
                return next ? (
                  <line key={`${node.id}-${to}`} x1={node.x} y1={node.y} x2={next.x} y2={next.y} />
                ) : null;
              }),
            )}
          </svg>
        )}
        {def.nodes.map((node) => {
          const { name, Icon } = nodeInfo[node.type];
          const state = states.get(node.id)!;
          const label = text(node.label, language) || msg(name);
          return (
            <button
              key={node.id}
              ref={(el) => {
                if (el) labels.current.set(node.id, el);
                else labels.current.delete(node.id);
              }}
              data-node={node.id}
              className={`adv-node ${node.type} ${state}`}
              style={failed ? { left: `${node.x}%`, top: `${node.y}%` } : undefined}
              disabled={!reachable.has(node.id)}
              aria-label={`${msg(name)}: ${label}`}
              aria-current={node.id === run.at ? "location" : undefined}
              title={msg(name)}
              onPointerEnter={(event) => {
                if (state === "open" && event.pointerType !== "touch") setHighlighted(node.id);
              }}
              onPointerLeave={() => {
                if (!labels.current.get(node.id)?.matches(":focus-visible"))
                  setHighlighted((current) => (current === node.id ? null : current));
              }}
              onFocus={(event) => {
                // Mouse and touch focus should not unexpectedly move the map.
                if (event.currentTarget.matches(":focus-visible")) focus(node.id);
                if (state === "open") setHighlighted(node.id);
              }}
              onBlur={() => setHighlighted((current) => (current === node.id ? null : current))}
              onClick={() => travel(node.id)}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <div className="adv-map-tools">
        <div className="adv-map-key" aria-label={msg("Route map")}>
          {Object.entries(nodeInfo).map(([type, { name, Icon }]) => (
            <span key={type}>
              <Icon size={13} />
              {msg(name)}
            </span>
          ))}
        </div>
        {!failed && (
          <button
            className="outline-button"
            onClick={() => focus(run.at)}
            title={msg("Current location")}
            aria-label={msg("Current location")}
          >
            <LocateFixed size={17} />
          </button>
        )}
      </div>
      <div
        className={`adv-table-loading ${ready || failed ? "is-ready" : ""}`}
        aria-hidden={ready || failed}
      >
        <div role="status">
          <Compass size={30} aria-hidden="true" />
          <p>{msg("Loading adventure")}…</p>
        </div>
      </div>
    </div>
  );
}
