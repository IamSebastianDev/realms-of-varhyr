import type { GameEvent, GameState, PlayerId, Registry } from '../../../packages/contracts/src';
import { effectiveStats, other } from '../../../packages/core/src';

/**
 * Presentation only. The engine resolves a whole combat in one command; these steps replay its events one exchange at a
 * time over a copy of the state, so each hit, each death and each life change can be seen before the real state appears.
 * Cards are never duplicated: a step names which real cards to move (`poses`) and the board animates those.
 */
export type PoseMode = 'lunge' | 'strike' | 'hit' | 'return' | 'die' | 'arrive';
export type Spot = { player: PlayerId; slot: number } | { life: PlayerId };
export type PoseSpec = { id: string; player: PlayerId; slot: number; mode: PoseMode; toward?: Spot; lunged?: boolean };
export type PopSpec = { id: string; at: Spot; text: string; tone: 'damage' | 'lethal' | 'heal' };
export type ClashStep = { state: GameState; ms: number; poses: PoseSpec[]; pops: PopSpec[]; kind: 'combat' | 'charge'; caption?: string };

const isPlayer = (id: string): id is PlayerId => id === 'p1' || id === 'p2';
const poseOf = (state: GameState, id: string, mode: PoseMode, toward?: Spot, lunged = false): PoseSpec => {
  const card = state.cards[id];
  return { id, player: card.controller, slot: card.slot ?? 0, mode, toward, lunged };
};
const spotOf = (state: GameState, id: string): Spot | undefined => {
  if (isPlayer(id)) return { life: id };
  const card = state.cards[id];
  return card && card.slot !== null ? { player: card.controller, slot: card.slot } : undefined;
};
function hurt(state: GameState, id: string, amount: number) {
  if (isPlayer(id)) state.players[id].life -= amount;
  else if (state.cards[id]) state.cards[id].damage += amount;
}
function remove(state: GameState, id: string) {
  const card = state.cards[id];
  if (!card || card.zone !== 'board') return;
  const player = state.players[card.controller];
  player.board = player.board.map(entry => entry === id ? null : entry);
  card.zone = 'discard'; card.slot = null; card.damage = 0;
  state.players[card.owner].discard.push(id);
}
const doomed = (state: GameState, registry: Registry, id: string) =>
  !isPlayer(id) && !!state.cards[id] && state.cards[id].damage >= effectiveStats(state, id, registry).defense;
const isDeath = (e: GameEvent) => (e.type === 'creature.destroyed' || e.type === 'bulwark.destroyed') && !!e.cardId;

type Exchange = { attacker?: string; defender?: string; hits: { target: string; amount: number }[]; deaths: string[]; heals: { target: PlayerId; amount: number }[] };

/** Scale a long sequence down so a big combat never drags. */
function pace(steps: ClashStep[], budget = 5200) {
  const total = steps.reduce((sum, step) => sum + step.ms, 0);
  if (total > budget) for (const step of steps) step.ms = Math.round(step.ms * Math.max(.55, budget / total));
  return steps;
}

