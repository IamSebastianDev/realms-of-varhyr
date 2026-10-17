import { describe, expect, it } from 'vitest';
import type { CardDefinition } from '../packages/contracts/src';
import {
  abandon, act, baseDeck, canAdd, canTravel, dailyQuests, emptyMap, expire, finishFight, forfeitFight, generateWorld, isPlayable, leave, payout, playableFactions, questRules,
  skipOffer, startRun, takeCard, travel, type MapNode, type QuestContent, type QuestMap, type RunState,
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
const transient = (id: string, x: number, y: number, affiliation = 'neutral'): MapNode => ({ id, x, y, kind: 'transient', affiliation });
const map: QuestMap = {
  ...emptyMap('map.jpg', 1.5),
  settings: { ...emptyMap('map.jpg', 1.5).settings, reveal: 0.16, discover: 0.2 },
  nodes: [
    node('cap-c', 0.15, 0.5, 'crownlands', { site: 'capital', start: true }), node('city-c', 0.28, 0.42, 'crownlands'),
    node('cap-b', 0.85, 0.5, 'black-host', { site: 'capital', start: true }), node('ruin', 0.4, 0.65, 'neutral', { site: 'ruin' }), node('mark', 0.25, 0.6, 'neutral', { site: 'waymark' }),
    node('keep', 0.6, 0.3, 'black-host', { site: 'landmark', target: true }),
    ...Array.from({ length: 24 }, (_, i) => transient(`t${i}`, 0.1 + (i % 6) * 0.15, 0.2 + Math.floor(i / 6) * 0.2)),
  ],
};
const day = '2026-10-17';
const goodQuest = () => dailyQuests(map, content, day).find(quest => quest.pack === 'good')!;

function draft(state: RunState): RunState {
  while (state.stage === 'draft') state = takeCard(state, content, map, (state.offer as { cards: string[] }).cards[0]!);
  return state;
}
const newRun = (seed = 7) => draft(startRun({ map, content, quest: goodQuest(), faction: 'crownlands', now: 1_000, seed }));

describe('quest mode', () => {
  it('offers the same three quests all day, only with factions that can field a deck', () => {
    expect(playableFactions(content).sort()).toEqual(['black-host', 'crownlands']);
    expect(isPlayable(content, 'horde')).toBe(false);
    const quests = dailyQuests(map, content, day);
    expect(quests.map(quest => quest.pack)).toEqual(['good', 'evil']); // the neutral kind has no playable faction yet
    expect(dailyQuests(map, content, day)).toEqual(quests);
    expect(dailyQuests(map, content, '2026-10-18')).not.toEqual(quests);
    const [good] = quests;
    expect(good!.starts).toEqual({ crownlands: 'cap-c' });
    expect(good!.target).toBe('keep');
    // The hint area covers the target without being centred on it.
    const hintOff = Math.hypot(good!.hint.x - 0.6, (good!.hint.y - 0.3) / 1.5);
    expect(hintOff).toBeGreaterThan(0); expect(hintOff).toBeLessThan(good!.hint.r);
  });

  it('keeps every permanent place and rolls the transient ones from the day', () => {
    const quest = goodQuest(), world = generateWorld(map, quest, 'cap-c', day);
    expect(world['keep']).toBe('boss'); expect(world['cap-c']).toBe('capital'); expect(world['ruin']).toBe('ruin');
    const enabled = map.nodes.filter(entry => entry.kind === 'transient' && world[entry.id]);
    expect(enabled).toHaveLength(12);
    expect(enabled.some(entry => world[entry.id] === 'refuge')).toBe(true);
    expect(generateWorld(map, quest, 'cap-c', day)).toEqual(world);
  });

  it('builds a legal 15-card base and a legal 30-card deck from the draft', () => {
    const base = baseDeck(content, 'crownlands');
    expect(base).toHaveLength(15);
    expect(base.filter(id => content.cards[id]!.stats!.energyOutputs.length)).toHaveLength(questRules.baseProducers);
    const run = newRun();
    expect(run.stage).toBe('map'); expect(run.deck).toHaveLength(30);
    for (const id of run.deck) expect(run.deck.filter(other => other === id).length).toBeLessThanOrEqual(content.cards[id]!.legendary ? 1 : 3);
    expect(canAdd(content, run.deck, 'crownlands-big') || run.deck.includes('crownlands-big')).toBe(true);
    // Same inputs, same run; and the state survives being saved as JSON.
    expect(newRun()).toEqual(run);
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });

  it('plays a run: reveal, fight, spoils, shopping, the boss, and the payout', () => {
    let run = newRun();
    expect(run.revealed).toContain('city-c');
    expect(run.revealed).not.toContain('keep'); // the target stays hidden until you are close
    // Fight at the nearest fight node.
    const fightNode = run.revealed.find(id => run.world[id] === 'fight');
    if (fightNode) {
      run = travel(run, map, fightNode);
      run = act(run, content, map, { type: 'fight' });
      expect(run.fight!.enemy.deck.length).toBeGreaterThanOrEqual(30);
      run = finishFight(run, content, map, { won: true, life: 4 });
      expect(run.life).toBe(4); expect(run.gold).toBeGreaterThan(questRules.startGold);
      expect(run.visited).toContain(fightNode);
      expect(run.offer?.kind).toBe('pick');
      const before = run.deck.length;
      run = takeCard(run, content, map, (run.offer as { cards: string[] }).cards[0]!);
      expect(run.deck).toHaveLength(before + 1); expect(run.offer).toBeNull();
      run = leave(run, map);
    }
    // A city heals for gold and sells cards.
    run = travel(run, map, 'city-c');
    run = { ...run, life: 4, gold: 100 };
    run = act(run, content, map, { type: 'heal' });
    expect(run.life).toBe(10); expect(run.gold).toBe(100 - 6 * 6);
    run = act(run, content, map, { type: 'shop' });
    expect(run.offer!.kind).toBe('shop');
    const gold = run.gold; run = act(run, content, map, { type: 'buy', index: 0 });
    expect(run.gold).toBeLessThan(gold);
    run = skipOffer(run); run = leave(run, map);
    expect(run.visited).toContain('city-c');
    expect(canTravel(run, 'city-c')).toBe(false); // each place is used once
    // Walk until the boss shows up, then beat it.
    for (const stop of ['mark', 'ruin']) { if (canTravel(run, stop)) { run = travel(run, map, stop); run = leave(run, map); } }
    run = { ...run, position: 'city-c' };
    run = travel({ ...run, position: 'ruin', revealed: [...run.revealed, 'keep'], targetFound: true }, map, 'keep');
    run = act(run, content, map, { type: 'fight' });
    expect(run.fight!.enemy.name).toBe(run.quest.bossName);
    run = finishFight(run, content, map, { won: true, life: 3 });
    expect(run.stage).toBe('over'); expect(run.result).toBe('won');
    expect(payout(run)).toEqual({ crowns: questRules.rewardCrowns, packs: { good: questRules.rewardPacks } });
  });

  it('ends the run at 0 life, after 24 hours, or on quitting a fight, and pays nothing', () => {
    const run = newRun(), fightNode = run.revealed.find(id => run.world[id] === 'fight') ?? 'city-c';
    const started = act(travel({ ...run, world: { ...run.world, [fightNode]: 'fight' } }, map, fightNode), content, map, { type: 'fight' });
    const dead = finishFight(started, content, map, { won: false, life: 0 });
    expect(dead.stage).toBe('over'); expect(dead.result).toBe('dead'); expect(payout(dead)).toBeNull();
    expect(forfeitFight(started).result).toBe('dead');
    expect(expire(run, run.startedAt + 24 * 3_600_000 - 1).stage).toBe('map');
    const late = expire(run, run.startedAt + 24 * 3_600_000);
    expect(late.result).toBe('expired'); expect(payout(late)).toBeNull();
    expect(abandon(run).result).toBe('abandoned');
    expect(() => travel(dead, map, 'city-c')).toThrow();
  });
});
