import type { QuestContent } from './content';
import { baseDeck, candidates, canAdd, enemyDeck, offerPack, playableFactions } from './deck';
import { questRules } from './rules';
import { makeRng, hashString, type Rng } from './rng';
import type { QuestMap } from './map';
import { distance, generateWorld, pickBossName, type Quest, type Role, type World } from './world';

export type Enemy = { name: string; faction: string; deck: string[]; life: number };
export type Pick = { kind: 'pick'; title: string; size: number; pick: number; cards: string[]; source: 'draft' | 'reward' | 'exchange' | 'found'; taken: string[] };
export type Shop = { kind: 'shop'; premium: boolean; items: { card: string; price: number; sold: boolean }[] };
export type Offer = Pick | Shop;
/** A rumor's promise: win the fight at this node and also get this. */
export type Bounty = { gold: number } | { extraPick: true } | { card: string };
export type Encounter = { node: string; role: Role; /** Actions already used here, so each can happen once. */ used: string[] };
export type Fight = { node: string; enemy: Enemy; seed: number };
export type Stage = 'draft' | 'map' | 'over';
export type Result = 'won' | 'dead' | 'expired' | 'abandoned';

/** Everything about a run in plain data, saved between nodes. */
export type RunState = {
  version: 1; id: string; day: string; pack: string; faction: string;
  /** Seeds this run's rewards; the day's map comes from the day alone. */
  seed: number; step: number; startedAt: number;
  stage: Stage; result: Result | null;
  deck: string[]; life: number; gold: number; drafted: number;
  position: string; visited: string[];
  /** Nodes drawn on the map, rebuilt from where the player has been. */
  revealed: string[];
  /** Waymarks read so far; each lights up a wider circle. */
  beacons: string[];
  world: World; quest: Quest; targetFound: boolean;
  offer: Offer | null; encounter: Encounter | null; fight: Fight | null;
  bounties: Record<string, Bounty>;
  stats: { fights: number; goldEarned: number };
  /** What the win paid out, recorded once so the end screen stays the same after a reload. */
  reward?: { crowns: number; packs: number } | 'claimed';
};

export type StartInput = { map: QuestMap; content: QuestContent; quest: Quest; faction: string; now: number; seed: number };

const rngFor = (state: RunState) => makeRng(hashString(`${state.seed}|${state.step}`));
const next = (state: RunState, change: Partial<RunState>): RunState => ({ ...state, ...change, step: state.step + 1 });
const between = (rng: Rng, range: readonly [number, number]) => rng.range(range[0], range[1]);
const lookup = (map: QuestMap) => new Map(map.nodes.map(node => [node.id, node]));

export function startRun({ map, content, quest, faction, now, seed }: StartInput): RunState {
  const start = quest.starts[faction];
  if (!start) throw new Error('This faction has no start site on the map.');
  const world = generateWorld(map, quest, start, quest.day);
  const deck = baseDeck(content, faction);
  const state: RunState = {
    version: 1, id: `${quest.id}|${faction}|${seed}`, day: quest.day, pack: quest.pack, faction, seed, step: 0, startedAt: now,
    stage: 'draft', result: null, deck, life: questRules.maxLife, gold: questRules.startGold, drafted: 0,
    position: start, visited: [], revealed: [], beacons: [], world, quest, targetFound: false,
    offer: null, encounter: null, fight: null, bounties: {}, stats: { fights: 0, goldEarned: 0 },
  };
  return draftOffer(state, content);
}

function draftOffer(state: RunState, content: QuestContent): RunState {
  const cards = offerPack(content, state.faction, state.deck, rngFor(state), questRules.packSize);
  if (!cards.length) return finishDraft(state);
  return next(state, { offer: { kind: 'pick', title: 'Draft', size: questRules.packSize, pick: 1, cards, source: 'draft', taken: [] } });
}
function finishDraft(state: RunState): RunState {
  return next(state, { stage: 'map', offer: null });
}

