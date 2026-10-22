import type { MapNode, PermanentSite, QuestMap } from "./map";
import {
  allowedRegions,
  hasPlacement,
  neutralAffiliation,
  placeCount,
  reachOf,
  validPlacement,
} from "./map";
import { hashString, makeRng, type Rng } from "./rng";
import { questRules } from "./rules";

/** What a switched-on node does for the player. The map decides where things are; the role decides what happens there. */
export const travelRoles = ["encounter", "camp", "merchant", "cache"] as const;
export type TravelRole = (typeof travelRoles)[number];
/** `unknown` is a travel location nobody has visited yet: its type is rolled on the first visit and then saved. */
export type Role = PermanentSite | "boss" | "unknown" | TravelRole;
export type World = Record<string, Role>;
export type CacheFind =
  | { kind: "life"; amount: number }
  | { kind: "silver"; amount: number }
  | { kind: "nothing" };

export const distance = (map: QuestMap, a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, (a.y - b.y) / map.aspect);
/** Every node of the expedition: the painted map plus the places that accepted quests added. */
export const allNodes = (map: QuestMap, extra: readonly MapNode[]): MapNode[] =>
  extra.length ? [...map.nodes, ...extra] : map.nodes;

/** Start sites the node tool flagged for a faction; failing that its capital, then anything it owns, then anything at all. */
export function startCandidates(map: QuestMap, faction: string): MapNode[] {
  const owned = map.nodes.filter((node) => node.affiliation === faction);
  const flagged = owned.filter((node) => node.start);
  if (flagged.length) return flagged;
  const capital = owned.filter((node) => node.site === "capital");
  if (capital.length) return capital;
  const permanent = owned.filter((node) => node.kind === "permanent");
  return permanent.length ? permanent : owned;
}
/** The start of a faction's expedition, picked from the seed so the same seed gives the same start. */
export const pickStart = (map: QuestMap, faction: string, seed: number): MapNode | undefined => {
  const options = startCandidates(map, faction);
  return options.length ? makeRng(hashString(`${seed}|start|${faction}`)).pick(options) : undefined;
};

/** Switches nodes on for an expedition. Every hand-placed node is always there; the travel locations are made from the seed inside the placement areas and keep their positions. */
export function generateWorld(map: QuestMap, startId: string | undefined, seed: number): World {
  const rng = makeRng(hashString(`${seed}|world`));
  const world: World = {},
    start = map.nodes.find((node) => node.id === startId);
  const transient = generatedPlaces(map, seed);
  // Boss sites are candidates. The seed picks which of them hold a boss this time; the start is never one, and the others stay cities, ruins and so on.
  const bosses = new Set(
    makeRng(hashString(`${seed}|bosses`))
      .shuffle(map.nodes.filter((node) => node.target && node.id !== startId))
      .slice(0, questRules.bossCount)
      .map((node) => node.id),
  );
  for (const node of map.nodes)
    world[node.id] = bosses.has(node.id) ? "boss" : (node.site ?? "landmark");
  for (const node of transient) world[node.id] = "unknown";
  // Somewhere to heal near the start, whatever the later roll would say.
  if (start) {
    const near = transient.filter((node) => {
      const d = distance(map, node, start);
      return d >= questRules.startCamp.min && d <= questRules.startCamp.max;
    });
    if (near.length && !near.some((node) => world[node.id] === "camp"))
      world[rng.pick(near).id] = "camp";
  }
  return world;
}

/** What an unvisited travel location turns out to be. Same seed and node, same answer, so a reload cannot reroll it. */
export function resolveRole(seed: number, nodeId: string): TravelRole {
  const rng = makeRng(hashString(`${seed}|place|${nodeId}`));
  return rng.weighted(travelRoles, (role) => questRules.transientRoll[role]);
}
export function rollCache(seed: number, nodeId: string): CacheFind {
  const rng = makeRng(hashString(`${seed}|cache|${nodeId}`));
  const kind = rng.weighted(
    Object.keys(questRules.cacheRoll) as (keyof typeof questRules.cacheRoll)[],
    (key) => questRules.cacheRoll[key],
  );
  if (kind === "life") return { kind, amount: questRules.cacheLife };
  if (kind === "silver")
    return { kind, amount: rng.range(questRules.cacheSilver[0], questRules.cacheSilver[1]) };
  return { kind: "nothing" };
}

