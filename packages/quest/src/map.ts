/**
 * The quest map: where the nodes sit on the painted map, what they are, and whose land they are on.
 *
 * Coordinates are normalized: x runs 0..1 across the image width and y 0..1 down its height, so a new painting can replace the
 * old one without moving a node. Distances (reveal radius, border reach) are fractions of the image width. This file is pure data
 * and geometry: the studio edits it, the game will read it.
 */

export const permanentSites = ['city', 'village', 'shrine', 'ruin', 'waymark', 'arena', 'capital', 'landmark'] as const;
export type PermanentSite = (typeof permanentSites)[number];
export type NodeKind = 'permanent' | 'transient';
/** Neutral stands for the wilderness, the unclaimed land. */
export const neutralAffiliation = 'neutral';

export type MapNode = {
  id: string;
  x: number;
  y: number;
  /** Permanent sites show their icon once revealed and exist on every run. Transient ones show a question mark and roll their content per run. */
  kind: NodeKind;
  /** Only for permanent nodes. */
  site?: PermanentSite;
  /** A faction id, or 'neutral' for the wilderness. */
  affiliation: string;
  name?: string;
  /** A permanent site where a run of its affiliation can start. */
  start?: boolean;
  /** A permanent site that hosts a boss. */
  target?: boolean;
  /** How far this node projects its land, as a factor on what its kind projects. Absent means 1. */
  reach?: number;
};

/** Distances as fractions of the image width. */
/** What a node is, as far as border reach goes. */
export type ReachKind = PermanentSite | 'transient';
export const reachKinds: ReachKind[] = [...permanentSites, 'transient'];
/** `borderReach` is the base distance; each kind of node projects it times its own factor, so a capital claims more land than a waymark. */
/** `density` is travel locations per 10% of the map's area that the zones allow (the studio shows it as density % = density / 2, so 50% is 100 per 10%); `spacing` the room they keep from each other and from every node, as a fraction of the map width. */
export type MapSettings = { reveal: number; discover: number; borderReach: number; reachBy: Record<ReachKind, number>; density: number; spacing: number };
/**
 * Where generated places may stand, as layered zones in the same normalized coordinates as the nodes. A point takes the mode of the
 * smallest zone that contains it (ties go to the one drawn last), so a lake can be blocked inside allowed land and an island allowed again inside the lake. Ground no
 * zone covers is not allowed. Without any allowed zone, the game falls back to the land around the existing nodes.
 */
export type Polygon = [number, number][];
export type ZoneMode = 'allow' | 'block';
export type Zone = { mode: ZoneMode; polygon: Polygon };
export type Placement = { zones: Zone[] };
export type QuestMap = { version: 1; image: string; aspect: number; settings: MapSettings; nodes: MapNode[]; placement?: Placement };

export const defaultReachBy: Record<ReachKind, number> = { city: 1.5, village: 1, shrine: 1, ruin: 0.8, waymark: 0.8, arena: 1, capital: 2, landmark: 1.25, transient: 1 };
export const defaultSettings: MapSettings = { reveal: 0.09, discover: 0.14, borderReach: 0.07, reachBy: { ...defaultReachBy }, density: 3, spacing: 0.05 };
export const reachOf = (node: Pick<MapNode, 'kind' | 'site' | 'reach'>, settings: MapSettings, base: number = settings.borderReach) => base * (settings.reachBy[node.kind === 'permanent' && node.site ? node.site : 'transient'] ?? 1) * (node.reach ?? 1);
export const emptyMap = (image: string, aspect: number): QuestMap => ({ version: 1, image, aspect, settings: { ...defaultSettings, reachBy: { ...defaultReachBy } }, nodes: [] });

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const round = (value: number) => Math.round(value * 1e5) / 1e5;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The next free node id, so ids stay short and never repeat after deletions. */
export function nextId(nodes: readonly MapNode[]): string {
  let highest = 0;
  for (const node of nodes) { const found = /^n(\d+)$/.exec(node.id); if (found) highest = Math.max(highest, Number(found[1])); }
  return `n${highest + 1}`;
}