/** Which nodes are drawn: everything within reach of where the player has been, except the hidden target. */
export function reveal(state: RunState, map: QuestMap): string[] {
  const nodes = lookup(map), reveal = map.settings.reveal;
  const sources = [state.quest.starts[state.faction], state.position, ...state.visited].filter((id, index, all) => id && all.indexOf(id) === index).map(id => nodes.get(id!)).filter(Boolean) as { x: number; y: number }[];
  const wide = state.beacons.map(id => nodes.get(id)).filter(Boolean) as { x: number; y: number }[];
  const shown = new Set<string>();
  for (const node of map.nodes) {
    if (!state.world[node.id]) continue;
    if (state.world[node.id] === 'boss' && !state.targetFound) continue;
    if (sources.some(source => distance(map, source, node) <= reveal) || wide.some(source => distance(map, source, node) <= reveal * questRules.waymarkReveal)) shown.add(node.id);
  }
  return [...shown];
}
/** The boss shows itself once the player is close enough. */
export function sync(state: RunState, map: QuestMap): RunState {
  const nodes = lookup(map), boss = nodes.get(state.quest.target), here = nodes.get(state.position);
  const found = state.targetFound || (!!boss && !!here && distance(map, boss, here) <= map.settings.discover);
  const withFound = found === state.targetFound ? state : { ...state, targetFound: found };
  return { ...withFound, revealed: reveal(withFound, map) };
}

/** Take one of the offered cards (the draft, a reward, an exchange). */
export function takeCard(state: RunState, content: QuestContent, map: QuestMap, id: string): RunState {
  const offer = state.offer;
  if (state.stage === 'over' || !offer || offer.kind !== 'pick') throw new Error('There is nothing to pick from.');
  if (!offer.cards.includes(id) || offer.taken.includes(id)) throw new Error('That card is not on offer.');
  if (!canAdd(content, state.deck, id)) throw new Error('The deck cannot take another copy.');
  const taken = [...offer.taken, id], deck = [...state.deck, id];
  if (offer.source === 'draft') {
    const drafted = state.drafted + 1, after = { ...state, deck, drafted };
    return drafted >= questRules.draftPicks ? sync(finishDraft(after), map) : draftOffer(after, content);
  }
  const done = taken.length >= offer.pick;
  return next(state, { deck, offer: done ? null : { ...offer, taken } });
}
/** Turn down what is on offer; the draft cannot be skipped. */
export function skipOffer(state: RunState): RunState {
  if (!state.offer || (state.offer.kind === 'pick' && state.offer.source === 'draft')) return state;
  return next(state, { offer: null });
}

export const canTravel = (state: RunState, id: string) => state.stage === 'map' && !state.offer && !state.fight && state.revealed.includes(id) && !state.visited.includes(id);

/** Walk to a node and open it. Visiting is free; using the place marks it done. */
export function travel(state: RunState, map: QuestMap, id: string): RunState {
  if (!canTravel(state, id)) throw new Error('That place cannot be reached.');
  return sync(next(state, { position: id, encounter: { node: id, role: state.world[id]!, used: [] } }), map);
}
/** Close the place. A market or city you used counts as visited once you walk away. */
export function leave(state: RunState, map: QuestMap): RunState {
  if (state.fight || (state.offer?.kind === 'pick' && state.offer.source === 'draft')) return state;
  const encounter = state.encounter, usedUp = !!encounter && encounter.used.length > 0 && !state.visited.includes(encounter.node);
  return sync(next(state, { encounter: null, offer: null, visited: usedUp ? [...state.visited, encounter!.node] : state.visited }), map);
}

function done(state: RunState, map: QuestMap, change: Partial<RunState> = {}): RunState {
  const node = state.encounter?.node;
  return sync(next(state, { ...change, visited: node && !state.visited.includes(node) ? [...state.visited, node] : state.visited }), map);
}
const use = (state: RunState, action: string): Encounter => ({ ...state.encounter!, used: [...state.encounter!.used, action] });
const heal = (state: RunState, amount: number) => Math.min(questRules.maxLife, state.life + amount);

export type Action =
  | { type: 'fight' } | { type: 'rest' } | { type: 'heal' } | { type: 'shop' } | { type: 'buy'; index: number }
  | { type: 'rumor' } | { type: 'search' } | { type: 'read' } | { type: 'sacrifice'; index: number };

/** What a role can do, for the dialog's buttons. */
export function actionsFor(role: Role): Action['type'][] {
  switch (role) {
    case 'fight': case 'boss': case 'arena': return ['fight'];
    case 'refuge': return ['rest'];
    case 'city': return ['heal', 'shop', 'rumor'];
    case 'market': case 'trader': case 'capital': return ['shop'];
    case 'shrine': return ['sacrifice'];
    case 'ruin': case 'cache': return ['search'];
    case 'waymark': return ['read'];
    case 'landmark': return ['read'];
  }
}

