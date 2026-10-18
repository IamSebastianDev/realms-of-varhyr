import { describe, expect, it } from 'vitest';
import { describeResult } from '../apps/web/src/quest/results';
import type { CardDefinition } from '../packages/contracts/src';
import {
  affiliationAt, allowedShare, generatedPlaces, placeCount, placementAllows, reachOf, serializeMap,
  act, actionsFor, baseDeck, canAdd, canTravel, emptyMap, finishFight, generateWorld, isPlayable, leave, loadRun, parseMap, playableFactions, questRules, retire,
  skipOffer, smithValue, startRun, takeCard, travel, validPlacement, type MapNode, type QuestContent, type QuestMap, type RunState,
} from '../packages/quest/src';

const card = (id: string, faction: string | null, rarity: CardDefinition['rarity'], producer: boolean, legendary = false): CardDefinition => ({
  id, revision: 1, name: id, deckLimitKey: id, type: 'creature', factions: faction ? [faction] : [], subtypes: [], legendary: legendary || rarity === 'legendary', rarity,
  cost: { generic: 1, factions: {} }, art: '', abilities: [], stats: { attack: 1, defense: 1, energyOutputs: producer ? [{ [faction ?? 'neutral']: 1 }] : [] },
});
// Two playable factions with plenty of cards, and one that is too thin to field a deck.
const factionCards = (faction: string) => [
  ...Array.from({ length: 6 }, (_, i) => card(`${faction}-p${i}`, faction, 'common', true)),
  ...Array.from({ length: 6 }, (_, i) => card(`${faction}-c${i}`, faction, i < 5 ? 'common' : 'rare', false)),
  card(`${faction}-big`, faction, 'legendary', false),
];
const cards = [...factionCards('crownlands'), ...factionCards('black-host'), card('horde-one', 'horde', 'common', true), ...Array.from({ length: 5 }, (_, i) => card(`wild-${i}`, null, 'common', i < 2))];
const content: QuestContent = {
  cards: Object.fromEntries(cards.map(entry => [entry.id, entry])),
  packs: [
    { id: 'good', name: 'Good', factions: ['crownlands', 'bright-marches', 'winter-league'] },
    { id: 'neutral', name: 'Neutral', factions: ['mountain-clans', 'conclave', 'neutral'] },
    { id: 'evil', name: 'Evil', factions: ['black-host', 'horde', 'ember-fields'] },
  ],
  factionNames: { crownlands: 'the Crownlands', 'black-host': 'the Black Host' },
};
const node = (id: string, x: number, y: number, affiliation: string, extra: Partial<MapNode> = {}): MapNode => ({ id, x, y, kind: 'permanent', site: 'city', affiliation, ...extra });
const map: QuestMap = {
  ...emptyMap('map.jpg', 1.5),
  settings: { ...emptyMap('map.jpg', 1.5).settings, reveal: 0.16, discover: 0.2 },
  nodes: [
    node('cap-c', 0.15, 0.5, 'crownlands', { site: 'capital', start: true }), node('city-c', 0.28, 0.42, 'crownlands'),
    node('cap-b', 0.85, 0.5, 'black-host', { site: 'capital', start: true }), node('village', 0.34, 0.52, 'crownlands', { site: 'village' }), node('ruin', 0.4, 0.65, 'neutral', { site: 'ruin' }), node('mark', 0.25, 0.6, 'neutral', { site: 'waymark' }),
    node('keep', 0.6, 0.3, 'black-host', { site: 'landmark', target: true }),
  ],
  placement: { zones: [{ mode: 'allow', polygon: [[0.05, 0.1], [0.95, 0.1], [0.95, 0.9], [0.05, 0.9]] }] },
};
const newRun = (seed = 7) => {
  let state = startRun({ map, content, pack: 'good', faction: 'crownlands', now: 1_000, seed });
  while (state.stage === 'draft') state = takeCard(state, content, map, (state.offer as { cards: string[] }).cards[0]!);
  return state;
};
/** Walks to a place and opens it, the way the map does. */
const visit = (run: RunState, id: string) => travel({ ...run, revealed: [...new Set([...run.revealed, id])], offer: null }, map, id, content);
const unknownNodes = (run: RunState) => run.extra.filter(entry => run.world[entry.id] === 'unknown');

