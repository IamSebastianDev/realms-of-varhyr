import type { MapNode, PermanentSite, QuestMap } from './map';
import { neutralAffiliation } from './map';
import type { QuestContent } from './content';
import { enemyDeck as buildEnemyDeck, playableFactions } from './deck';
import { hashString, makeRng, type Rng } from './rng';
import { questRules } from './rules';

/** What a switched-on node does for the player. The map decides where things are; the role decides what happens there. */
export type Role = PermanentSite | 'fight' | 'refuge' | 'cache' | 'trader' | 'boss';
export type World = Record<string, Role>;
export type Hint = { x: number; y: number; r: number };
/** One daily quest: kill the boss at the target, and nothing else is required. */
export type Quest = {
  id: string; day: string;
  /** The booster alignment, which is also the quest's kind and decides the three factions on offer. */
  pack: string; packName: string; factions: string[];
  target: string; bossName: string; bossFaction: string;
  hint: Hint;
  /** The node each faction's run starts on. */
  starts: Record<string, string>;
};

export const distance = (map: QuestMap, a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, (a.y - b.y) / map.aspect);
const byId = (map: QuestMap) => new Map(map.nodes.map(node => [node.id, node]));

const bossNames: Record<string, string[]> = {
  crownlands: ['The Iron Chancellor', 'Warden of the Crown Road', 'The Grey Marshal'],
  'bright-marches': ['The Hearthlord of Ashvale', 'Warden of the Border Lights', 'The Marsh Sheriff'],
  'black-host': ['The Gravecaller', 'Lich of the Western Plague', 'The Pale Abbot'],
  'mountain-clans': ['The Stone Thane', 'Warlord of the High Pass', 'The Hammer-King'],
  conclave: ['The Veiled Archivist', 'Warden of the Sealed Library', 'The Hollow Magister'],
  horde: ['The Red Khan', 'Breaker of Gates', 'The Skull-Chanter'],
  'ember-fields': ['The Cinder Queen', 'Warden of the Burning Fields', 'The Ash-Lord'],
  'winter-league': ['The Frost Syndic', 'Warden of the Ice Ledger', 'The Pale Admiral'],
  neutral: ['The Wandering Tyrant', 'The Hermit of the Wastes', 'The Unclaimed King'],
};
export const pickBossName = (faction: string, rng: Rng) => rng.pick(bossNames[faction] ?? bossNames.neutral!);

/** Start sites the node tool flagged for a faction; failing that its capital, then anything it owns, then anything at all. */
export function startCandidates(map: QuestMap, faction: string): MapNode[] {
  const owned = map.nodes.filter(node => node.affiliation === faction);
  const flagged = owned.filter(node => node.start);
  if (flagged.length) return flagged;
  const capital = owned.filter(node => node.site === 'capital');
  if (capital.length) return capital;
  const permanent = owned.filter(node => node.kind === 'permanent');
  return permanent.length ? permanent : owned;
}
/** Where quests can send the player: flagged targets, then landmarks, then any permanent place. */
export function targetCandidates(map: QuestMap): MapNode[] {
  const permanent = map.nodes.filter(node => node.kind === 'permanent');
  for (const pool of [permanent.filter(node => node.target), permanent.filter(node => node.site === 'landmark'), permanent.filter(node => node.site === 'capital'), permanent]) if (pool.length) return pool;
  return [];
}

/** The day's three quests, one per alignment. The same day always gives the same quests, so everyone shares them. */
export function dailyQuests(map: QuestMap, content: QuestContent, day: string): Quest[] {
  const playable = new Set(playableFactions(content)), lookup = byId(map), taken = new Set<string>();
  const quests: Quest[] = [];
  for (const pack of content.packs) {
    const rng = makeRng(`${day}|${pack.id}`);
    const factions = pack.factions.filter(faction => playable.has(faction));
    const starts: Record<string, string> = {};
    for (const faction of factions) { const options = startCandidates(map, faction); if (options.length) starts[faction] = makeRng(`${day}|start|${faction}`).pick(options).id; }
    if (!Object.keys(starts).length) continue;
    const startNodes = Object.values(starts).map(id => lookup.get(id)!);
    // Far from every start, and a different place from the other quests when there are enough.
    const all = targetCandidates(map);
    const far = all.filter(node => startNodes.every(start => distance(map, node, start) >= questRules.minQuestDistance));
    const pool = [far, all].flatMap(list => list.filter(node => !taken.has(node.id))).filter((node, index, list) => list.indexOf(node) === index);
    const target = rng.pick(pool.length ? pool : all);
    if (!target) continue;
    taken.add(target.id);
    // The boss belongs to whoever owns the ground; wilderness bosses come from a random playable faction.
    const owners = [...playable].filter(faction => faction === target.affiliation);
    const foreign = [...playable].filter(faction => !pack.factions.includes(faction));
    const bossFaction = owners[0] ?? rng.pick(foreign.length ? foreign : [...playable]);
    const radius = map.settings.discover * questRules.hintRadius, angle = rng.next() * Math.PI * 2;
    const offset = radius * (questRules.hintOffset[0] + rng.next() * (questRules.hintOffset[1] - questRules.hintOffset[0]));
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    quests.push({
      id: `${day}|${pack.id}`, day, pack: pack.id, packName: pack.name, factions: pack.factions, target: target.id,
      bossName: pickBossName(bossFaction, rng), bossFaction,
      hint: { x: clamp(target.x + Math.cos(angle) * offset), y: clamp(target.y + Math.sin(angle) * offset * map.aspect), r: radius },
      starts,
    });
  }
  return quests;
}

/** Switches nodes on for a run. Permanent places are always there; the transient positions are rolled from the day's seed. */
export function generateWorld(map: QuestMap, quest: Quest, startId: string, day: string): World {
  const rng = makeRng(hashString(`${day}|world`));
  const world: World = {}, start = byId(map).get(startId);
  const transient = map.nodes.filter(node => node.kind === 'transient');
  for (const node of map.nodes) if (node.kind === 'permanent') world[node.id] = node.id === quest.target ? 'boss' : node.site ?? 'landmark';
  const roll = () => rng.weighted(Object.keys(questRules.transientRoll) as (keyof typeof questRules.transientRoll)[], role => questRules.transientRoll[role]);
  for (const node of rng.shuffle(transient).slice(0, Math.round(transient.length * questRules.transientShare))) world[node.id] = roll();
  // Somewhere to rest near the start, whatever the roll said.
  if (start) {
    const near = transient.filter(node => { const d = distance(map, node, start); return d >= questRules.startRefuge.min && d <= questRules.startRefuge.max; });
    if (near.length && !near.some(node => world[node.id] === 'refuge')) world[rng.pick(near).id] = 'refuge';
  }
  return world;
}

export { neutralAffiliation };
export const bossDeck = (content: QuestContent, faction: string, seed: number) => buildEnemyDeck(content, faction, makeRng(seed));