/** Reads a saved map (text or already parsed) and repairs what it can, so a hand-edited file never crashes the tool. */
export function parseMap(source: unknown): QuestMap {
  const raw = typeof source === 'string' ? JSON.parse(source) : source;
  if (!isRecord(raw)) throw new Error('The map file is not a JSON object.');
  if (raw.version !== 1) throw new Error(`Unsupported map version ${String(raw.version)}.`);
  const aspect = typeof raw.aspect === 'number' && raw.aspect > 0 ? raw.aspect : 1.5;
  const given = isRecord(raw.settings) ? raw.settings : {};
  const setting = (key: 'reveal' | 'discover' | 'borderReach') => clamp(typeof given[key] === 'number' ? given[key] as number : defaultSettings[key], 0.01, 0.5);
  const givenBy = isRecord(given.reachBy) ? given.reachBy : {};
  const reachBy = Object.fromEntries(reachKinds.map(kind => [kind, clamp(typeof givenBy[kind] === 'number' ? givenBy[kind] as number : defaultReachBy[kind], 0.2, 4)])) as Record<ReachKind, number>;
  const seen = new Set<string>();
  const nodes: MapNode[] = [];
  for (const entry of Array.isArray(raw.nodes) ? raw.nodes : []) {
    if (!isRecord(entry)) continue;
    // Travel locations are never placed by hand: they are made for each expedition inside the placement areas. Older files that placed some are read without them.
    if (entry.kind === 'transient') continue;
    const kind: NodeKind = 'permanent';
    let id = typeof entry.id === 'string' && entry.id ? entry.id : nextId(nodes);
    if (seen.has(id)) id = nextId([...nodes, { id } as MapNode]);
    seen.add(id);
    const node: MapNode = {
      id,
      x: round(clamp(Number(entry.x) || 0, 0, 1)),
      y: round(clamp(Number(entry.y) || 0, 0, 1)),
      kind,
      affiliation: typeof entry.affiliation === 'string' && entry.affiliation ? entry.affiliation : neutralAffiliation,
    };
    if (kind === 'permanent') {
      node.site = entry.site === 'market' ? 'village' : (permanentSites as readonly string[]).includes(entry.site as string) ? entry.site as PermanentSite : 'landmark';
      if (entry.start === true) node.start = true;
      if (entry.target === true) node.target = true;
    }
    if (typeof entry.name === 'string' && entry.name.trim()) node.name = entry.name.trim();
    if (typeof entry.reach === 'number' && Number.isFinite(entry.reach) && entry.reach !== 1) node.reach = round(clamp(entry.reach, 0.2, 4));
    nodes.push(node);
  }
  const map: QuestMap = { version: 1, image: typeof raw.image === 'string' ? raw.image : '', aspect, settings: { reveal: setting('reveal'), discover: setting('discover'), borderReach: setting('borderReach'), reachBy, density: clamp(typeof given.density === 'number' ? given.density : defaultSettings.density, 0, 200), spacing: clamp(typeof given.spacing === 'number' ? given.spacing : defaultSettings.spacing, 0.004, 0.2) }, nodes };
  const cleanPolygon = (value: unknown): Polygon => (Array.isArray(value) ? value : []).filter((point): point is [number, number] => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)).map(([x, y]) => [round(clamp(x, 0, 1)), round(clamp(y, 0, 1))] as [number, number]);
  const place = isRecord(raw.placement) ? raw.placement : {};
  // Older files had a plain list of allowed polygons.
  const given2: Zone[] = Array.isArray(place.zones)
    ? place.zones.flatMap(zone => isRecord(zone) ? [{ mode: zone.mode === 'block' ? 'block' as const : 'allow' as const, polygon: cleanPolygon(zone.polygon) }] : [])
    : Array.isArray(place.polygons) ? place.polygons.map(polygon => ({ mode: 'allow' as const, polygon: cleanPolygon(polygon) })) : [];
  const zones = given2.filter(zone => zone.polygon.length >= 3);
  if (zones.length) map.placement = { zones };
  return map;
}

/** Stable text for the file: one node per line, so a changed node is a one-line change in git. */
export function serializeMap(map: QuestMap): string {
  const head = JSON.stringify({ version: map.version, image: map.image, aspect: round(map.aspect), settings: map.settings, placement: map.placement?.zones.length ? map.placement : undefined }, null, 2);
  const line = (node: MapNode) => JSON.stringify({ id: node.id, x: round(node.x), y: round(node.y), kind: node.kind, site: node.site, affiliation: node.affiliation, name: node.name, start: node.start || undefined, target: node.target || undefined, reach: node.reach && node.reach !== 1 ? round(node.reach) : undefined });
  const nodes = map.nodes.length ? `[\n${map.nodes.map(node => `    ${line(node)}`).join(',\n')}\n  ]` : '[]';
  return `${head.replace(/\n}$/, '')},\n  "nodes": ${nodes}\n}\n`;
}

