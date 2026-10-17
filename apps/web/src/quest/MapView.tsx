import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { factionInfo } from '../../../../packages/content/src';
import { questRules, territory, type MapNode, type Role, type RunState } from '../../../../packages/quest/src';
import { siteShape } from '../../../../packages/ui/src/siteIcons';
import type { LoadedMap } from './questStore';

/** The map is laid out in a world this many CSS pixels wide; zooming scales that world. */
const WORLD_W = 2400, MAX_ZOOM = 6;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const colorOf = (affiliation: string) => factionInfo[affiliation]?.color ?? '#c6c3b5';

/** Which silhouette a revealed node wears. Places that are not permanent stay a question mark until they are visited. */
const iconFor = (role: Role): Parameters<typeof siteShape>[0] => role === 'fight' || role === 'boss' ? 'arena' : role === 'refuge' || role === 'trader' ? 'market' : role === 'cache' ? 'ruin' : role;

/** The painted map as tiles: a low-resolution underlay that is always there, plus sharper tiles for what is on screen. */
function Tiles({ map, zoom, view, size }: { map: LoadedMap; zoom: number; view: { x: number; y: number }; size: { w: number; h: number } }) {
  const { tiles } = map, worldH = WORLD_W / map.aspect;
  const base = Math.min(2, tiles.maxZoom);
  const wanted = clamp(Math.ceil(Math.log2(Math.max(1, WORLD_W * zoom * (window.devicePixelRatio || 1)) / tiles.size)), 0, tiles.maxZoom);
  const levelWidth = (z: number) => z === tiles.maxZoom ? tiles.width : tiles.size * 2 ** z;
  const level = (z: number, onlyVisible: boolean) => {
    const w = levelWidth(z), h = Math.round(w * tiles.height / tiles.width), scale = WORLD_W / w;
    const left = (-view.x / zoom) / scale, top = (-view.y / zoom) / scale, right = left + size.w / zoom / scale, bottom = top + size.h / zoom / scale;
    const out: { key: string; src: string; style: { left: number; top: number; width: number; height: number } }[] = [];
    for (let y = 0; y * tiles.size < h; y++) for (let x = 0; x * tiles.size < w; x++) {
      const x0 = x * tiles.size, y0 = y * tiles.size, tw = Math.min(tiles.size, w - x0), th = Math.min(tiles.size, h - y0);
      if (onlyVisible && (x0 > right || y0 > bottom || x0 + tw < left || y0 + th < top)) continue;
      out.push({ key: `${z}/${x}_${y}`, src: `/quest/tiles/${z}/${x}_${y}.jpg`, style: { left: x0 * scale, top: y0 * scale, width: tw * scale + 0.6, height: th * scale + 0.6 } });
    }
    return out;
  };
  const under = useMemo(() => level(base, false), [base, tiles]); // eslint-disable-line react-hooks/exhaustive-deps
  const sharp = wanted > base ? level(wanted, true) : [];
  void worldH;
  return <>{[...under, ...sharp].map(tile => <img key={tile.key} className="quest-tile" src={tile.src} alt="" draggable={false} decoding="async" style={tile.style}/>)}</>;
}