/**
 * Generated places belong to whoever projects land over them. This is the same power diagram the studio draws as territories: each node
 * claims the ground nearest to it in proportion to its reach, and ground nobody reaches is neutral wilderness.
 */
export function affiliationAt(map: QuestMap, point: { x: number; y: number }): string {
  let best: MapNode | undefined,
    score = Infinity,
    radius = 0;
  for (const node of map.nodes) {
    const r = reachOf(node, map.settings),
      d = distance(map, node, point),
      power = d * d - r * r;
    if (power < score) {
      score = power;
      best = node;
      radius = r;
    }
  }
  return best && distance(map, best, point) <= radius ? best.affiliation : neutralAffiliation;
}

/** Travel locations made for this expedition inside the placement areas. Same seed, same places, so a reload cannot move them. */
export function generatedPlaces(map: QuestMap, seed: number): MapNode[] {
  if (!hasPlacement(map)) return [];
  const allowed = map.placement!.zones.filter((zone) => zone.mode === "allow");
  const xs = allowed.flatMap((zone) => zone.polygon.map((point) => point[0])),
    ys = allowed.flatMap((zone) => zone.polygon.map((point) => point[1]));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const rng = makeRng(hashString(`${seed}|places`)),
    made: MapNode[] = [],
    target = placeCount(map);
  // Best-candidate sampling: of a few random spots take the one farthest from everything placed so far, so places spread evenly instead of clumping.
  const gap = (x: number, y: number) => {
    let nearest = Infinity;
    for (const node of map.nodes)
      nearest = Math.min(nearest, Math.hypot(node.x - x, (node.y - y) / map.aspect));
    for (const node of made)
      nearest = Math.min(nearest, Math.hypot(node.x - x, (node.y - y) / map.aspect));
    return nearest;
  };
  let misses = 0;
  while (made.length < target && misses < 60) {
    let best: { x: number; y: number; room: number } | undefined;
    for (let k = 0; k < 12; k++) {
      const x = x0 + rng.next() * (x1 - x0),
        y = y0 + rng.next() * (y1 - y0);
      if (!validPlacement(map, [], x, y, 0, Infinity)) continue;
      const room = gap(x, y);
      if (room >= map.settings.spacing && (!best || room > best.room)) best = { x, y, room };
    }
    if (!best) {
      misses++;
      continue;
    }
    misses = 0;
    const x = Math.round(best.x * 1e5) / 1e5,
      y = Math.round(best.y * 1e5) / 1e5;
    made.push({
      id: `g${made.length + 1}`,
      x,
      y,
      kind: "transient",
      affiliation: affiliationAt(map, { x, y }),
    });
  }
  // Every stretch of allowed ground gets its fair share, however small: an island in a lake is rarely hit by chance, so top each region up to its expected count (at least one).
  const cell = 1 / 128;
  const regions = allowedRegions(map);
  for (const region of regions) {
    let have = made.filter((place) => region.has(place.x, place.y)).length;
    const want = Math.max(1, Math.round(region.share * 10 * map.settings.density));
    for (
      let tries = 0, limit = 20 * Math.max(0, want - have);
      have < want && tries < limit;
      tries++
    ) {
      let best: { x: number; y: number; room: number } | undefined;
      for (let k = 0; k < 8; k++) {
        const [cx, cy] = region.cells[Math.floor(rng.next() * region.cells.length)]!;
        const x = cx + (rng.next() - 0.5) * cell,
          y = cy + (rng.next() - 0.5) * cell;
        if (!validPlacement(map, [], x, y, 0, Infinity)) continue;
        const room = gap(x, y);
        if (room >= map.settings.spacing && (!best || room > best.room)) best = { x, y, room };
      }
      if (!best) continue;
      const x = Math.round(best.x * 1e5) / 1e5,
        y = Math.round(best.y * 1e5) / 1e5;
      made.push({
        id: `g${made.length + 1}`,
        x,
        y,
        kind: "transient",
        affiliation: affiliationAt(map, { x, y }),
      });
      have++;
    }
  }
  // The top-up may overshoot the count by a place or two; give those back from the biggest region, which can spare them.
  const biggest = regions.reduce<(typeof regions)[number] | undefined>(
    (best, region) => (!best || region.share > best.share ? region : best),
    undefined,
  );
  while (biggest && made.length > target) {
    let drop = -1;
    for (let k = made.length - 1; k >= 0 && drop < 0; k--)
      if (biggest.has(made[k]!.x, made[k]!.y)) drop = k;
    if (drop < 0) break;
    made.splice(drop, 1);
  }
  made.forEach((place, index) => {
    place.id = `g${index + 1}`;
  });
  return made;
}