export type MapIssues = { errors: string[]; warnings: string[] };
/** What would make the map unusable (errors) or leave a hole in the game (warnings). */
export function validateMap(map: QuestMap, factionIds: readonly string[], names: Record<string, string> = {}): MapIssues {
  const errors: string[] = [], warnings: string[] = [];
  const known = new Set([...factionIds, neutralAffiliation]);
  const nameOf = (id: string) => names[id] ?? id;
  const ids = new Set<string>();
  for (const node of map.nodes) {
    if (ids.has(node.id)) errors.push(`Two nodes share the id ${node.id}.`);
    ids.add(node.id);
    if (!known.has(node.affiliation)) errors.push(`Node ${node.id} belongs to an unknown faction (${node.affiliation}).`);
    if (node.kind === 'permanent' && !node.site) errors.push(`Node ${node.id} is permanent but has no site type.`);
  }
  const minimum = 0.004;
  for (let i = 0; i < map.nodes.length; i++) for (let j = i + 1; j < map.nodes.length; j++) {
    const a = map.nodes[i], b = map.nodes[j];
    if (Math.hypot(a.x - b.x, (a.y - b.y) / map.aspect) < minimum) errors.push(`Nodes ${a.id} and ${b.id} sit on top of each other.`);
  }
  for (const id of [...factionIds, neutralAffiliation]) {
    const own = map.nodes.filter(node => node.affiliation === id);
    if (id !== neutralAffiliation) {
      const capitals = own.filter(node => node.site === 'capital').length;
      if (capitals === 0) warnings.push(`${nameOf(id)} has no capital.`);
      else if (capitals > 1) warnings.push(`${nameOf(id)} has ${capitals} capitals.`);
    }
    if (!own.some(node => node.start)) warnings.push(`${nameOf(id)} has no site where a run can start.`);
  }
  if (!map.nodes.some(node => node.target)) warnings.push('No site is flagged as a boss site.');
  return { errors, warnings };
}

type Vertex = { x: number; y: number; /** The neighbour across the edge that starts at this vertex; -1 for the outer rim. */ edge: number };

/** Keeps the part of a convex polygon where n·p ≤ c. The new edge along the cut is labelled with the neighbour that caused it. */
function clip(polygon: Vertex[], nx: number, ny: number, c: number, label: number): Vertex[] {
  const out: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const fa = nx * a.x + ny * a.y - c, fb = nx * b.x + ny * b.y - c;
    const aIn = fa <= 0, bIn = fb <= 0;
    if (aIn && bIn) out.push(a);
    else if (aIn) { const t = fa / (fa - fb); out.push(a, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, edge: label }); }
    else if (bIn) { const t = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, edge: a.edge }); }
  }
  return out;
}

export type Cell = { id: string; affiliation: string; polygon: [number, number][] };
export type Border = { a: [number, number]; b: [number, number]; between: [string, string] };

/**
 * Splits the map between the nodes (each point belongs to its nearest node) and returns the cells plus the borders where two
 * different factions meet. Cells reach out only `reach` from their node, so a border never runs far out over open sea.
 * Neutral is open land: it gets a cell but no border line. Every node counts, enabled or not, so the geography never changes between runs.
 */
export function territory(map: QuestMap, reach: number = map.settings.borderReach): { cells: Cell[]; borders: Border[] } {
  const cells: Cell[] = [], borders: Border[] = [];
  // Work in units of the image width, so distances are round.
  const px = map.nodes.map(node => node.x), py = map.nodes.map(node => node.y / map.aspect);
  const back = (x: number, y: number): [number, number] => [x, y * map.aspect];
  const sides = 24;
  const radius = map.nodes.map(node => reachOf(node, map.settings, reach));
  for (let i = 0; i < map.nodes.length; i++) {
    let polygon: Vertex[] = [];
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2, rim = radius[i] / Math.cos(Math.PI / sides);
      polygon.push({ x: px[i] + Math.cos(angle) * rim, y: py[i] + Math.sin(angle) * rim, edge: -1 });
    }
    for (let j = 0; j < map.nodes.length && polygon.length >= 3; j++) {
      if (j === i) continue;
      const dx = px[j] - px[i], dy = py[j] - py[i];
      // The dividing line is where both nodes are equally far "past" their own reach (a power diagram), so a far-reaching node claims more of the gap.
      const gap = Math.hypot(dx, dy), shift = (radius[j] ** 2 - radius[i] ** 2);
      if (gap > 0 && (gap * gap - shift) / (2 * gap) > radius[i] * 1.02) continue; // That line lies beyond the rim.
      polygon = clip(polygon, dx, dy, (px[j] ** 2 + py[j] ** 2 - px[i] ** 2 - py[i] ** 2 - shift) / 2, j);
    }
    if (polygon.length < 3) continue;
    const node = map.nodes[i];
    cells.push({ id: node.id, affiliation: node.affiliation, polygon: polygon.map(vertex => back(vertex.x, vertex.y)) });
    polygon.forEach((vertex, index) => {
      const other = vertex.edge;
      // Each shared edge is reported once; both sides are equally far from their nodes there, so the reach limit agrees.
      if (other <= i || map.nodes[other].affiliation === node.affiliation) return;
      if (node.affiliation === neutralAffiliation || map.nodes[other].affiliation === neutralAffiliation) return;
      const next = polygon[(index + 1) % polygon.length];
      borders.push({ a: back(vertex.x, vertex.y), b: back(next.x, next.y), between: [node.affiliation, map.nodes[other].affiliation] });
    });
  }
  return { cells, borders };
}