function shopItems(state: RunState, content: QuestContent, premium: boolean) {
  const rng = rngFor(state), prices = premium ? questRules.capitalPrices : questRules.shopPrice;
  const cards = offerPack(content, state.faction, state.deck, rng, questRules.shopSize, premium ? ['rare', 'legendary'] : undefined);
  const fallback = cards.length ? cards : offerPack(content, state.faction, state.deck, rng, questRules.shopSize);
  return fallback.map(card => ({ card, price: prices[content.cards[card]!.rarity], sold: false }));
}

function enemyFor(state: RunState, content: QuestContent, map: QuestMap, node: string, role: Role): Enemy {
  const rng = makeRng(hashString(`${state.seed}|enemy|${node}`));
  const at = lookup(map).get(node);
  const playable = playableFactions(content);
  const others = playable.filter(faction => faction !== state.faction);
  const own = at?.affiliation && playable.includes(at.affiliation) ? at.affiliation : rng.pick(others.length ? others : playable);
  if (role === 'boss') {
    const faction = state.quest.bossFaction;
    return { name: state.quest.bossName, faction, deck: enemyDeck(content, faction, rng), life: questRules.maxLife + 5 };
  }
  const arena = role === 'arena';
  return { name: `${arena ? 'Champion' : 'Raiders'} of ${content.factionNames?.[own] ?? own}`, faction: own, deck: enemyDeck(content, own, rng), life: questRules.maxLife + (arena ? 3 : 0) };
}

export function act(state: RunState, content: QuestContent, map: QuestMap, action: Action): RunState {
  const encounter = state.encounter;
  if (state.stage !== 'map' || !encounter || state.fight) throw new Error('Nothing to do here.');
  const { role, node } = encounter, rng = rngFor(state);
  if (!actionsFor(role).includes(action.type === 'buy' ? 'shop' : action.type)) throw new Error(`A ${role} cannot do that.`);
  if (action.type !== 'buy' && action.type !== 'sacrifice' && encounter.used.includes(action.type) && action.type !== 'shop') throw new Error('Already done here.');
  switch (action.type) {
    case 'fight': {
      if (state.visited.includes(node)) throw new Error('This place has been cleared.');
      return next(state, { fight: { node, enemy: enemyFor(state, content, map, node, role), seed: (rng.next() * 4294967295) >>> 0 || 1 } });
    }
    case 'rest': return done(state, map, { life: heal(state, questRules.refugeHeal), encounter: use(state, 'rest') });
    case 'heal': {
      const missing = questRules.maxLife - state.life, afford = Math.floor(state.gold / questRules.healGoldPerLife), amount = Math.min(missing, afford);
      if (amount <= 0) throw new Error(missing ? 'Not enough crowns to heal.' : 'Already at full life.');
      return next(state, { life: state.life + amount, gold: state.gold - amount * questRules.healGoldPerLife, encounter: use(state, 'heal') });
    }
    case 'shop': {
      const premium = role === 'capital';
      return next(state, { offer: { kind: 'shop', premium, items: shopItems(state, content, premium) }, encounter: use(state, 'shop') });
    }
    case 'buy': {
      const offer = state.offer;
      if (!offer || offer.kind !== 'shop') throw new Error('No shop is open.');
      const item = offer.items[action.index];
      if (!item || item.sold) throw new Error('That is not for sale.');
      if (state.gold < item.price) throw new Error('Not enough crowns.');
      if (!canAdd(content, state.deck, item.card)) throw new Error('The deck cannot take another copy.');
      const items = offer.items.map((entry, index) => index === action.index ? { ...entry, sold: true } : entry);
      const bought = { ...state, deck: [...state.deck, item.card], gold: state.gold - item.price, offer: { ...offer, items } };
      return next(bought, { encounter: encounter.used.includes('buy') ? encounter : use(state, 'buy') });
    }
    case 'rumor': {
      const here = lookup(map).get(node)!;
      const targets = map.nodes.filter(entry => state.world[entry.id] === 'fight' && !state.visited.includes(entry.id) && !state.bounties[entry.id] && distance(map, entry, here) <= questRules.rumorRadius)
        .sort((a, b) => distance(map, a, here) - distance(map, b, here)).slice(0, questRules.rumorCount);
      if (!targets.length) throw new Error('The locals know of nothing nearby.');
      const bounties = { ...state.bounties };
      for (const target of targets) {
        const kind = rng.int(3), rare = candidates(content, state.faction, state.deck, ['rare']);
        bounties[target.id] = kind === 0 ? { gold: between(rng, questRules.rumorGold) } : kind === 1 || !rare.length ? { extraPick: true } : { card: rng.pick(rare).id };
      }
      return sync(next(state, { bounties, encounter: use(state, 'rumor') }), map);
    }
    case 'search': {
      if (rng.chance(0.5)) { const gold = between(rng, questRules.foundGold); return done(state, map, { gold: state.gold + gold, encounter: use(state, 'search'), stats: { ...state.stats, goldEarned: state.stats.goldEarned + gold } }); }
      const cards = offerPack(content, state.faction, state.deck, rng, questRules.foundPick.size);
      if (!cards.length) return done(state, map, { encounter: use(state, 'search') });
      return done(state, map, { encounter: use(state, 'search'), offer: { kind: 'pick', title: 'Found', size: questRules.foundPick.size, pick: 1, cards, source: 'found', taken: [] } });
    }
    case 'read': return done(state, map, { beacons: [...state.beacons, node], encounter: use(state, 'read') });
    case 'sacrifice': {
      const id = state.deck[action.index];
      if (id === undefined) throw new Error('That card is not in the deck.');
      const card = content.cards[id]!, deck = state.deck.filter((_, index) => index !== action.index);
      const cards = offerPack(content, state.faction, deck, rng, questRules.exchangePick.size, [card.rarity]);
      if (!cards.length) throw new Error('Nothing here can replace that card.');
      return done(state, map, { deck, encounter: use(state, 'sacrifice'), offer: { kind: 'pick', title: 'Exchange', size: questRules.exchangePick.size, pick: 1, cards, source: 'exchange', taken: [] } });
    }
  }
}