/** The kinds of task a rumor can describe. Rewards are rolled per rumor around these bases. */
export type QuestTemplate = {
  id: string;
  title: string;
  text: string;
  enemy: string;
  packs: number;
  silver: number;
};
export const questTemplates: readonly QuestTemplate[] = [
  {
    id: "bandits",
    title: "Bandits on the road",
    text: "Bandits have taken the road nearby and the locals pay in fear.",
    enemy: "Bandits",
    packs: 2,
    silver: 0,
  },
  {
    id: "raiders",
    title: "Raiders at the ford",
    text: "A raiding band camps at a ford and burns whatever it cannot carry.",
    enemy: "Raiders",
    packs: 1,
    silver: 30,
  },
  {
    id: "deserters",
    title: "Deserters in the hills",
    text: "Deserters hold a hill and have sworn to no one.",
    enemy: "Deserters",
    packs: 1,
    silver: 20,
  },
];
export const templateOf = (id: string) =>
  questTemplates.find((template) => template.id === id) ?? questTemplates[0]!;

/**
 * Finds a place for a quest destination within quest distance of its origin, on valid land and clear of other nodes.
 * Returns null when nothing fits, so the rumor is simply not offered.
 */
export function placeDestination(
  map: QuestMap,
  extra: readonly MapNode[],
  origin: MapNode,
  rng: Rng,
): { x: number; y: number } | null {
  const nodes = allNodes(map, extra);
  for (let attempt = 0; attempt < 80; attempt++) {
    const radius =
        questRules.questDistance.min +
        rng.next() * (questRules.questDistance.max - questRules.questDistance.min),
      angle = rng.next() * Math.PI * 2;
    const x = origin.x + Math.cos(angle) * radius,
      y = origin.y + Math.sin(angle) * radius * map.aspect;
    if (validPlacement(map, nodes, x, y, questRules.placementSpacing, questRules.placementReach))
      return { x: Math.round(x * 1e5) / 1e5, y: Math.round(y * 1e5) / 1e5 };
  }
  return null;
}

const bossNames: Record<string, string[]> = {
  crownlands: ["The Iron Chancellor", "Warden of the Crown Road", "The Grey Marshal"],
  "bright-marches": [
    "The Hearthlord of Ashvale",
    "Warden of the Border Lights",
    "The Marsh Sheriff",
  ],
  "black-host": ["The Gravecaller", "Lich of the Western Plague", "The Pale Abbot"],
  "mountain-clans": ["The Stone Thane", "Warlord of the High Pass", "The Hammer-King"],
  conclave: ["The Veiled Archivist", "Warden of the Sealed Library", "The Hollow Magister"],
  horde: ["The Red Khan", "Breaker of Gates", "The Skull-Chanter"],
  "ember-fields": ["The Cinder Queen", "Warden of the Burning Fields", "The Ash-Lord"],
  "winter-league": ["The Frost Syndic", "Warden of the Ice Ledger", "The Pale Admiral"],
  neutral: ["The Wandering Tyrant", "The Hermit of the Wastes", "The Unclaimed King"],
};
/** A boss belongs to whoever owns the ground; the name is fixed by the seed and the place. */
export const bossName = (faction: string, seed: number, nodeId: string) =>
  makeRng(hashString(`${seed}|boss|${nodeId}`)).pick(bossNames[faction] ?? bossNames.neutral!);