/** Steps for one exchange: wind up, strike, then either the dead fall or the survivors step back. */
function exchangeSteps(cur: GameState, registry: Registry, ex: Exchange, kind: ClashStep['kind'], seq: () => string): ClashStep[] {
  const steps: ClashStep[] = [];
  const attackerLive = !!ex.attacker && cur.cards[ex.attacker]?.zone === 'board';
  const faceHit = ex.hits.find(h => isPlayer(h.target));
  const toward = ex.defender ? spotOf(cur, ex.defender) : faceHit ? { life: faceHit.target as PlayerId } : undefined;
  const clone = () => structuredClone(cur);
  const striking = attackerLive && !!toward;
  if (striking) steps.push({ state: clone(), ms: kind === 'charge' ? 280 : 300, kind, caption: kind === 'charge' ? 'Charge' : undefined, poses: [poseOf(cur, ex.attacker!, 'lunge', toward)], pops: [] });
  // The strike: damage lands and the numbers show before anything is removed.
  const spots = new Map<string, Spot>();
  for (const hit of ex.hits) { const spot = spotOf(cur, hit.target); if (spot) spots.set(hit.target, spot); }
  for (const hit of ex.hits) hurt(cur, hit.target, hit.amount);
  for (const heal of ex.heals) cur.players[heal.target].life += heal.amount;
  const pops: PopSpec[] = [
    ...ex.hits.filter(h => h.amount > 0 && spots.has(h.target)).map(h => ({ id: seq(), at: spots.get(h.target)!, text: `−${h.amount}`, tone: (doomed(cur, registry, h.target) ? 'lethal' : 'damage') as PopSpec['tone'] })),
    ...ex.heals.filter(h => h.amount > 0).map(h => ({ id: seq(), at: { life: h.target } as Spot, text: `+${h.amount}`, tone: 'heal' as const })),
  ];
  const poses: PoseSpec[] = [];
  if (striking) poses.push(poseOf(cur, ex.attacker!, 'strike', toward, true));
  for (const id of new Set(ex.hits.map(h => h.target))) if (!isPlayer(id) && id !== ex.attacker && cur.cards[id]?.zone === 'board') poses.push(poseOf(cur, id, 'hit'));
  const lethal = ex.deaths.length > 0 || pops.some(p => p.tone === 'lethal');
  if (poses.length || pops.length) steps.push({ state: clone(), ms: lethal ? 700 : 540, kind, poses, pops });
  // Resolution: whatever reached zero falls (still on the board, at zero defense), whoever lunged steps back.
  const dying = ex.deaths.filter(id => cur.cards[id]?.zone === 'board').map(id => poseOf(cur, id, 'die', id === ex.attacker ? toward : undefined, id === ex.attacker));
  const back = striking && !ex.deaths.includes(ex.attacker!) ? [poseOf(cur, ex.attacker!, 'return', toward, true)] : [];
  if (dying.length || back.length) steps.push({ state: clone(), ms: dying.length ? 560 : 300, kind, poses: [...dying, ...back], pops: [] });
  for (const id of ex.deaths) remove(cur, id);
  return steps;
}

export function buildClash(pre: GameState, events: GameEvent[], registry: Registry): ClashStep[] {
  const combat = pre.combat;
  if (!combat || combat.stage !== 'review') return [];
  const cur = structuredClone(pre), steps: ClashStep[] = [], consumed = new Set<string>();
  let n = 0; const seq = () => `p${n++}`;
  let ex: Exchange | null = null;
  const fresh = (): Exchange => ({ hits: [], deaths: [], heals: [] });
  const flush = () => { if (ex) steps.push(...exchangeSteps(cur, registry, ex, 'combat', seq)); ex = null; };
  for (const event of events) {
    if (event.type === 'damage.dealt' && event.target && event.amount !== undefined) {
      const target = event.target;
      if (ex?.attacker && target === ex.attacker) { ex.hits.push({ target, amount: event.amount }); continue; }
      const block = combat.blocks.find(b => b.blocker === target && !consumed.has(b.attacker));
      if (block) { flush(); consumed.add(block.attacker); ex = { ...fresh(), attacker: block.attacker, defender: target, hits: [{ target, amount: event.amount }] }; continue; }
      if (isPlayer(target) && target === other(pre.active)) {
        const attacker = combat.attackers.find(id => !consumed.has(id) && !combat.blocks.some(b => b.attacker === id) && cur.cards[id]?.zone === 'board');
        if (attacker) { flush(); consumed.add(attacker); ex = { ...fresh(), attacker, hits: [{ target, amount: event.amount }] }; continue; }
      }
      ex ??= fresh();
      ex.hits.push({ target, amount: event.amount });
    } else if (isDeath(event)) {
      ex ??= fresh(); ex.deaths.push(event.cardId!);
    } else if (event.type === 'life.restored' && event.target && isPlayer(event.target) && event.amount !== undefined) {
      ex ??= fresh(); ex.heals.push({ target: event.target, amount: event.amount });
    }
  }
  flush();
  return pace(steps);
}

