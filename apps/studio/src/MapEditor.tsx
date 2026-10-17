import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { factionInfo } from '../../../packages/content/src';
import { emptyMap, neutralAffiliation, nextId, parseMap, permanentSites, reachOf, serializeMap, territory, validateMap, type MapNode, type MapSettings, type NodeKind, type PermanentSite, type QuestMap, type ReachKind } from '../../../packages/quest/src';
import * as fs from './fs';
import { SiteIcon, siteShape } from './siteIcons';

/** The map is laid out in a world this many CSS pixels wide; zooming scales that world. */
const WORLD_W = 2400;
const MAX_ZOOM = 8;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const siteInfo: Record<PermanentSite, { name: string; glyph: string; note: string }> = {
  city: { name: 'City', glyph: 'C', note: 'Heal for money, shop, rumors' },
  market: { name: 'Market', glyph: 'M', note: 'Shop' },
  shrine: { name: 'Shrine', glyph: 'S', note: 'Exchange or sacrifice cards' },
  ruin: { name: 'Ruin', glyph: 'R', note: 'Found card or gold' },
  waymark: { name: 'Waymark', glyph: 'W', note: 'Lore drop' },
  arena: { name: 'Arena', glyph: 'A', note: 'Optional harder fight' },
  capital: { name: 'Capital', glyph: '★', note: "A faction's capital" },
  landmark: { name: 'Landmark', glyph: 'L', note: 'Plot place, quest target or boss' },
};
const factionIds = Object.keys(factionInfo).filter(id => id !== neutralAffiliation);
const affiliations = [...factionIds, neutralAffiliation];
const names: Record<string, string> = Object.fromEntries(Object.entries(factionInfo).map(([id, info]) => [id, info.name.replace(/^The /, '')]));
const affiliationName = (id: string) => id === neutralAffiliation ? 'Neutral (wilderness)' : names[id] ?? id;
const colorOf = (id: string) => factionInfo[id]?.color ?? '#c6c3b5';

type Defaults = { kind: NodeKind; site: PermanentSite; /** A faction id, or 'nearest' to copy the closest existing node. */ affiliation: string };
type Gesture =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: 'node'; id: string; sx: number; sy: number; moved: boolean; before: MapNode[] };

async function imageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob), size = { w: bitmap.width, h: bitmap.height };
  bitmap.close();
  return size;
}
const draftKey = (scope: string) => `varhyr-quest-map-draft|${scope}`;
const readDraft = (scope: string): string | null => { try { return localStorage.getItem(draftKey(scope)); } catch { return null; } };
const storeDraft = (scope: string, text: string | null) => { try { if (text === null) localStorage.removeItem(draftKey(scope)); else localStorage.setItem(draftKey(scope), text); } catch { /* Drafts are a convenience. */ } };

/**
 * The node tool: places the quest map's nodes on the painted map, says what each one is and whose land it lies on, and shows the
 * territories and borders that follow from that. Saves assets/quest/map.json.
 */