const inside = (polygon: readonly [number, number][], x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!, [xj, yj] = polygon[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
/** Whether any zone allows placement at all. */
export const hasPlacement = (map: QuestMap) => !!map.placement?.zones.some(zone => zone.mode === 'allow');
/** The mode of the last zone containing the point; `otherwise` where none does. */
const areaCache = new WeakMap<Polygon, number>();
function areaOf(polygon: Polygon): number {
  let area = areaCache.get(polygon);
  if (area === undefined) {
    area = 0;
    for (let i = 0; i < polygon.length; i++) { const [x1, y1] = polygon[i]!, [x2, y2] = polygon[(i + 1) % polygon.length]!; area += x1 * y2 - x2 * y1; }
    area = Math.abs(area) / 2;
    areaCache.set(polygon, area);
  }
  return area;
}
export function placementAllows(map: QuestMap, x: number, y: number, otherwise = false): boolean {
  let allowed = otherwise, size = Infinity;
  for (const zone of map.placement?.zones ?? []) {
    if (!inside(zone.polygon, x, y)) continue;
    const area = areaOf(zone.polygon);
    if (area <= size) { size = area; allowed = zone.mode === 'allow'; } // The smallest zone around a point decides, so an island beats its lake and the lake beats the land, in whatever order they were drawn; equal zones go to the later one.
  }
  return allowed;
}
/** The share of the map image that the zones allow, 0 to 1. Measured on a grid, so it is stable for a given map. */
const shareCache = new WeakMap<Placement, number>();
export function allowedShare(map: QuestMap, steps = 96): number {
  if (!map.placement || !hasPlacement(map)) return 0;
  const cached = shareCache.get(map.placement);
  if (cached !== undefined) return cached;
  let hit = 0;
  for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) if (placementAllows(map, (i + 0.5) / steps, (j + 0.5) / steps)) hit++;
  const share = hit / (steps * steps);
  shareCache.set(map.placement, share);
  return share;
}
/** How many travel locations an expedition gets on this map. */
export const placeCount = (map: QuestMap) => Math.min(2000, Math.round(allowedShare(map) * 10 * map.settings.density));
/** Whether a generated place may stand here. With allowed zones, only where they say so; without any, within `reach` of an existing node, which keeps places on the land the map already uses, but never inside a blocked zone. */
export function validPlacement(map: QuestMap, nodes: readonly Pick<MapNode, 'x' | 'y'>[], x: number, y: number, spacing: number, reach: number): boolean {
  if (x < 0.01 || x > 0.99 || y < 0.01 || y > 0.99) return false;
  const gap = (node: Pick<MapNode, 'x' | 'y'>) => Math.hypot(node.x - x, (node.y - y) / map.aspect);
  if (nodes.some(node => gap(node) < spacing)) return false;
  if (hasPlacement(map)) return placementAllows(map, x, y);
  if (!placementAllows(map, x, y, true)) return false;
  return nodes.some(node => gap(node) <= reach);
}

/** Separate stretches of allowed ground (the mainland, an island in a lake, ...), each as the centres of its grid cells and its share of the map. Cached per placement. */
export type Region = { cells: [number, number][]; share: number; has: (x: number, y: number) => boolean };
const regionCache = new WeakMap<Placement, Region[]>();
export function allowedRegions(map: QuestMap, steps = 128): Region[] {
  if (!map.placement || !hasPlacement(map)) return [];
  const cached = regionCache.get(map.placement);
  if (cached) return cached;
  const open = new Uint8Array(steps * steps), seen = new Uint8Array(steps * steps), regions: Region[] = [];
  for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) open[j * steps + i] = placementAllows(map, (i + 0.5) / steps, (j + 0.5) / steps) ? 1 : 0;
  for (let start = 0; start < open.length; start++) {
    if (!open[start] || seen[start]) continue;
    const stack = [start], cells: [number, number][] = [], members = new Set<number>([start]);
    seen[start] = 1;
    while (stack.length) {
      const at = stack.pop()!, i = at % steps, j = (at - i) / steps;
      cells.push([(i + 0.5) / steps, (j + 0.5) / steps]);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= steps || nj >= steps) continue;
        const next = nj * steps + ni;
        if (open[next] && !seen[next]) { seen[next] = 1; stack.push(next); members.add(next); }
      }
    }
    if (cells.length >= 4) regions.push({ cells, share: cells.length / (steps * steps), has: (x, y) => members.has(Math.min(steps - 1, Math.floor(y * steps)) * steps + Math.min(steps - 1, Math.floor(x * steps))) });
  }
  regionCache.set(map.placement, regions);
  return regions;
}