/** Rewind a resolved state to the instant before its damage, so the blow can be shown landing. */
function rewind(cur: GameState, events: GameEvent[]) {
  for (const hit of events.filter(e => e.type === 'damage.dealt' && e.target && e.amount !== undefined)) {
    const id = hit.target!;
    if (isPlayer(id)) { cur.players[id].life += hit.amount!; continue; }
    if (cur.cards[id]?.zone !== 'board') {
      const death = events.find(e => isDeath(e) && e.cardId === id && e.snapshot);
      if (!death?.snapshot) continue;
      const snapshot = structuredClone(death.snapshot);
      cur.cards[id] = snapshot;
      cur.players[snapshot.controller].board[snapshot.slot ?? 0] = id;
      cur.players[snapshot.owner].discard = cur.players[snapshot.owner].discard.filter(x => x !== id);
    }
    cur.cards[id].damage = Math.max(0, cur.cards[id].damage - hit.amount!);
  }
  for (const heal of events.filter(e => e.type === 'life.restored' && e.target && isPlayer(e.target) && e.amount !== undefined)) cur.players[heal.target as PlayerId].life -= heal.amount!;
}
const exchangeOf = (events: GameEvent[], attacker?: string): Exchange => {
  const hits = events.filter(e => e.type === 'damage.dealt' && e.target && e.amount !== undefined).map(e => ({ target: e.target!, amount: e.amount! }));
  const defender = attacker ? hits.find(h => !isPlayer(h.target) && h.target !== attacker)?.target : undefined;
  return {
    attacker, defender, hits: attacker ? hits.filter(h => h.target === defender) : hits,
    deaths: events.filter(isDeath).map(e => e.cardId!).filter(id => !attacker || id === defender),
    heals: events.filter(e => e.type === 'life.restored' && e.target && isPlayer(e.target) && e.amount !== undefined).map(e => ({ target: e.target as PlayerId, amount: e.amount! })),
  };
};

/** A creature with Charge strikes the moment it arrives. `after` is the state once the whole play has resolved. */
export function buildCharge(after: GameState, events: GameEvent[], registry: Registry, playedId: string): ClashStep[] {
  if (after.cards[playedId]?.zone !== 'board' || !events.some(e => e.type === 'damage.dealt' && e.target && !isPlayer(e.target))) return [];
  const cur = structuredClone(after);
  rewind(cur, events);
  let n = 0;
  return exchangeSteps(cur, registry, exchangeOf(events, playedId), 'charge', () => `c${n++}`);
}

/** Everything that is not a combat (spells, abilities): numbers over what was hurt or healed, and the fallen dissolving. `hold` waits for a spell's flight. */
export function buildAftermath(after: GameState, events: GameEvent[], registry: Registry, hold = 0): ClashStep[] {
  const ex = exchangeOf(events);
  if (!ex.hits.some(h => h.amount > 0) && !ex.heals.length && !ex.deaths.length) return [];
  const cur = structuredClone(after);
  rewind(cur, events);
  let n = 0;
  const steps: ClashStep[] = hold > 0 ? [{ state: structuredClone(cur), ms: hold, poses: [], pops: [], kind: 'combat' }] : [];
  return [...steps, ...exchangeSteps(cur, registry, ex, 'combat', () => `a${n++}`)];
}

/** A creature settling onto the board: a small rise, nothing more. */
export function buildArrival(after: GameState, cardId: string): ClashStep[] {
  const card = after.cards[cardId];
  if (card?.zone !== 'board' || card.slot === null) return [];
  return [{ state: after, ms: 300, kind: 'combat', poses: [poseOf(after, cardId, 'arrive')], pops: [] }];
}