/** The match is over: carry the life forward and hand out what the fight was worth. */
export function finishFight(state: RunState, content: QuestContent, map: QuestMap, result: { won: boolean; life: number }): RunState {
  const fight = state.fight;
  if (!fight) throw new Error('No fight is under way.');
  const rng = rngFor(state);
  if (!result.won || result.life <= 0) return next(state, { fight: null, encounter: null, offer: null, stage: 'over', result: 'dead', life: 0 });
  const role = state.world[fight.node], life = Math.min(questRules.maxLife, result.life);
  const stats = { ...state.stats, fights: state.stats.fights + 1 };
  if (role === 'boss') return next(state, { fight: null, encounter: null, offer: null, stage: 'over', result: 'won', life, stats });
  const bounty = state.bounties[fight.node], { [fight.node]: _spent, ...bounties } = state.bounties;
  void _spent;
  const arena = role === 'arena';
  const gold = between(rng, arena ? questRules.arenaGold : questRules.fightGold) + (bounty && 'gold' in bounty ? bounty.gold : 0);
  let deck = state.deck;
  if (bounty && 'card' in bounty && canAdd(content, deck, bounty.card)) deck = [...deck, bounty.card];
  const { size, pick } = arena ? questRules.arenaPick : questRules.fightPick;
  const cards = offerPack(content, state.faction, deck, rng, size);
  stats.goldEarned += gold;
  const picks = pick + (bounty && 'extraPick' in bounty ? 1 : 0);
  const offer: Offer | null = cards.length ? { kind: 'pick', title: 'Spoils', size, pick: picks, cards, source: 'reward', taken: [] } : null;
  const after: RunState = { ...state, deck, gold: state.gold + gold, life, stats, bounties, fight: null, encounter: { node: fight.node, role: role!, used: ['fight'] } };
  return done(after, map, { offer });
}

/** The 24 hours are up: no main reward, but everything gathered stays. */
export function expire(state: RunState, now: number): RunState {
  if (state.stage === 'over' || now - state.startedAt < questRules.softFailHours * 3_600_000) return state;
  return next(state, { stage: 'over', result: 'expired', fight: null, encounter: null, offer: null });
}
export const abandon = (state: RunState): RunState => state.stage === 'over' ? state : next(state, { stage: 'over', result: 'abandoned', fight: null, encounter: null, offer: null });
/** Setting out and not coming back counts as a loss: a saved fight with no result is the player quitting it. */
export const forfeitFight = (state: RunState): RunState => state.fight ? next(state, { stage: 'over', result: 'dead', fight: null, encounter: null, offer: null, life: 0 }) : state;

export const timeLeft = (state: RunState, now: number) => Math.max(0, state.startedAt + questRules.softFailHours * 3_600_000 - now);
/** What the run pays: nothing unless the quest was won. */
export const payout = (state: RunState): { crowns: number; packs: Record<string, number> } | null =>
  state.result === 'won' ? { crowns: questRules.rewardCrowns, packs: { [state.pack]: questRules.rewardPacks } } : null;

export { pickBossName };