describe('expeditions', () => {
  it('starts free, drafts a legal 30-card deck, and replays exactly from its seed and save', () => {
    expect(playableFactions(content).sort()).toEqual(['black-host', 'crownlands']);
    expect(isPlayable(content, 'horde')).toBe(false);
    const base = baseDeck(content, 'crownlands');
    expect(base).toHaveLength(15);
    expect(base.filter(id => content.cards[id]!.stats!.energyOutputs.length)).toHaveLength(questRules.baseProducers);
    const run = newRun();
    expect(run.stage).toBe('map'); expect(run.deck).toHaveLength(30); expect(run.silver).toBe(questRules.startSilver);
    for (const id of run.deck) expect(run.deck.filter(other => other === id).length).toBeLessThanOrEqual(content.cards[id]!.legendary ? 1 : 3);
    expect(canAdd(content, run.deck, 'crownlands-big') || run.deck.includes('crownlands-big')).toBe(true);
    expect(newRun()).toEqual(run);
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
    expect(run.revealed).toContain('city-c');
  });

  it('keeps fixed places and settles each travel location once, on the first visit', () => {
    const world = generateWorld(map, 'cap-c', 7);
    expect(world['keep']).toBe('boss'); expect(world['village']).toBe('village'); expect(world['cap-c']).toBe('capital');
    const open = generatedPlaces(map, 7).filter(entry => world[entry.id]);
    expect(open.length).toBe(placeCount(map)); expect(open.length).toBeGreaterThan(5);
    expect(open.some(entry => world[entry.id] === 'camp')).toBe(true);
    expect(generateWorld(map, 'cap-c', 7)).toEqual(world);

    let run = newRun();
    const seen = new Set<string>(), finds: Record<string, unknown> = {};
    for (const entry of unknownNodes(run)) {
      const arrived = visit(run, entry.id), role = arrived.world[entry.id]!;
      expect(['encounter', 'camp', 'merchant', 'cache']).toContain(role); seen.add(role);
      if (role === 'cache') finds[entry.id] = arrived.caches[entry.id];
      // Leaving, reloading and coming back cannot reroll it.
      const saved = JSON.parse(JSON.stringify(arrived)) as RunState;
      expect(saved.world[entry.id]).toBe(role);
      expect(visit(newRun(), entry.id).world[entry.id]).toBe(role);
    }
    expect(seen.size).toBeGreaterThan(2);
    for (const [id, find] of Object.entries(finds)) expect(visit(newRun(), id).caches[id]).toEqual(find);
  });

  it('plays an expedition: fight, spoils, city and camp care, a smith, and merchants', () => {
    let run = newRun();
    const fightNode = unknownNodes(run).map(entry => entry.id).find(id => { const arrived = visit(run, id); return arrived.world[id] === 'encounter'; });
    if (fightNode) {
      run = act(visit(run, fightNode), content, map, { type: 'fight' });
      expect(run.fight!.enemy.deck.length).toBeGreaterThanOrEqual(30);
      run = finishFight(run, content, map, { won: true, life: 4 });
      expect(run.life).toBe(4); expect(run.silver).toBeGreaterThan(questRules.startSilver); expect(run.visited).toContain(fightNode);
      run = takeCard(run, content, map, (run.offer as { cards: string[] }).cards[0]!);
      run = leave(run, map);
    }
    // A city heals for silver and sells cards; its smith pays half the keep price, and never below 30 cards.
    run = { ...visit(run, 'city-c'), life: 4, silver: 100 };
    expect(actionsFor('city')).toEqual(['heal', 'shop', 'rumors', 'smith']);
    run = act(run, content, map, { type: 'heal' });
    expect(run.life).toBe(10); expect(run.silver).toBe(100 - 6 * 6);
    run = act(run, content, map, { type: 'shop' });
    const silver = run.silver, size = run.deck.length; run = act(run, content, map, { type: 'buy', index: 0 });
    expect(run.silver).toBeLessThan(silver); expect(run.deck).toHaveLength(size + 1);
    run = skipOffer(run);
    const target = run.deck[0]!, value = smithValue(content, target), before = run.silver;
    run = act(run, content, map, { type: 'smith', index: 0 });
    expect(run.silver).toBe(before + value);
    while (run.deck.length > 30) run = act(run, content, map, { type: 'smith', index: 0 });
    expect(run.deck).toHaveLength(30);
    expect(() => act(run, content, map, { type: 'smith', index: 0 })).toThrow(/30/);
    run = leave(run, map);
    expect(canTravel(run, 'city-c')).toBe(true); // a used city can be visited again
    // A village has rumors and a smith, but no healing and no market.
    expect(actionsFor('village')).toEqual(['rumors', 'smith']);
    expect(() => act(visit(run, 'village'), content, map, { type: 'heal' })).toThrow();
  });

  it('turns an accepted rumor into a saved destination that pays once and does not end the run', () => {
    let run = visit(newRun(), 'village');
    run = act(run, content, map, { type: 'rumors' });
    const offered = run.rumors['village']!;
    expect(offered).toHaveLength(questRules.rumorsPerSettlement);
    // Asking again shows the same rumors.
    expect(act(visit(newRun(), 'village'), content, map, { type: 'rumors' }).rumors['village']).toEqual(offered);
    run = act(run, content, map, { type: 'accept', rumor: offered[0]!.id });
    expect(() => act(run, content, map, { type: 'accept', rumor: offered[0]!.id })).toThrow();
    const quest = run.quests[0]!, place = run.extra.find(entry => entry.id === quest.destination)!;
    expect(quest.destination).toBe(place.id); expect(run.revealed).toContain(place.id); expect(run.world[place.id]).toBe('encounter');
    const origin = map.nodes.find(entry => entry.id === 'village')!, away = Math.hypot(place.x - origin.x, (place.y - origin.y) / map.aspect);
    expect(away).toBeGreaterThanOrEqual(questRules.questDistance.min - 1e-6); expect(away).toBeLessThanOrEqual(questRules.questDistance.max + 1e-6);
    run = skipOffer(run); run = leave(run, map);
    // Clearing the destination pays its advertised reward automatically, once.
    run = act(travel({ ...run, revealed: [...run.revealed, place.id] }, map, place.id, content), content, map, { type: 'fight' });
    run = finishFight(run, content, map, { won: true, life: 5 });
    expect(run.quests[0]!.status).toBe('done'); expect(run.stage).toBe('map');
    expect(run.earned).toHaveLength(1);
    expect(run.earned[0]!.packs).toEqual(quest.reward.packs ? { [quest.pack]: quest.reward.packs } : {});
    // A reload that replays the same finish cannot pay again.
    expect(JSON.parse(JSON.stringify(run)).earned).toHaveLength(1);
  });

  it('keeps generated places on valid land, clear of other nodes', () => {
    const painted: QuestMap = { ...map, placement: { zones: [{ mode: 'allow', polygon: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.45], [0.1, 0.45]] }] } };
    expect(validPlacement(painted, painted.nodes, 0.3, 0.3123, 0.02, 0.14)).toBe(true);
    expect(validPlacement(painted, painted.nodes, 0.7, 0.3, 0.02, 0.14)).toBe(false);
    expect(validPlacement(map, map.nodes, 0.15, 0.5, 0.02, 0.14)).toBe(false); // on top of the capital
    expect(parseMap(JSON.parse(JSON.stringify(painted))).placement).toEqual(painted.placement);
    expect(parseMap({ version: 1, nodes: [{ id: 'a', x: 0.5, y: 0.5, kind: 'permanent', site: 'market' }] }).nodes[0]!.site).toBe('village');
  });

  it('lets a boss fall without ending the run, then ends on death or retirement, and settles old saves', () => {
    let run = visit(newRun(), 'keep');
    run = act(run, content, map, { type: 'fight' });
    expect(run.fight!.enemy.life).toBeGreaterThan(questRules.maxLife);
    run = finishFight(run, content, map, { won: true, life: 3 });
    expect(run.stage).toBe('map'); expect(run.earned.map(entry => entry.id)).toEqual(['boss:keep']);
    expect(retire(run).result).toBe('retired');
    const fighting = act(visit(newRun(), 'city-c'), content, map, { type: 'shop' });
    expect(() => travel(fighting, map, 'ruin', content)).toThrow();
    const started = act(visit(newRun(), 'keep'), content, map, { type: 'fight' });
    const dead = finishFight(started, content, map, { won: false, life: 0 });
    expect(dead.stage).toBe('over'); expect(dead.result).toBe('dead'); expect(dead.earned).toEqual([]);
    expect(() => travel(dead, map, 'city-c', content)).toThrow();
    // A save from the daily mode is not carried over: that run just ends.
    expect(loadRun({ ...JSON.parse(JSON.stringify(run)), version: 1, gold: 44, world: { 'city-c': 'market' } })).toBeNull();
    expect(loadRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
    expect(loadRun(null)).toBeNull();
  });

  it('makes travel locations inside the placement areas, owned by whoever projects land over them', () => {
    const land: QuestMap = { ...map, placement: { zones: [{ mode: 'allow', polygon: [[0.05, 0.1], [0.95, 0.1], [0.95, 0.9], [0.05, 0.9]] }] } };
    const made = generatedPlaces(land, 7);
    expect(made.length).toBeGreaterThan(5);
    expect(generatedPlaces(land, 7)).toEqual(made);
    expect(generatedPlaces(land, 8)).not.toEqual(made);
    for (const place of made) {
      expect(validPlacement(land, land.nodes, place.x, place.y, 0, Infinity)).toBe(true);
      expect(place.affiliation).toBe(affiliationAt(land, place));
    }
    expect(generatedPlaces({ ...map, placement: undefined }, 7)).toEqual([]); // No areas, nothing generated.
    const run = startRun({ map: land, content, pack: 'good', faction: 'crownlands', now: 1, seed: 7 });
    expect(run.extra).toEqual(made);
    expect(made.every(place => ['unknown', 'camp'].includes(run.world[place.id]!))).toBe(true);
  });

  it('lets each node project its own area, and gives unclaimed ground to nobody', () => {
    const a = { ...map, nodes: [node('a', 0.4, 0.5, 'crownlands'), node('b', 0.6, 0.5, 'black-host')] };
    const point = { x: 0.5, y: 0.5 };
    const base = affiliationAt(a, point);
    const strong = { ...a, nodes: [a.nodes[0]!, { ...a.nodes[1]!, reach: 3 }] };
    expect(affiliationAt(strong, point)).toBe('black-host');
    expect(reachOf({ ...a.nodes[0]!, reach: 2 }, a.settings)).toBeCloseTo(reachOf(a.nodes[0]!, a.settings) * 2);
    expect(affiliationAt(a, { x: 0.5, y: 0.02 })).toBe('neutral');
    expect(['crownlands', 'black-host']).toContain(base);
    const parsed = parseMap(serializeMap(strong));
    expect(parsed.nodes[1]!.reach).toBe(3);
    expect(parsed.nodes[0]!.reach).toBeUndefined();
  });

  it('layers allow and block zones: a lake in the land, an island in the lake', () => {
    const land = [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]] as [number, number][];
    const lake = [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]] as [number, number][];
    const island = [[0.45, 0.45], [0.55, 0.45], [0.55, 0.55], [0.45, 0.55]] as [number, number][];
    const layered: QuestMap = { ...emptyMap('m.jpg', 1), nodes: [], placement: { zones: [{ mode: 'allow', polygon: land }, { mode: 'block', polygon: lake }, { mode: 'allow', polygon: island }] } };
    const ok = (x: number, y: number) => validPlacement(layered, [], x, y, 0, 0);
    expect(ok(0.1, 0.1)).toBe(true); expect(ok(0.4, 0.4)).toBe(false); expect(ok(0.5, 0.5)).toBe(true); expect(ok(0.99, 0.5)).toBe(false);
    // The smallest zone around a point wins, so drawing order does not matter.
    const swapped: QuestMap = { ...layered, placement: { zones: [layered.placement!.zones[0]!, layered.placement!.zones[2]!, layered.placement!.zones[1]!] } };
    expect(validPlacement(swapped, [], 0.5, 0.5, 0, 0)).toBe(true);
    expect(validPlacement(swapped, [], 0.4, 0.4, 0, 0)).toBe(false);
    const reloaded = parseMap(JSON.parse(serializeMap(layered)));
    expect(reloaded.placement).toEqual(layered.placement);
    for (const place of generatedPlaces({ ...layered, aspect: 1 }, 3)) expect(placementAllows(layered, place.x, place.y)).toBe(true);
    // Older files with plain polygons read as allowed zones.
    expect(parseMap({ version: 1, image: 'x', aspect: 1, nodes: [], placement: { polygons: [land] } }).placement).toEqual({ zones: [{ mode: 'allow', polygon: land }] });
    // Blocked zones alone still keep generated task places out when there is no allowed zone.
    const blockOnly: QuestMap = { ...emptyMap('m.jpg', 1), nodes: [{ id: 'a', x: 0.5, y: 0.5, kind: 'permanent', site: 'city', affiliation: 'neutral' }], placement: { zones: [{ mode: 'block', polygon: lake }] } };
    expect(validPlacement(blockOnly, blockOnly.nodes, 0.4, 0.5, 0.01, 0.2)).toBe(false);
    expect(validPlacement(blockOnly, blockOnly.nodes, 0.25, 0.5, 0.01, 0.3)).toBe(true);
  });

  it('fills the allowed zones by density: more ground and a higher setting give more places, spacing is kept', () => {
    const half: QuestMap = { ...map, nodes: [], placement: { zones: [{ mode: 'allow', polygon: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]] }] } };
    expect(allowedShare(half)).toBeCloseTo(0.5, 1);
    expect(placeCount(half)).toBe(Math.round(0.5 * 10 * half.settings.density));
    const denser: QuestMap = { ...half, settings: { ...half.settings, density: half.settings.density * 2 } };
    expect(placeCount(denser)).toBe(2 * placeCount(half));
    const made = generatedPlaces(denser, 5);
    expect(made.length).toBe(placeCount(denser));
    for (let i = 0; i < made.length; i++) for (let j = i + 1; j < made.length; j++)
      expect(Math.hypot(made[i]!.x - made[j]!.x, (made[i]!.y - made[j]!.y) / denser.aspect)).toBeGreaterThanOrEqual(denser.settings.spacing);
    expect(placeCount({ ...half, settings: { ...half.settings, density: 0 } })).toBe(0);
    expect(placeCount({ ...half, placement: undefined })).toBe(0);
    expect(parseMap(JSON.parse(serializeMap(denser))).settings.density).toBe(denser.settings.density);
  });

  it('spreads places evenly rather than in clumps, and copes with very high densities', () => {
    const open: QuestMap = { ...emptyMap('m.jpg', 1), nodes: [], placement: { zones: [{ mode: 'allow', polygon: [[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98]] }] } };
    const even: QuestMap = { ...open, settings: { ...open.settings, density: 4.5, spacing: 0.01 } }; // about 40 places
    for (const seed of [1, 2, 3, 4, 5]) {
      const made = generatedPlaces(even, seed);
      expect(made.length).toBe(placeCount(even));
      let tightest = Infinity;
      for (let i = 0; i < made.length; i++) for (let j = i + 1; j < made.length; j++) tightest = Math.min(tightest, Math.hypot(made[i]!.x - made[j]!.x, made[i]!.y - made[j]!.y));
      expect(tightest).toBeGreaterThan(0.05); // plain random placement clumps well below this
    }
    const packed: QuestMap = { ...open, settings: { ...open.settings, density: 100, spacing: 0.03 } };
    const many = generatedPlaces(packed, 9);
    expect(many.length).toBeGreaterThan(300); expect(many.length).toBeLessThanOrEqual(placeCount(packed));
  });

  it('describes what a search, a heal and a waymark gave, so the panel can show it', () => {
    const land: QuestMap = { ...map, placement: { zones: [{ mode: 'allow', polygon: [[0.05, 0.1], [0.95, 0.1], [0.95, 0.9], [0.05, 0.9]] }] } };
    const start = startRun({ map: land, content, pack: 'good', faction: 'crownlands', now: 1, seed: 7 });
    let run = start; while (run.stage === 'draft') run = takeCard(run, content, land, (run.offer as { cards: string[] }).cards[0]!);
    const spot = run.extra[0]!.id;
    const at = (role: 'cache', find: { kind: 'silver'; amount: number } | { kind: 'life'; amount: number } | { kind: 'nothing' }) => {
      const staged: RunState = { ...run, world: { ...run.world, [spot]: role }, caches: { [spot]: find }, life: 3, revealed: [spot] };
      return travel(staged, land, spot, content);
    };
    for (const find of [{ kind: 'silver', amount: 9 }, { kind: 'life', amount: 1 }, { kind: 'nothing' }] as const) {
      const here = at('cache', find), after = act(here, content, land, { type: 'search' });
      const result = describeResult(here, after, { type: 'search' })!;
      expect(result.node).toBe(spot);
      expect(result.kind).toBe(find.kind);
      if (find.kind === 'silver') expect(result.silver).toBe(9);
      if (find.kind === 'life') expect(result.life).toBe(1);
    }
    const camp = travel({ ...run, world: { ...run.world, [spot]: 'camp' }, life: 2, silver: 40, revealed: [spot] }, land, spot, content);
    const healed = act(camp, content, land, { type: 'heal' }), result = describeResult(camp, healed, { type: 'heal' })!;
    expect(result.life).toBeGreaterThan(0); expect(result.silver).toBeLessThan(0);
    expect(describeResult(camp, healed, { type: 'shop' })).toBeNull();
  });

  it('lets you walk back to a used place, which stays used up, and remembers the route', () => {
    const run = newRun();
    const first = visit(run, 'village');
    expect(first.route.slice(-2)).toEqual([run.position, 'village']);
    const cleared = leave({ ...first, encounter: { ...first.encounter!, used: ['rumors'] } }, map);
    expect(cleared.visited).toContain('village');
    const back = visit(cleared, 'village'); // used to be refused
    expect(back.encounter?.node).toBe('village'); expect(back.route.at(-1)).toBe('village');
    const ruin = visit(back, 'ruin');
    const searched = leave(act(ruin, content, map, { type: 'search' }), map);
    expect(searched.visited).toContain('ruin');
    expect(() => act(visit(searched, 'ruin'), content, map, { type: 'search' })).toThrow('Already done');
    let walked = run; for (let i = 0; i < 60; i++) walked = visit(leave(walked, map), i % 2 ? 'village' : 'ruin');
    expect(walked.route.length).toBeLessThanOrEqual(40);
  });

  it('treats boss flags as candidates: the seed picks a few, the rest stay normal places, the start never holds one', () => {
    const flagged: QuestMap = { ...map, nodes: map.nodes.map(entry => entry.site === 'city' || entry.site === 'ruin' || entry.site === 'village' || entry.id === 'keep' || entry.id === 'cap-b' ? { ...entry, target: true } : entry) };
    const candidates = flagged.nodes.filter(entry => entry.target);
    expect(candidates.length).toBeGreaterThan(questRules.bossCount);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const world = generateWorld(flagged, 'cap-c', seed);
      const bosses = candidates.filter(entry => world[entry.id] === 'boss');
      expect(bosses).toHaveLength(questRules.bossCount);
      for (const entry of candidates.filter(other => !bosses.includes(other))) expect(world[entry.id]).toBe(entry.site ?? 'landmark');
      expect(world['cap-c']).toBe('capital');
      bosses.forEach(entry => seen.add(entry.id));
      expect(generateWorld(flagged, 'cap-c', seed)).toEqual(world);
    }
    expect(seen.size).toBe(candidates.length); // every candidate comes up for some seed
  });
  it('raises a new boss at another candidate whenever one falls, so the road never runs out of them', () => {
    const flagged: QuestMap = { ...map, nodes: map.nodes.map(entry => entry.site === 'city' || entry.site === 'ruin' || entry.site === 'village' || entry.id === 'keep' || entry.id === 'cap-b' ? { ...entry, target: true } : entry) };
    const base = newRun(), world = generateWorld(flagged, base.position, base.seed);
    let run: RunState = { ...base, world };
    for (let round = 0; round < 6; round++) {
      const boss = Object.keys(run.world).find(id => run.world[id] === 'boss')!;
      const bosses = Object.keys(run.world).filter(id => run.world[id] === 'boss');
      run = act({ ...travel({ ...run, revealed: [...new Set([...run.revealed, boss])], offer: null }, flagged, boss, content), }, content, flagged, { type: 'fight' });
      run = finishFight(run, content, flagged, { won: true, life: 5 });
      const after = Object.keys(run.world).filter(id => run.world[id] === 'boss');
      expect(after).toHaveLength(bosses.length);
      expect(run.world[boss]).not.toBe('boss');
      expect(run.risen).not.toBeNull(); expect(run.risen).not.toBe(boss); expect(after).toContain(run.risen);
      expect(run.visited).not.toContain(run.risen); expect(run.revealed).toContain(run.risen);
      run = leave(run, flagged);
    }
    expect(loadRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
  });
});