export function MapView({ map, run, onNode, focusKey, walk, onArrived, reduced }: { map: LoadedMap; run: RunState; onNode: (id: string) => void; /** A journey in progress; the token walks it and calls onArrived. */ walk?: { from: string; to: string } | null; onArrived?: () => void; reduced?: boolean; /** Changes when the view should recentre on the player. */ focusKey: string }) {
  const worldH = WORLD_W / map.aspect;
  const [view, setView] = useState({ zoom: 0.3, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean; node: string | null; pinch: number } | null>(null);
  const fitted = useRef('');
  const [progress, setProgress] = useState(0);
  const arrived = useRef(onArrived); arrived.current = onArrived;

  useEffect(() => {
    if (!frame) return;
    const watch = new ResizeObserver(entries => { const box = entries[0]!.contentRect; setSize({ w: box.width, h: box.height }); });
    watch.observe(frame);
    return () => watch.disconnect();
  }, [frame]);
  const fitZoom = size.w ? Math.min(size.w / WORLD_W, size.h / worldH) : 0.3;
  const nodeById = useMemo(() => new Map(map.nodes.map(node => [node.id, node])), [map]);
  const at = useCallback((id: string) => { const node = nodeById.get(id); return node ? { x: node.x * WORLD_W, y: node.y * worldH } : null; }, [nodeById, worldH]);

  const centre = useCallback((id: string, zoom: number) => {
    const spot = at(id);
    if (spot && size.w) setView({ zoom, x: size.w / 2 - spot.x * zoom, y: size.h / 2 - spot.y * zoom });
  }, [at, size]);
  // Open on the player, showing roughly a third of the map; recentre when asked.
  useEffect(() => {
    const key = `${focusKey}|${size.w > 0}`;
    if (size.w > 0 && fitted.current !== key) { fitted.current = key; centre(run.position, Math.max(fitZoom, size.w / (WORLD_W * 0.35))); }
  }, [focusKey, size, centre, run.position, fitZoom]);

  // The journey: the token follows a gentle curve, the camera follows the token.
  const curve = useCallback((from: string, to: string) => {
    const a = nodeById.get(from), b = nodeById.get(to);
    if (!a || !b) return null;
    const p0 = { x: a.x, y: a.y / map.aspect }, p2 = { x: b.x, y: b.y / map.aspect }, dx = p2.x - p0.x, dy = p2.y - p0.y, length = Math.hypot(dx, dy);
    const p1 = { x: (p0.x + p2.x) / 2 - dy * 0.14, y: (p0.y + p2.y) / 2 + dx * 0.14 };
    return { p0, p1, p2, length, at: (t: number) => ({ x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x, y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y }) };
  }, [nodeById, map.aspect]);
  const walkCurve = walk ? curve(walk.from, walk.to) : null;
  const zoomNow = useRef(view.zoom); zoomNow.current = view.zoom;
  useEffect(() => {
    if (!walk || !walkCurve) { setProgress(0); return; }
    if (reduced || !size.w) { setProgress(0); arrived.current?.(); return; }
    const duration = clamp(500 + walkCurve.length * 3200, 700, 2200), started = performance.now();
    let frameId = 0;
    const step = (now: number) => {
      const raw = Math.min(1, (now - started) / duration), t = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
      setProgress(t);
      const point = walkCurve.at(t), zoom = zoomNow.current;
      setView(current => ({ ...current, x: current.x + (size.w / 2 - point.x * WORLD_W * zoom - current.x) * 0.12, y: current.y + (size.h / 2 - point.y * WORLD_W * zoom - current.y) * 0.12 }));
      if (raw < 1) frameId = requestAnimationFrame(step); else { setProgress(0); arrived.current?.(); }
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [walk?.from, walk?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = useCallback((factor: number, around?: { x: number; y: number }) => setView(current => {
    const zoom = clamp(current.zoom * factor, fitZoom * 0.95, MAX_ZOOM), k = zoom / current.zoom;
    const px = around?.x ?? size.w / 2, py = around?.y ?? size.h / 2;
    return { zoom, x: px - (px - current.x) * k, y: py - (py - current.y) * k };
  }), [fitZoom, size]);
  useEffect(() => {
    if (!frame) return;
    const onWheel = (event: WheelEvent) => { event.preventDefault(); const box = frame.getBoundingClientRect(); zoomBy(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0016)), { x: event.clientX - box.left, y: event.clientY - box.top }); };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [frame, zoomBy]);

  const onDown = (event: ReactPointerEvent) => {
    if (event.button > 1) return;
    frame!.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const node = (event.target as Element).closest('[data-node]')?.getAttribute('data-node') ?? null;
    drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: pointers.current.size > 1, node, pinch: 0 };
  };
  const onMove = (event: ReactPointerEvent) => {
    const g = drag.current;
    if (!g || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()], gap = Math.hypot(a!.x - b!.x, a!.y - b!.y), box = frame!.getBoundingClientRect();
      if (g.pinch) zoomBy(gap / g.pinch, { x: (a!.x + b!.x) / 2 - box.left, y: (a!.y + b!.y) / 2 - box.top });
      g.pinch = gap; g.moved = true;
      return;
    }
    if (Math.abs(event.clientX - g.x) + Math.abs(event.clientY - g.y) > 6) g.moved = true;
    if (g.moved) setView(current => ({ ...current, x: g.vx + event.clientX - g.x, y: g.vy + event.clientY - g.y }));
  };
  const onUp = (event: ReactPointerEvent) => {
    const g = drag.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) { if (g) { g.pinch = 0; g.vx = view.x; g.vy = view.y; g.x = event.clientX; g.y = event.clientY; } return; }
    drag.current = null;
    if (g && !g.moved && g.node && event.type === 'pointerup') onNode(g.node);
  };

  const geometry = useMemo(() => territory(map), [map]);
  const iso = (node: { x: number; y: number }) => ({ x: node.x, y: node.y / map.aspect });
  const unit = 1 / (WORLD_W * view.zoom);
  const nodes = run.revealed.map(id => nodeById.get(id)).filter((node): node is MapNode => !!node);
  const sources = [...new Set([run.quest.starts[run.faction], run.position, ...run.visited])].map(id => id && nodeById.get(id)).filter((node): node is MapNode => !!node);
  const beacons = run.beacons.map(id => nodeById.get(id)).filter((node): node is MapNode => !!node);
  const reach = map.settings.reveal, soft = reach * 0.22;
  const trail = [run.quest.starts[run.faction], ...run.visited].map(id => id && nodeById.get(id)).filter((node): node is MapNode => !!node).map(node => iso(node));
  const here = run.encounter?.node ?? run.position;
  const hint = run.targetFound ? null : run.quest.hint;
  const path = (points: { x: number; y: number }[]) => points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join('');
  const borders = geometry.borders.map(border => `M${border.a[0]} ${border.a[1] / map.aspect}L${border.b[0]} ${border.b[1] / map.aspect}`).join('');

  return <div ref={setFrame} className="quest-frame" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
    <div className="quest-world" style={{ width: WORLD_W, height: worldH, transform: `translate(${view.x}px,${view.y}px) scale(${view.zoom})` }}>
      <Tiles map={map} zoom={view.zoom} view={view} size={size}/>
      <svg viewBox={`0 0 1 ${1 / map.aspect}`} width={WORLD_W} height={worldH}>
        <defs>
          <filter id="quest-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={soft}/></filter>
          <mask id="quest-fog" maskUnits="userSpaceOnUse" x="0" y="0" width="1" height={1 / map.aspect}>
            <rect width="1" height={1 / map.aspect} fill="#fff"/>
            <g filter="url(#quest-soft)" fill="#000">
              {sources.map(node => <circle key={node.id} cx={iso(node).x} cy={iso(node).y} r={reach}/>)}
              {beacons.map(node => <circle key={`b${node.id}`} cx={iso(node).x} cy={iso(node).y} r={reach * questRules.waymarkReveal}/>)}
            </g>
          </mask>
          <mask id="quest-seen" maskUnits="userSpaceOnUse" x="0" y="0" width="1" height={1 / map.aspect}>
            <rect width="1" height={1 / map.aspect} fill="#000"/>
            <g filter="url(#quest-soft)" fill="#fff">
              {sources.map(node => <circle key={node.id} cx={iso(node).x} cy={iso(node).y} r={reach}/>)}
              {beacons.map(node => <circle key={`b${node.id}`} cx={iso(node).x} cy={iso(node).y} r={reach * questRules.waymarkReveal}/>)}
            </g>
          </mask>
        </defs>
        <rect className="quest-fog" width="1" height={1 / map.aspect} mask="url(#quest-fog)"/>
        <g mask="url(#quest-seen)"><path d={borders} className="quest-border-shade"/><path d={borders} className="quest-border"/></g>
        {trail.length > 1 && <path d={path(trail)} className="quest-trail"/>}
        {hint && <g className="quest-hint"><circle cx={hint.x} cy={hint.y / map.aspect} r={hint.r}/><text x={hint.x} y={hint.y / map.aspect} style={{ fontSize: 30 * unit }} dy="0.35em">?</text></g>}
        {nodes.map(node => {
          const role = run.world[node.id]!, visited = run.visited.includes(node.id), permanent = node.kind === 'permanent' || role === 'boss';
          const known = permanent || visited, radius = role === 'capital' ? 19 : role === 'city' ? 16 : permanent ? 14 : 12, { x, y } = iso(node), color = colorOf(node.affiliation);
          return <g key={node.id} data-node={node.id} transform={`translate(${x} ${y}) scale(${unit})`} className={`quest-node ${visited ? 'done' : ''} ${node.id === here ? 'here' : ''} ${role === 'boss' ? 'boss' : ''}`}>
            <title>{node.name || (known ? role : '?')}</title>
            <circle r={24} className="hit"/>
            {node.id === run.position && <circle r={radius + 7} className="ring"/>}
            {role === 'capital' && <circle r={radius + 4} className="crown"/>}
            {known ? <><circle r={radius} fill={color} className="body"/><g className="icon" transform={`scale(${radius / 12 * 0.78})`} fill="currentColor">{siteShape(iconFor(role))}</g></>
              : <><circle r={radius} className="body unknown" stroke={color}/><text className="mark" dy="0.36em">?</text></>}
            {run.bounties[node.id] && !visited && <circle className="bounty" cx={radius} cy={-radius} r={5}/>}
            {node.name && known && <text className="label" y={radius + 14}>{node.name}</text>}
          </g>;
        })}
        {walkCurve && progress > 0 && (() => { const steps = Array.from({ length: Math.max(2, Math.round(progress * 40)) }, (_, index) => walkCurve.at(progress * index / Math.max(1, Math.round(progress * 40) - 1))); return <path d={path(steps)} className="quest-trail walking"/>; })()}
        {(() => {
          const spot = nodeById.get(run.position); if (!spot) return null;
          const point = walkCurve ? walkCurve.at(progress) : iso(spot);
          return <g transform={`translate(${point.x} ${point.y}) scale(${unit})`} className={`quest-token ${walkCurve ? 'walking' : ''}`}><path d="M0-34L7-22H-7Z"/></g>;
        })()}
      </svg>
    </div>
  </div>;
}