export function MapEditor({ repo, scope, active }: { repo: fs.Repo; scope: string; active: boolean }) {
  const [map, setMap] = useState<QuestMap | null>(null);
  const [saved, setSaved] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageMissing, setImageMissing] = useState(false);
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setToolState] = useState<'select' | 'add'>('select');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [defaults, setDefaults] = useState<Defaults>({ kind: 'permanent', site: 'city', affiliation: 'nearest' });
  const [overlay, setOverlay] = useState({ territories: true, borders: true, labels: true });
  const [view, setView] = useState({ zoom: 0.3, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [past, setPast] = useState<MapNode[][]>([]);
  const [future, setFuture] = useState<MapNode[][]>([]);
  const gesture = useRef<Gesture | null>(null);
  const lastEdit = useRef({ key: '', time: 0 });
  const fitted = useRef('');

  const setTool = (next: 'select' | 'add' | ((value: 'select' | 'add') => 'select' | 'add')) => { const value = typeof next === 'function' ? next(tool) : next; setToolState(value); if (value === 'add') setSelected(null); };
  const guard = async (work: () => Promise<void>) => { setProblem(''); try { await work(); } catch (error) { setProblem(error instanceof Error ? error.message : String(error)); } };
  const text = useMemo(() => map ? serializeMap(map) : '', [map]);
  const dirty = !!map && text !== saved;
  const worldH = map ? WORLD_W / map.aspect : 0;

  // Load the saved map (or an unsaved draft kept in the browser), and start a new one from the first image found.
  useEffect(() => {
    let cancelled = false;
    void guard(async () => {
      const [file, images] = await Promise.all([fs.readQuestMap(repo), fs.listQuestImages(repo)]);
      if (cancelled) return;
      let loaded = file ? parseMap(file) : null;
      setSaved(loaded ? serializeMap(loaded) : '');
      const draft = readDraft(scope);
      if (draft) { try { loaded = parseMap(draft); setStatus('Restored your unsaved changes.'); } catch { storeDraft(scope, null); } }
      if (!loaded && images.length) {
        const blob = await fs.readQuestImage(repo, images[0]);
        if (blob) { const dimensions = await imageSize(blob); loaded = emptyMap(images[0], dimensions.w / dimensions.h); }
      }
      if (!cancelled) setMap(loaded);
    });
    return () => { cancelled = true; };
  }, [repo, scope]);

  // The painted map.
  const imageName = map?.image ?? '';
  useEffect(() => {
    if (!imageName) { setImageUrl(''); setImageMissing(false); return; }
    let cancelled = false, made = '';
    void fs.readQuestImage(repo, imageName).then(blob => {
      if (cancelled) return;
      if (!blob) { setImageUrl(''); setImageMissing(true); return; }
      made = URL.createObjectURL(blob); setImageUrl(made); setImageMissing(false);
    });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [repo, imageName]);

  useEffect(() => { if (map) storeDraft(scope, dirty ? text : null); }, [dirty, text, scope, map]);

  // Keep the viewport size, and fit the whole map into view the first time it can be measured.
  useEffect(() => {
    if (!frame) return;
    const watch = new ResizeObserver(entries => { const box = entries[0].contentRect; setSize({ w: box.width, h: box.height }); });
    watch.observe(frame);
    return () => watch.disconnect();
  }, [frame]);
  const fitZoom = map && size.w ? Math.min(size.w / WORLD_W, size.h / worldH) * 0.97 : 0.3;
  const fit = useCallback(() => {
    if (!map || !size.w) return;
    const zoom = Math.min(size.w / WORLD_W, size.h / (WORLD_W / map.aspect)) * 0.97;
    setView({ zoom, x: (size.w - WORLD_W * zoom) / 2, y: (size.h - (WORLD_W / map.aspect) * zoom) / 2 });
  }, [map, size]);
  useEffect(() => {
    const id = map ? `${map.image}|${map.aspect}` : '';
    if (id && size.w > 0 && fitted.current !== id) { fitted.current = id; fit(); }
  }, [map, size, fit]);

  const zoomBy = useCallback((factor: number, around?: { x: number; y: number }) => {
    setView(current => {
      const zoom = clamp(current.zoom * factor, fitZoom * 0.5, MAX_ZOOM), k = zoom / current.zoom;
      const px = around?.x ?? size.w / 2, py = around?.y ?? size.h / 2;
      return { zoom, x: px - (px - current.x) * k, y: py - (py - current.y) * k };
    });
  }, [fitZoom, size]);
  useEffect(() => {
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = frame.getBoundingClientRect();
      zoomBy(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0016)), { x: event.clientX - box.left, y: event.clientY - box.top });
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [frame, zoomBy]);

  // Every change to the nodes goes through here, so it can be undone. Typing in a text field counts as one change.
  const edit = (change: (nodes: MapNode[]) => MapNode[], coalesce = '') => {
    if (!map) return;
    const now = Date.now();
    if (!(coalesce && lastEdit.current.key === coalesce && now - lastEdit.current.time < 1500)) { setPast(current => [...current.slice(-99), map.nodes]); setFuture([]); }
    lastEdit.current = { key: coalesce, time: now };
    setMap({ ...map, nodes: change(map.nodes) });
    setStatus('');
  };
  const undo = () => { if (!map || !past.length) return; setFuture(current => [map.nodes, ...current]); setMap({ ...map, nodes: past[past.length - 1] }); setPast(current => current.slice(0, -1)); lastEdit.current.key = ''; };
  const redo = () => { if (!map || !future.length) return; setPast(current => [...current, map.nodes]); setMap({ ...map, nodes: future[0] }); setFuture(current => current.slice(1)); lastEdit.current.key = ''; };
  const update = (id: string, change: Partial<MapNode>, coalesce = '') => edit(nodes => nodes.map(node => node.id === id ? { ...node, ...change } : node), coalesce && `${coalesce}:${id}`);
  const remove = (id: string) => { edit(nodes => nodes.filter(node => node.id !== id)); setSelected(null); };
  const setKind = (node: MapNode, kind: NodeKind) => edit(nodes => nodes.map(entry => {
    if (entry.id !== node.id || entry.kind === kind) return entry;
    const { site, start, target, ...rest } = entry; void site; void start; void target;
    return kind === 'permanent' ? { ...rest, kind, site: defaults.site } : { ...rest, kind };
  }));

  const toMap = (clientX: number, clientY: number) => {
    const box = frame!.getBoundingClientRect();
    return { x: clamp(((clientX - box.left - view.x) / view.zoom) / WORLD_W, 0, 1), y: clamp(((clientY - box.top - view.y) / view.zoom) / worldH, 0, 1) };
  };
  const nearest = (x: number, y: number) => {
    let best: MapNode | undefined, distance = Infinity;
    for (const node of map!.nodes) { const d = Math.hypot(node.x - x, (node.y - y) / map!.aspect); if (d < distance) { distance = d; best = node; } }
    return best;
  };
  const addAt = (x: number, y: number) => {
    if (!map) return;
    const affiliation = defaults.affiliation === 'nearest' ? nearest(x, y)?.affiliation ?? neutralAffiliation : defaults.affiliation;
    const node: MapNode = { id: nextId(map.nodes), x: Math.round(x * 1e5) / 1e5, y: Math.round(y * 1e5) / 1e5, kind: defaults.kind, affiliation, ...(defaults.kind === 'permanent' ? { site: defaults.site } : {}) };
    edit(nodes => [...nodes, node]);
  };

  const onBackgroundDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    frame!.setPointerCapture(event.pointerId);
    gesture.current = { kind: 'pan', sx: event.clientX, sy: event.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onNodeDown = (event: ReactPointerEvent, id: string) => {
    event.stopPropagation();
    if (event.button !== 0 || !map) return;
    frame!.setPointerCapture(event.pointerId);
    setToolState('select'); setSelected(id);
    gesture.current = { kind: 'node', id, sx: event.clientX, sy: event.clientY, moved: false, before: map.nodes };
  };
  const onMove = (event: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || !map) return;
    const far = Math.abs(event.clientX - g.sx) + Math.abs(event.clientY - g.sy) > 4;
    if (far) g.moved = true;
    if (!g.moved) return;
    if (g.kind === 'pan') setView(current => ({ ...current, x: g.vx + event.clientX - g.sx, y: g.vy + event.clientY - g.sy }));
    else { const at = toMap(event.clientX, event.clientY); setMap({ ...map, nodes: map.nodes.map(node => node.id === g.id ? { ...node, x: at.x, y: at.y } : node) }); }
  };
  const onUp = (event: ReactPointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !map) return;
    if (g.kind === 'node' && g.moved) { setPast(current => [...current.slice(-99), g.before]); setFuture([]); lastEdit.current.key = ''; }
    if (g.kind === 'pan' && !g.moved && event.type === 'pointerup') { if (tool === 'add') { const at = toMap(event.clientX, event.clientY); addAt(at.x, at.y); } else setSelected(null); }
  };

  const save = () => guard(async () => { if (!map) return; await fs.writeQuestMap(repo, text); setSaved(text); storeDraft(scope, null); setStatus('Saved assets/quest/map.json.'); });
  const chooseImage = (file: File | undefined) => file && guard(async () => {
    const dimensions = await imageSize(file);
    await fs.writeQuestImage(repo, file.name, file);
    setMap(current => current ? { ...current, image: file.name, aspect: dimensions.w / dimensions.h } : emptyMap(file.name, dimensions.w / dimensions.h));
    setStatus(`Copied ${file.name} into assets/quest. Nodes keep their place relative to the picture.`);
  });
  const setReachBy = (kind: ReachKind, value: number) => map && setMap({ ...map, settings: { ...map.settings, reachBy: { ...map.settings.reachBy, [kind]: value } } });
  const setting = (key: 'reveal' | 'discover' | 'borderReach', value: number) => map && setMap({ ...map, settings: { ...map.settings, [key]: value } });

  // Keyboard shortcuts, only while this tab is showing and no field has focus.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = event => {
    if ((event.target as HTMLElement).closest('input,select,textarea') || !map) return;
    const mod = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
    if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
    else if (mod && key === 'y') { event.preventDefault(); redo(); }
    else if (mod && key === 's') { event.preventDefault(); void save(); }
    else if (mod) return;
    else if (key === 'a') setTool(current => current === 'add' ? 'select' : 'add');
    else if (key === 'v' || key === 'escape') { if (tool === 'add') setTool('select'); else setSelected(null); }
    else if ((key === 'delete' || key === 'backspace') && selected) { event.preventDefault(); remove(selected); }
    else if (key === '+' || key === '=') zoomBy(1.25);
    else if (key === '-') zoomBy(0.8);
    else if (key === '0') fit();
    else if (selected && key.startsWith('arrow')) {
      event.preventDefault();
      const step = event.shiftKey ? 0.005 : 0.001, dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
      update(selected, { x: clamp((map.nodes.find(node => node.id === selected)?.x ?? 0) + dx, 0, 1), y: clamp((map.nodes.find(node => node.id === selected)?.y ?? 0) + dy * map.aspect, 0, 1) }, 'nudge');
    }
  };
  useEffect(() => {
    if (!active) return;
    const listener = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [active]);

  const geometry = useMemo(() => map && (overlay.territories || overlay.borders) ? territory(map) : { cells: [], borders: [] }, [map, overlay.territories, overlay.borders]);
  const issues = useMemo(() => map ? validateMap(map, factionIds, names) : { errors: [], warnings: [] }, [map]);
  const current = map?.nodes.find(node => node.id === selected);
  const rows = useMemo(() => affiliations.map(id => {
    const own = map?.nodes.filter(node => node.affiliation === id) ?? [];
    return { id, nodes: own.length, capital: own.some(node => node.site === 'capital'), starts: own.filter(node => node.start).length };
  }), [map]);

  if (!map) return <div className="map-editor map-empty" hidden={!active}>
    <div><h2>The quest map</h2>
      <p>Choose the painted map to place nodes on. It is copied into <code>assets/quest</code>, and the node positions are saved next to it as <code>map.json</code>.</p>
      <label className="map-file"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => chooseImage(event.target.files?.[0])}/><span className="primary">Choose map image</span></label>
      {status && <p role="status" className="studio-status">{status}</p>}
      {problem && <p role="alert" className="studio-problem">{problem}</p>}</div></div>;

  const unit = 1 / (WORLD_W * view.zoom); // One screen pixel, in the map's own units.
  const iso = (node: MapNode) => ({ x: node.x, y: node.y / map.aspect });
  const points = (polygon: [number, number][]) => polygon.map(([x, y]) => `${x},${y / map.aspect}`).join(' ');
  const set = (patch: Partial<Defaults>) => setDefaults(value => ({ ...value, ...patch }));
  const permanentCount = map.nodes.filter(node => node.kind === 'permanent').length;

  const rail = (label: string, glyph: string, run: () => void, options: { on?: boolean; off?: boolean; hint?: string } = {}) =>
    <button className={`rail-btn${options.on ? ' on' : ''}`} onClick={run} disabled={options.off} aria-label={label} aria-pressed={options.on} title={options.hint ?? label}><span aria-hidden>{glyph}</span><small>{label}</small></button>;

  return <div className="map-editor" hidden={!active}>
    <div ref={setFrame} className={`map-frame ${tool === 'add' ? 'adding' : ''}`} onPointerDown={onBackgroundDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="map-world" style={{ width: WORLD_W, height: worldH, transform: `translate(${view.x}px,${view.y}px) scale(${view.zoom})` }}>
        {imageUrl && <img src={imageUrl} alt="" draggable={false} width={WORLD_W} height={worldH}/>}
        <svg viewBox={`0 0 1 ${1 / map.aspect}`} width={WORLD_W} height={worldH}>
          {overlay.territories && geometry.cells.map(cell => <polygon key={cell.id} points={points(cell.polygon)} fill={colorOf(cell.affiliation)} fillOpacity={cell.affiliation === neutralAffiliation ? 0.07 : 0.2}/>)}
          {overlay.borders && <><path d={geometry.borders.map(border => `M${border.a[0]} ${border.a[1] / map.aspect}L${border.b[0]} ${border.b[1] / map.aspect}`).join('')} className="border-shade"/>
            <path d={geometry.borders.map(border => `M${border.a[0]} ${border.a[1] / map.aspect}L${border.b[0]} ${border.b[1] / map.aspect}`).join('')} className="border-line"/></>}
          {current && <g className="radii"><circle cx={iso(current).x} cy={iso(current).y} r={map.settings.discover} className="discover"/><circle cx={iso(current).x} cy={iso(current).y} r={map.settings.reveal} className="reveal"/><circle cx={iso(current).x} cy={iso(current).y} r={reachOf(current, map.settings)} className="reach"/></g>}
          {map.nodes.map(node => {
            const { x, y } = iso(node), color = colorOf(node.affiliation), site = node.site ? siteInfo[node.site] : undefined;
            const radius = node.site === 'capital' ? 19 : node.site === 'city' ? 16 : node.kind === 'permanent' ? 14 : 11;
            return <g key={node.id} transform={`translate(${x} ${y}) scale(${unit})`} className={`node ${node.id === selected ? 'on' : ''}`} onPointerDown={event => onNodeDown(event, node.id)}>
              <title>{node.name || (site ? site.name : 'Unknown place')} · {affiliationName(node.affiliation)}</title>
              <circle r={22} className="hit"/>
              {node.id === selected && <circle r={radius + 6} className="ring"/>}
              {node.site === 'capital' && <circle r={radius + 5} className="crown"/>}
              {node.kind === 'permanent'
                ? <><circle r={radius} fill={color} className="body"/><g className="site-ico" fill="currentColor" transform={`scale(${radius / 12 * 0.78})`}>{siteShape(node.site!)}</g></>
                : <><circle r={radius} className="body transient" stroke={color}/><text className="glyph transient" dy="0.36em" fill={color}>?</text></>}
              {node.start && <circle cx={radius} cy={-radius} r={4.5} className="flag start"/>}
              {node.target && <circle cx={radius} cy={-radius + (node.start ? 10 : 0)} r={4.5} className="flag target"/>}
              {overlay.labels && node.name && <text className="label" y={radius + 13}>{node.name}</text>}
            </g>;
          })}
        </svg>
      </div>
      {!imageUrl && <p className="map-banner">{imageMissing ? `The image ${map.image} is not in assets/quest. Choose it again in the inspector.` : 'Loading the map…'}</p>}
    </div>

    <nav className="map-float map-rail" aria-label="Map tools">
      {rail('Select', '↖', () => setTool('select'), { on: tool === 'select', hint: 'Select and move (V)' })}
      {rail('Add', '+', () => setTool('add'), { on: tool === 'add', hint: 'Add nodes (A)' })}
      <hr/>
      {rail('Undo', '↶', undo, { off: !past.length, hint: 'Undo (Ctrl/Cmd+Z)' })}
      {rail('Redo', '↷', redo, { off: !future.length, hint: 'Redo (Ctrl/Cmd+Shift+Z)' })}
      <hr/>
      {rail('Zoom in', '⊕', () => zoomBy(1.25), { hint: 'Zoom in (+)' })}
      {rail('Zoom out', '⊖', () => zoomBy(0.8), { hint: 'Zoom out (−)' })}
      {rail('Fit', '⛶', fit, { hint: 'Fit the whole map (0)' })}
      <hr/>
      {rail('Areas', '▦', () => setOverlay({ ...overlay, territories: !overlay.territories }), { on: overlay.territories, hint: 'Territory colours' })}
      {rail('Borders', '┅', () => setOverlay({ ...overlay, borders: !overlay.borders }), { on: overlay.borders, hint: 'Borders' })}
      {rail('Names', 'Aa', () => setOverlay({ ...overlay, labels: !overlay.labels }), { on: overlay.labels, hint: 'Node names' })}
      <hr/>
      <button className={`rail-btn save${dirty ? ' dirty' : ''}`} onClick={save} disabled={!dirty} title="Save map (Ctrl/Cmd+S)"><span aria-hidden>⤓</span><small>{dirty ? 'Save' : 'Saved'}</small></button>
    </nav>

    <p className="map-float map-hint" aria-hidden>{tool === 'add' ? 'Click the map to place a node. Esc to stop.' : 'Drag the map to pan, scroll to zoom. Press A to add nodes.'}</p>
    {(status || problem) && <p role={problem ? 'alert' : 'status'} className={`map-float map-toast${problem ? ' bad' : ''}`}>{problem || status}</p>}

    {!inspectorOpen && <button className="map-float map-reopen" onClick={() => setInspectorOpen(true)}>Inspector</button>}
    {inspectorOpen && <aside className="map-float map-panel" aria-label="Inspector">
      <header><h2>{current ? (current.name || (current.site ? siteInfo[current.site].name : 'Place')) : tool === 'add' ? 'New nodes' : 'Quest map'}</h2>
        <span className="count">{map.nodes.length} nodes</span>
        <button onClick={() => setInspectorOpen(false)} aria-label="Hide inspector" title="Hide inspector">×</button></header>
      <div className="map-scroll">
      {current && <section className="map-section" aria-label="Selected node">
        <label className="field"><span>Name</span><input value={current.name ?? ''} placeholder={current.kind === 'permanent' ? 'e.g. Morning Vale' : 'Not needed for "?" places'} onChange={event => update(current.id, { name: event.target.value || undefined }, 'name')}/></label>
        <div className="views" role="group" aria-label="Kind"><button className={current.kind === 'permanent' ? 'on' : ''} onClick={() => setKind(current, 'permanent')}>Permanent</button><button className={current.kind === 'transient' ? 'on' : ''} onClick={() => setKind(current, 'transient')}>Transient (?)</button></div>
        {current.kind === 'permanent' && <label className="field"><span>Site</span><select value={current.site} onChange={event => update(current.id, { site: event.target.value as PermanentSite })}>{permanentSites.map(site => <option key={site} value={site}>{siteInfo[site].name}: {siteInfo[site].note}</option>)}</select></label>}
        <label className="field"><span>Affiliation</span><select value={current.affiliation} onChange={event => update(current.id, { affiliation: event.target.value })}>{affiliations.map(id => <option key={id} value={id}>{affiliationName(id)}</option>)}</select></label>
        {current.kind === 'permanent' && <><label className="check"><input type="checkbox" checked={!!current.start} onChange={event => update(current.id, { start: event.target.checked || undefined })}/>A run of this faction can start here</label>
          <label className="check"><input type="checkbox" checked={!!current.target} onChange={event => update(current.id, { target: event.target.checked || undefined })}/>A daily quest can send the player here</label></>}
        <button className="danger" onClick={() => remove(current.id)}>Delete node <small>Del</small></button>
      </section>}

      {!current && <section className="map-section" aria-label="New nodes">
        <p className="studio-hint">{tool === 'add' ? 'Every click places a node with these settings.' : 'Select a node to edit it, or press A to add nodes.'}</p>
        <div className="views" role="group" aria-label="Kind of new node"><button className={defaults.kind === 'permanent' ? 'on' : ''} onClick={() => set({ kind: 'permanent' })}>Permanent</button><button className={defaults.kind === 'transient' ? 'on' : ''} onClick={() => set({ kind: 'transient' })}>Transient (?)</button></div>
        {defaults.kind === 'permanent' && <div className="site-grid" role="group" aria-label="Site">{permanentSites.map(site => <button key={site} className={defaults.site === site ? 'on' : ''} title={siteInfo[site].note} onClick={() => { set({ site }); setTool('add'); }}><SiteIcon site={site}/>{siteInfo[site].name}</button>)}</div>}
        <label className="field"><span>Affiliation</span><select value={defaults.affiliation} onChange={event => set({ affiliation: event.target.value })}><option value="nearest">Same as the nearest node</option>{affiliations.map(id => <option key={id} value={id}>{affiliationName(id)}</option>)}</select></label>
      </section>}

      <details className="map-section" open={issues.errors.length > 0}>
        <summary>Overview <small>{permanentCount} permanent, {map.nodes.length - permanentCount} transient{issues.errors.length ? `, ${issues.errors.length} errors` : issues.warnings.length ? `, ${issues.warnings.length} to do` : ''}</small></summary>
        <table className="map-table"><thead><tr><th>Affiliation</th><th>Nodes</th><th>Capital</th><th>Starts</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}><td><i className="dot" style={{ background: colorOf(row.id) }}/>{affiliationName(row.id).replace(' (wilderness)', '')}</td><td>{row.nodes}</td><td>{row.id === neutralAffiliation ? '' : row.capital ? '✓' : '–'}</td><td>{row.starts}</td></tr>)}</tbody></table>
        <ul className="studio-issues">{issues.errors.map(message => <li key={message} className="error">{message}</li>)}{issues.warnings.map(message => <li key={message}>{message}</li>)}</ul>
      </details>

      <details className="map-section">
        <summary>Distances <small>% of the map width</small></summary>
        {([['reveal', 'Reveal radius', 'What a visited node uncovers. Shown solid around the selected node; the dotted pale ring is its border reach.'], ['discover', 'Quest target found within', 'How close the player must get for a quest target to appear. Shown dashed.'], ['borderReach', 'Border reach', 'The base distance borders extend from a node. Each kind of place below multiplies it.']] as const).map(([key, label, hint]) =>
          <label className="field" key={key}><span>{label} <b>{(map.settings[key] * 100).toFixed(1)}%</b></span><input type="range" min={0.02} max={0.3} step={0.005} value={map.settings[key]} onChange={event => setting(key, Number(event.target.value))}/><small>{hint}</small></label>)}
        <h4>Border reach by place</h4>
        {([...permanentSites, 'transient'] as ReachKind[]).map(kind => <label className="reach-row" key={kind}>
          <span className="reach-name">{kind === 'transient' ? <b className="q">?</b> : <SiteIcon site={kind} size={16}/>}{kind === 'transient' ? 'Transient' : siteInfo[kind].name}</span>
          <input type="range" min={0.2} max={3} step={0.1} value={map.settings.reachBy[kind]} onChange={event => setReachBy(kind, Number(event.target.value))}/>
          <output>×{map.settings.reachBy[kind].toFixed(1)}</output></label>)}
      </details>

      <details className="map-section">
        <summary>Map image <small>{map.image}</small></summary>
        <label className="map-file"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => chooseImage(event.target.files?.[0])}/><span>Use a different image…</span></label>
      </details>
      </div>
    </aside>}
  </div>;
}
