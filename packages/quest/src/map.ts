/**
 * The quest map: where the nodes sit on the painted map, what they are, and whose land they are on.
 *
 * Coordinates are normalized: x runs 0..1 across the image width and y 0..1 down its height, so a new painting can replace the
 * old one without moving a node. Distances (reveal radius, border reach) are fractions of the image width. This file is pure data
 * and geometry: the studio edits it, the game will read it.
 */

export const permanentSites = ['city', 'market', 'shrine', 'ruin', 'waymark', 'arena', 'capital', 'landmark'] as const;
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
  /** A permanent site that a daily quest can send the player to. */
  target?: boolean;
};

/** Distances as fractions of the image width. */
/** What a node is, as far as border reach goes. */
export type ReachKind = PermanentSite | 'transient';
export const reachKinds: ReachKind[] = [...permanentSites, 'transient'];
/** `borderReach` is the base distance; each kind of node projects it times its own factor, so a capital claims more land than a waymark. */
export type MapSettings = { reveal: number; discover: number; borderReach: number; reachBy: Record<ReachKind, number> };
export type QuestMap = { version: 1; image: string; aspect: number; settings: MapSettings; nodes: MapNode[] };

export const defaultReachBy: Record<ReachKind, number> = { city: 1.5, market: 1, shrine: 1, ruin: 0.8, waymark: 0.8, arena: 1, capital: 2, landmark: 1.25, transient: 1 };
export const defaultSettings: MapSettings = { reveal: 0.09, discover: 0.14, borderReach: 0.07, reachBy: { ...defaultReachBy } };
export const reachOf = (node: Pick<MapNode, 'kind' | 'site'>, settings: MapSettings, base: number = settings.borderReach) => base * (settings.reachBy[node.kind === 'permanent' && node.site ? node.site : 'transient'] ?? 1);
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
    const kind: NodeKind = entry.kind === 'permanent' ? 'permanent' : 'transient';
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
      node.site = (permanentSites as readonly string[]).includes(entry.site as string) ? entry.site as PermanentSite : 'landmark';
      if (entry.start === true) node.start = true;
      if (entry.target === true) node.target = true;
    }
    if (typeof entry.name === 'string' && entry.name.trim()) node.name = entry.name.trim();
    nodes.push(node);
  }
  return { version: 1, image: typeof raw.image === 'string' ? raw.image : '', aspect, settings: { reveal: setting('reveal'), discover: setting('discover'), borderReach: setting('borderReach'), reachBy }, nodes };
}

/** Stable text for the file: one node per line, so a changed node is a one-line change in git. */
export function serializeMap(map: QuestMap): string {
  const head = JSON.stringify({ version: map.version, image: map.image, aspect: round(map.aspect), settings: map.settings }, null, 2);
  const line = (node: MapNode) => JSON.stringify({ id: node.id, x: round(node.x), y: round(node.y), kind: node.kind, site: node.site, affiliation: node.affiliation, name: node.name, start: node.start || undefined, target: node.target || undefined });
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
  if (!map.nodes.some(node => node.target)) warnings.push('No site is flagged as a quest target.');
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
