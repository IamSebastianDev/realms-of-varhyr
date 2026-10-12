import * as v from 'valibot';
import type { AbilityBinding, BeforePayload, CardDefinition, CardInstance, Combat, Command, CommandEnvelope, Cost, DeadSnapshot, EnergyType, GameEvent, GameState, HookContext, InternalOrder, LegalActions, Player, PlayerId, PlayerView, Pool, Registry } from '../../contracts/src';
import { battlefieldPositions, deckRules, positionName } from '../../contracts/src';
import { describeAbility } from '../../extensions/src/describeAbility';
export const RULES_VERSION = 'varhir-rules-0.11';
const nonnegative = v.pipe(v.number(), v.integer(), v.minValue(0));
const paymentSchema = v.record(v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_-]*$/)), nonnegative);
const commandSchema = v.variant('type', [
  v.object({ type: v.literal('play'), cardId: v.string(), slot: v.optional(nonnegative), target: v.optional(v.string()), consume: v.optional(v.string()), payment: v.optional(paymentSchema) }),
  v.object({ type: v.literal('energy'), cardId: v.string(), option: nonnegative }),
  v.object({ type: v.literal('activate'), cardId: v.string(), ability: nonnegative, target: v.optional(v.string()) }),
  v.object({ type: v.literal('attack'), attackers: v.array(v.string()), lanes: v.optional(v.record(v.string(), nonnegative)) }),
  v.object({ type: v.literal('confirm-combat') }),
  v.object({ type: v.literal('mulligan'), cardIds: v.array(v.string()) }),
  v.object({ type: v.literal('choose'), choiceId: v.string(), option: v.union([v.string(),nonnegative]), other: v.optional(v.picklist(['discard','bottom'])) }),
  v.object({ type: v.literal('end') }),
]);
/** The network boundary uses exactly the engine's command schema. */
export const parseCommand = (input: unknown): Command => v.parse(commandSchema, input);

export const other = (p: PlayerId): PlayerId => p === 'p1' ? 'p2' : 'p1';
const requireRule = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
export function validateDeck(deck: string[], registry: Registry): string[] {
  const errors: string[] = [];
  if (deck.length < deckRules.minimumCards) errors.push(`A deck needs at least ${deckRules.minimumCards} cards.`);
  const counts: Record<string, number> = {};
  for (const id of deck) {
    const card = registry.cards[id];
    if (!card) { errors.push(`Unknown card: ${id}`); continue; }
    const count = counts[card.deckLimitKey] = (counts[card.deckLimitKey] ?? 0) + 1;
    if (count > (card.legendary ? deckRules.copiesPerLegendary : deckRules.copiesPerCard)) errors.push(`Too many copies of ${card.name}.`);
  }
  return errors;
}
function random(state: GameState): number {
  let x = state.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0; return state.rng / 4294967296;
}
function shuffle<T>(state: GameState, array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random(state) * (i + 1)); [result[i],result[j]] = [result[j],result[i]]; }
  return result;
}
export function definition(state: GameState | Pick<PlayerView, 'cards'>, id: string, registry: Registry): CardDefinition { return registry.cards[state.cards[id].definitionId]; }
export function effectiveStats(state: Pick<GameState, 'cards' | 'players'> | Pick<PlayerView, 'cards' | 'players'>, id: string, registry: Registry) {
  const card = state.cards[id], printed = registry.cards[card.definitionId].stats;
  if (!printed) return { attack: 0, defense: 0 };
  let attack = printed.attack, defense = printed.defense;
  for (const player of [state.players.p1, state.players.p2]) for (const sid of player.board) {
    if (!sid) continue;
    const source = state.cards[sid];
    for (const binding of registry.cards[source.definitionId].abilities) {
      const modifier = registry.abilities[binding.id].static?.(source, card, binding.params, registry);
      attack += modifier?.attack ?? 0; defense += modifier?.defense ?? 0;
    }
  }
  return { attack: Math.max(0, attack), defense: Math.max(0, defense) };
}
// Pure damage preview: replacement hooks are read without issuing their effects.
// Used by the bot to compare single-block trades with armor applied.
export function previewDamage(state:GameState,target:string,amount:number,registry:Registry):number {
  const card=state.cards[target];if(!card)return amount;
  let payload:BeforePayload={amount};
  const event:GameEvent={seq:state.sequence,type:'damage.before',message:'',cardId:target,visibility:'public'};
  for(const binding of [...registry.cards[card.definitionId].abilities].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)) {
      payload=registry.abilities[binding.id].before?.['damage.before']?.({state,registry,source:card,event,issue:()=>{}},binding.params,payload)??payload;
  }
  const damage=payload.amount??amount;requireRule(Number.isInteger(damage)&&damage>=0,'Invalid damage modifier.');return damage;
}
export function combatDamage(state:GameState,attacker:string,assignments:Combat['blocks'],registry:Registry):Extract<InternalOrder,{type:'damage'}>[] {
  if(state.cards[attacker]?.zone!=='board')return [];
  const block=assignments.find(a=>a.attacker===attacker);
  const attack=effectiveStats(state,attacker,registry).attack;
  if(!block)return [{type:'damage',target:other(state.active),amount:attack,source:attacker}];
  // A declared block prevents player damage even if its blocker has left play.
  if(state.cards[block.blocker]?.zone!=='board')return [];
  // Snapshot both attacks before either hit or any death/trigger resolution.
  return [
    {type:'damage',target:block.blocker,amount:attack,source:attacker},
    {type:'damage',target:attacker,amount:effectiveStats(state,block.blocker,registry).attack,source:block.blocker},
  ];
}
/** Whether this pair may ever block (types, flank restrictions). Lane geometry is separate: see laneBlocks. */
export function canBlock(state: Pick<GameState, 'cards'>, attackerId: string, blockerId: string, registry: Registry): boolean {
  const attacker=state.cards[attackerId],blocker=state.cards[blockerId];
  if(!attacker||!blocker||attacker.zone!=='board'||blocker.zone!=='board'||attacker.controller===blocker.controller
    ||definition(state,attackerId,registry).type!=='creature')return false;
  return [attacker,blocker].every(source=>definition(state,source.id,registry).abilities.every(binding=>
    registry.abilities[binding.id].canBlock?.(source,attacker,blocker,binding.params,registry) !== false));
}
/** An attacker may target its own lane or one adjacent lane; lanes never wrap. */
export function reachableLanes(slot: number | null): number[] {
  return slot === null ? [] : [slot - 1, slot, slot + 1].filter(lane => lane >= 0 && lane < battlefieldPositions.length);
}
const abilitiesOf=(state: Pick<GameState,'cards'>,id: string,registry: Registry)=>definition(state,id,registry).abilities;
/** Guards that would step in for `attacker` aimed at `lane`, nearest slot first. */
function interceptors(state: Pick<GameState,'cards'|'players'>, attackerId: string, lane: number, registry: Registry): string[] {
  const attacker=state.cards[attackerId],board=state.players[other(attacker.controller)].board;
  return [lane-1,lane+1].flatMap(slot=>{
    const id=board[slot];
    return id&&abilitiesOf(state,id,registry).some(b=>registry.abilities[b.id].intercepts?.(state.cards[id],attacker,lane,b.params,registry))&&canBlock(state,attackerId,id,registry)?[id]:[];
  });
}
/** Who blocks `attacker` aimed at `lane`: a free adjacent Guard, otherwise the card in the lane if it can block. */
export function blockerFor(state: Pick<GameState,'cards'|'players'>, attackerId: string, lane: number, registry: Registry, used: ReadonlySet<string> = new Set()): string | null {
  const guard=interceptors(state,attackerId,lane,registry).find(id=>!used.has(id));
  if(guard)return guard;
  const id=state.players[other(state.cards[attackerId].controller)].board[lane];
  return id&&!used.has(id)&&canBlock(state,attackerId,id,registry)?id:null;
}
/** Blocking is automatic. A Guard sitting in a targeted lane always blocks there first; the remaining attackers go left to right,
 * each met by a free adjacent Guard, else by the card in the lane. A card blocks at most one attacker. */
export function laneBlocks(state: GameState, attackers: string[], lanes: Record<string, number>, registry: Registry): Combat['blocks'] {
  const board=state.players[other(state.active)].board,used=new Set<string>(),blockers=new Map<string,string>();
  for(const attacker of attackers){
    const id=board[lanes[attacker]];
    if(id&&abilitiesOf(state,id,registry).some(b=>registry.abilities[b.id].intercepts)&&canBlock(state,attacker,id,registry)){blockers.set(attacker,id);used.add(id);}
  }
  for(const attacker of [...attackers].sort((x,y)=>lanes[x]-lanes[y])){
    if(blockers.has(attacker))continue;
    const id=blockerFor(state,attacker,lanes[attacker],registry,used);
    if(id){blockers.set(attacker,id);used.add(id);}
  }
  return attackers.flatMap(attacker=>blockers.has(attacker)?[{attacker,blocker:blockers.get(attacker)!}]:[]);
}
export function autoPayment(pool: Pool, cost: Cost): Pool | null {
  const paid: Pool = {}, available = { ...pool };
  for (const color of Object.keys(cost.factions).sort()) {
    const needed = color === 'neutral' ? 0 : cost.factions[color] ?? 0;
    if ((available[color] ?? 0) < needed) return null;
    if (needed) { paid[color] = needed; available[color] = (available[color] ?? 0) - needed; }
  }
  let remaining = cost.generic;
  // Prefer neutral energy; remaining faction IDs sort deterministically.
  for (const color of ['neutral', ...Object.keys(available).filter(c => c !== 'neutral').sort()]) {
    const spend = Math.min(remaining, available[color] ?? 0);
    if (spend) paid[color] = (paid[color] ?? 0) + spend;
    remaining -= spend;
  }
  return remaining ? null : paid;
}
function validPayment(pool: Pool, cost: Cost, paid: Pool, colors: EnergyType[]) {
  if (Object.keys(paid).some(c => !colors.includes(c as EnergyType))) return false;
  let total = 0, required = cost.generic;
  for (const color of colors) {
    const amount = paid[color] ?? 0, specific = color === 'neutral' ? 0 : cost.factions[color] ?? 0;
    if (!Number.isInteger(amount) || amount < specific || amount < 0 || amount > (pool[color] ?? 0)) return false;
    total += amount; required += specific;
  }
  return total === required;
}
function addEnergy(pool: Pool, output: Pool) { for (const color of Object.keys(output)) if (output[color]) pool[color] = (pool[color] ?? 0) + output[color]!; }
export function decisionPlayer(state: GameState): PlayerId {
  return state.pending?.player ?? (state.phase === 'attack' && state.combat?.stage === 'death' ? other(state.active) : state.active);
}
function blankPlayer(id: PlayerId, name: string): Player { return { id, name, life: 10, deck: [], hand: [], board: [null,null,null,null,null], discard: [], energy: {}, deathEnergy: {} }; }
export const MULLIGAN_MAX = 2;
/** `mulligan` lets each player replace up to two opening cards, player one first. */
export function createMatch(registry: Registry, decks: [string[], string[]], seed = 731, options: { mulligan?: boolean } = {}): GameState {
  for (const deck of decks) requireRule(!validateDeck(deck, registry).length, validateDeck(deck, registry).join(' '));
  const state: GameState = { rulesVersion: RULES_VERSION, contentVersion: registry.version, seed: seed >>> 0, rng: (seed >>> 0) || 1, revision: 0, sequence: 0, turn: 1, active: 'p1', phase: 'play', players: { p1: blankPlayer('p1','Player one'), p2: blankPlayer('p2','Player two') }, cards: {}, combat: null, pending: null, outcome: null, outcomeReason: null, events: [] };
  decks.forEach((deck, index) => {
    const player: PlayerId = index === 0 ? 'p1' : 'p2';
    deck.forEach((definitionId, i) => { const id = `${player}-${i}`; state.cards[id] = { id, definitionId, owner: player, controller: player, zone: 'deck', slot: null, exhausted: false, damage: 0 }; state.players[player].deck.push(id); });
    state.players[player].deck = shuffle(state, state.players[player].deck);
  });
  const tx = new Transaction(state, registry);
  tx.draw('p1',5); tx.draw('p2',5);
  tx.emit('turn.started','Player one begins. First draw phase is skipped.');
  tx.emit('phase.started','Play phase begins.');
  if (options.mulligan) { tx.emit('mulligan.started',`Opening hands: ${state.players.p1.name} may replace up to ${MULLIGAN_MAX} cards first.`); state.pending = { id:`mulligan-${state.sequence}`,player:'p1',kind:'mulligan',options:[...state.players.p1.hand],max:MULLIGAN_MAX }; }
  return state;
}
class Transaction {
  queue: InternalOrder[] = []; budget = 256; inCombat = false; target?: string;
  constructor(public state: GameState, public registry: Registry) {}
  context(source: CardInstance, event: GameEvent): HookContext { return { state: this.state, registry: this.registry, source, event, target: this.target, issue: order => this.queue.push(order) }; }
  sources(event?: GameEvent): CardInstance[] {
    const sources = [this.state.active,other(this.state.active)].flatMap(p => this.state.players[p].board.filter((id): id is string => !!id).map(id => this.state.cards[id]));
    if (event?.snapshot && !sources.some(c => c.id === event.snapshot!.id)) sources.push(event.snapshot);
    return sources.sort((a,b) => Number(a.controller !== this.state.active) - Number(b.controller !== this.state.active) || (a.slot ?? 5) - (b.slot ?? 5) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  emit(type: string, message: string, data: Partial<GameEvent> = {}) {
    const event: GameEvent = { seq: ++this.state.sequence, type, message, visibility: 'public', ...data };
    this.state.events.push(event);
    for (const source of this.sources(event)) {
      const bindings = [...this.registry.cards[source.definitionId].abilities].sort((a,b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const binding of bindings) this.registry.abilities[binding.id].hooks?.[type]?.(this.context(source,event),binding.params);
    }
    return event;
  }
  before(type: string, source: CardInstance, payload: BeforePayload): BeforePayload {
    const event: GameEvent = { seq: this.state.sequence, type, message: '', cardId: source.id, visibility: 'public' };
    let result = payload;
    for (const binding of [...this.registry.cards[source.definitionId].abilities].sort((a,b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      result = this.registry.abilities[binding.id].before?.[type]?.(this.context(source,event),binding.params,result) ?? result;
    }
    return result;
  }
  draw(player: PlayerId, amount: number, zone: 'hand' | 'choice' = 'hand'): string[] {
    const p = this.state.players[player], drawn: string[] = [];
    for (let i = 0; i < amount && !this.state.outcome; i++) {
      if (!p.deck.length) { this.emptyLibrary(player); break; }
      const id = p.deck.pop()!;
      this.state.cards[id].zone = zone;
      if (zone === 'hand') p.hand.push(id);
      drawn.push(id);
      this.emit('card.drawn',`Drew ${this.registry.cards[this.state.cards[id].definitionId].name}.`,{player,cardId:id,visibility:player});
      if (!p.deck.length) this.emptyLibrary(player);
    }
    return drawn;
  }
  detach(card: CardInstance) {
    const p = this.state.players[card.owner];
    if (card.zone === 'board') this.state.players[card.controller].board[card.slot!] = null;
    else if (card.zone === 'hand') p.hand = p.hand.filter(id => id !== card.id);
    else if (card.zone === 'discard') p.discard = p.discard.filter(id => id !== card.id);
    else if (card.zone === 'deck') p.deck = p.deck.filter(id => id !== card.id);
    card.slot = null;
  }
  discard(id: string) { const card = this.state.cards[id]; this.detach(card); card.zone = 'discard'; card.damage = 0; card.exhausted = false; this.state.players[card.owner].discard.push(id); }
  destroy(id: string, combat = false) {
    const card = this.state.cards[id]; if (!card || card.zone !== 'board') return;
    const snapshot = { ...card };
    if (combat && card.controller !== this.state.active && this.state.combat && definition(this.state,id,this.registry).type === 'creature') this.state.combat.dead.push({ card: snapshot, outputs: structuredClone(this.registry.cards[card.definitionId].stats!.energyOutputs) });
    this.discard(id);
    this.emit(definition(this.state,id,this.registry).type === 'bastion' ? 'bastion.destroyed' : 'creature.destroyed',`${this.registry.cards[card.definitionId].name} is destroyed.`,{cardId:id,player:snapshot.controller,snapshot});
  }
  stateChecks() {
    for (const p of [this.state.players.p1,this.state.players.p2]) for (const id of [...p.board]) {
      if (id && this.state.cards[id].damage >= effectiveStats(this.state,id,this.registry).defense) this.destroy(id,this.inCombat);
    }
  }
  sourceNote(source?: string) { const card = source ? this.state.cards[source] : undefined; return card ? ` from ${this.registry.cards[card.definitionId].name}` : ''; }
  dealDamage(order:Extract<InternalOrder,{type:'damage'}>) {
    requireRule(Number.isInteger(order.amount) && order.amount >= 0,'Invalid damage amount.');
    if (order.target === 'p1' || order.target === 'p2') {
      this.state.players[order.target].life -= order.amount;
      this.emit('damage.dealt',`${this.state.players[order.target].name} takes ${order.amount} damage${this.sourceNote(order.source)}.`,{target:order.target,amount:order.amount});
    } else {
      const card = this.state.cards[order.target];
      if (card?.zone === 'board') {
        const amount = this.before('damage.before',card,{amount:order.amount}).amount ?? order.amount;
        requireRule(Number.isInteger(amount) && amount >= 0,'Invalid damage modifier.');
        card.damage += amount;
        this.emit('damage.dealt',`${this.registry.cards[card.definitionId].name} takes ${amount} damage${this.sourceNote(order.source)}.`,{target:card.id,cardId:card.id,amount});
      }
    }
  }
  drain() {
    if (this.state.outcome) { this.queue = []; return; }
    this.stateChecks();
    while (this.queue.length && !this.state.outcome) {
      requireRule(--this.budget > 0,'RESOLUTION_LIMIT: extension chain exceeded 256 operations.');
      const order = this.queue.shift()!;
      if (order.type === 'damage') this.dealDamage(order);
      else if (order.type === 'heal') {
        requireRule(Number.isInteger(order.amount) && order.amount >= 0,'Invalid heal amount.');
        this.state.players[order.target].life += order.amount;
        this.emit('life.restored',`${this.state.players[order.target].name} restores ${order.amount} life.`,{target:order.target,amount:order.amount});
      } else if (order.type === 'draw') {
        requireRule(Number.isInteger(order.amount) && order.amount >= 0 && order.amount <= 100,'Invalid draw amount.');
        this.draw(order.player,order.amount);
      } else if (order.type === 'destroy') this.destroy(order.target,order.combat);
      else if (order.type === 'return') {
        const card = this.state.cards[order.target];
        if (card?.zone === 'board') {
          this.detach(card); card.zone = 'hand'; card.damage = 0; card.exhausted = false; card.controller = card.owner;
          this.state.players[card.owner].hand.push(card.id);
          this.emit('card.returned',`${this.registry.cards[card.definitionId].name} returns to hand.`,{cardId:card.id});
        }
      }
      if (!this.state.outcome) this.stateChecks();
    }
  }
  finish(outcome: NonNullable<GameState['outcome']>, reason: NonNullable<GameState['outcomeReason']>, message: string) {
    if (this.state.outcome) return;
    this.state.outcome = outcome; this.state.outcomeReason = reason;
    // Terminal turn draws must not leave unlocated choice cards or an active
    // choice dialog. Preserve their private identities in their owners' hands.
    for (const card of Object.values(this.state.cards)) if (card.zone === 'choice') {
      card.zone = 'hand'; this.state.players[card.owner].hand.push(card.id);
    }
    this.state.pending = null;
    this.emit('game.ended',message);
    this.queue = []; // Library depletion ends resolution immediately.
  }
  emptyLibrary(player: PlayerId) {
    this.finish(other(player),'empty-library',`${this.state.players[player].name} loses: their library is empty.`);
  }
  checkOutcome() {
    const p1 = this.state.players.p1.life <= 0, p2 = this.state.players.p2.life <= 0;
    if ((p1 || p2) && !this.state.outcome) {
      const outcome = p1 && p2 ? 'draw' : p1 ? 'p2' : 'p1';
      this.finish(outcome,'life',outcome === 'draw' ? 'The match ends in a draw.' : `${this.state.players[outcome].name} wins.`);
    }
  }
  deathOutputs(dead: DeadSnapshot[]) {
    const defender = other(this.state.active), p = this.state.players[defender];
    for (let i = 0; i < dead.length; i++) {
      const snapshot = dead[i];
      if (snapshot.outputs.length === 1) addEnergy(p.deathEnergy,snapshot.outputs[0]);
      else {
        this.state.pending = { id: `choice-${this.state.sequence}-${i}`, player:defender, kind:'death-energy', options:snapshot.outputs, sourceName:this.registry.cards[snapshot.card.definitionId].name, remaining:dead.slice(i+1) };
        return;
      }
    }
    this.emit('death.window',`${p.name} may cast death-window spells, then close the window.`,{player:defender});
  }
  combat() {
    const combat = this.state.combat!, assignments = combat.blocks;
    this.emit('combat.confirmed','The attacker confirms combat.',{player:this.state.active});
    this.inCombat = true;
    for (const a of assignments) this.emit(definition(this.state,a.blocker,this.registry).type === 'bastion' ? 'bastion.blocked' : 'creature.blocked',`${definition(this.state,a.blocker,this.registry).name} blocks ${definition(this.state,a.attacker,this.registry).name}.`,{cardId:a.blocker,target:a.attacker});
    this.drain();
    for (const id of combat.attackers) {
      if (this.state.outcome) break;
      if (this.state.cards[id].zone !== 'board') continue;
      // Apply both sides' hits before death checks or queued triggers. A
      // declared block still prevents spillover if its blocker disappeared.
      for(const order of combatDamage(this.state,id,assignments,this.registry))this.dealDamage(order);
      this.drain();
    }
    this.inCombat = false;
    this.checkOutcome();
    if (this.state.outcome) return;
    if (combat.dead.length) { combat.stage = 'death'; this.deathOutputs(combat.dead); }
    else { this.state.phase = 'end'; this.state.combat = null; this.emit('phase.started','End phase. Ready your surviving field cards and pass the turn.'); }
  }
}
function targetOptions(state: GameState, actor: PlayerId, bindings: AbilityBinding[], registry: Registry): { targets: string[]; required: boolean } {
  let targets: string[] | null = null;
  for (const b of bindings) {
    const kind = registry.abilities[b.id].target; if (!kind) continue;
    const side = kind === 'friendly-creature' || kind === 'friendly-field' ? actor : other(actor);
    const options = state.players[side].board.filter((id): id is string => !!id &&
      (!(kind === 'friendly-creature' || kind === 'enemy-creature') || definition(state,id,registry).type === 'creature'));
    if (kind === 'enemy-any') options.push(other(actor));
    targets = targets === null ? options : targets.filter(id => options.includes(id));
  }
  return { targets: targets ?? [], required: targets !== null && targets.length > 0 };
}
function playPayload(state: GameState, card: CardInstance, registry: Registry) {
  return new Transaction(state,registry).before('card.play.before',card,{cost:structuredClone(registry.cards[card.definitionId].cost),consume:false});
}
export function legalActions(state: GameState, registry: Registry): LegalActions {
  const actor = decisionPlayer(state), legal: LegalActions = {actor,playable:[],energy:[],activations:[],attackers:[],lanes:{},canEnd:false};
  if (state.outcome || state.pending) return legal;
  const p = state.players[actor];
  if (state.phase === 'play' || state.phase === 'attack' && state.combat?.stage === 'death') {
    const death = state.phase === 'attack';
    for (const id of p.hand) {
      const card = state.cards[id], def = registry.cards[card.definitionId];
      if (death && (def.type !== 'spell' || !def.timing!.includes('death'))) continue;
      if (!death && def.type === 'spell' && !def.timing!.includes('play')) continue;
      const payload = playPayload(state,card,registry);
      if (!autoPayment(death ? p.deathEnergy : p.energy,payload.cost!)) continue;
      const slots = p.board.map((id,i) => id === null ? i : -1).filter(i => i >= 0);
      const consumes = payload.consume ? p.board.filter((id): id is string => !!id && definition(state,id,registry).type === 'creature') : [];
      if (def.type !== 'spell' && ((!slots.length && !consumes.length) || (payload.consume && !consumes.length))) continue;
      const targeting = targetOptions(state,actor,[...def.abilities.filter(b=>!registry.abilities[b.id].activate),...def.cast ?? []],registry);
      // Required spell targets cannot disappear into an illegal target-free cast.
      if (def.type === 'spell' && def.cast?.some(b => registry.abilities[b.id].target) && !targeting.targets.length) continue;
      legal.playable.push({cardId:id,slots,targets:targeting.targets,requiresTarget:targeting.required,consumes});
    }
    if (!death) for (const id of p.board) {
      if (!id || state.cards[id].exhausted) continue;
      const def = definition(state,id,registry);
      if (def.type === 'creature') legal.energy.push({cardId:id,options:def.stats!.energyOutputs});
      def.abilities.forEach((binding, ability) => {
        if (!registry.abilities[binding.id].activate) return;
        const targeting = targetOptions(state,actor,[binding],registry);
        if (registry.abilities[binding.id].target && !targeting.targets.length) return;
        legal.activations.push({cardId:id,ability,targets:targeting.targets,requiresTarget:targeting.required});
      });
    }
    legal.canEnd = true;
  } else if (state.phase === 'attack' && state.combat?.stage === 'declare') {
    legal.attackers = p.board.filter((id): id is string => !!id && !state.cards[id].exhausted && definition(state,id,registry).type === 'creature');
    legal.lanes = Object.fromEntries(legal.attackers.map(id => [id, reachableLanes(state.cards[id].slot)]));
    legal.canEnd = true;
  }
  else if (state.phase === 'end') legal.canEnd = true;
  return legal;
}
export function apply(state: GameState, envelope: CommandEnvelope, registry: Registry): { state: GameState; events: GameEvent[]; error?: string } {
  try {
    v.parse(commandSchema,envelope.command);
    requireRule(state.rulesVersion === RULES_VERSION,'Rules version differs from this engine.');
    requireRule(state.contentVersion === registry.version,'Content version differs from the pinned match.');
    requireRule(envelope.expectedRevision === state.revision,'Stale command. Refresh the match before acting.');
    requireRule(!state.outcome,'This match has ended.');
    requireRule(envelope.actor === decisionPlayer(state),'It is not your decision.');
    requireRule(!state.pending || envelope.command.type === (state.pending.kind === 'mulligan' ? 'mulligan' : 'choose'),'Resolve the pending choice first.');
    const next = structuredClone(state), tx = new Transaction(next,registry), p = next.players[envelope.actor], command = envelope.command;
    if (command.type === 'mulligan') {
      const choice = next.pending;
      requireRule(choice?.kind === 'mulligan' && choice.player === envelope.actor,'No opening-hand choice is pending.');
      const ids = command.cardIds, max = (choice as { max: number }).max;
      requireRule(new Set(ids).size === ids.length && ids.length <= max && ids.every(id => p.hand.includes(id)) && p.deck.length >= ids.length,`Replace at most ${max} different cards from your opening hand.`);
      if (ids.length) {
        // Draw the replacements first, then shuffle the returned cards in so none comes straight back.
        const drawn = p.deck.splice(0,ids.length);
        p.hand = p.hand.filter(id => !ids.includes(id));
        for (const id of ids) { next.cards[id].zone = 'deck'; p.deck.push(id); }
        p.deck = shuffle(next,p.deck);
        for (const id of drawn) { next.cards[id].zone = 'hand'; p.hand.push(id); tx.emit('card.drawn',`Drew ${definition(next,id,registry).name}.`,{player:envelope.actor,cardId:id,visibility:envelope.actor}); }
        tx.emit('mulligan.replaced',`${p.name} replaces ${ids.length} opening ${ids.length === 1 ? 'card' : 'cards'}.`,{player:envelope.actor,amount:ids.length});
      } else tx.emit('mulligan.kept',`${p.name} keeps their opening hand.`,{player:envelope.actor});
      next.pending = envelope.actor === 'p1' ? { id:`mulligan-${next.sequence}`,player:'p2',kind:'mulligan',options:[...next.players.p2.hand],max } : null;
      if (next.pending) tx.emit('mulligan.started',`${next.players.p2.name} may replace up to ${max} cards.`,{player:'p2'});
    } else if (command.type === 'choose') {
      const choice = next.pending;
      requireRule(choice && choice.id === command.choiceId && choice.player === envelope.actor,'Invalid or expired choice.');
      if (choice!.kind === 'draw') {
        requireRule(typeof command.option === 'string' && choice!.options.includes(command.option),'Choose one of the two drawn cards.');
        for (const id of choice!.options as string[]) {
          if (id === command.option) { next.cards[id].zone = 'hand'; p.hand.push(id); }
          else if (command.other === 'bottom') { next.cards[id].zone = 'deck'; p.deck.push(id); tx.emit('card.bottomed',`${p.name} puts a card under their library.`,{player:envelope.actor}); }
          else { tx.discard(id); tx.emit('card.discarded',`${definition(next,id,registry).name} is discarded.`,{player:envelope.actor,cardId:id}); }
        }
        next.pending = null; next.phase = 'play'; tx.emit('phase.started','Play phase begins.');
      } else {
        requireRule(typeof command.option === 'number' && Number.isInteger(command.option) && choice!.options[command.option],'Choose a legal death-energy output.');
        addEnergy(p.deathEnergy,(choice!.options as Pool[])[command.option as number]);
        const remaining = (choice as { remaining: DeadSnapshot[] }).remaining; next.pending = null; tx.deathOutputs(remaining);
      }
    } else if (command.type === 'play') {
      const legal = legalActions(next,registry).playable.find(a => a.cardId === command.cardId);
      requireRule(legal,'That card cannot be played: check timing, energy and free slots.');
      const card = next.cards[command.cardId], def = registry.cards[card.definitionId];
      const payload = playPayload(next,card,registry);
      if (legal!.requiresTarget) requireRule(command.target && legal!.targets.includes(command.target),'Select a legal target.');
      else requireRule(!command.target,'This card has no legal target.');
      let slot = command.slot ?? legal!.slots[0];
      if (payload.consume) {
        requireRule(command.consume && legal!.consumes.includes(command.consume),'Consume requires a friendly creature.');
        const consumedSlot = next.cards[command.consume!].slot!;
        slot = command.slot ?? consumedSlot;
        requireRule(slot === consumedSlot || legal!.slots.includes(slot),'That slot is occupied.');
      } else requireRule(!command.consume,'This card does not have Consume.');
      if (def.type !== 'spell') requireRule(Number.isInteger(slot) && slot >= 0 && slot < battlefieldPositions.length && (legal!.slots.includes(slot) || (payload.consume && next.cards[command.consume!].slot === slot)),'Choose a free battlefield position.');
      const pool = next.phase === 'play' ? p.energy : p.deathEnergy;
      const payment = command.payment ?? autoPayment(pool,payload.cost!)!;
      requireRule(validPayment(pool,payload.cost!,payment,registry.energyTypes),'The payment does not satisfy this cost.');
      for (const color of Object.keys(payment)) if (payment[color]) pool[color] = (pool[color] ?? 0) - payment[color]!;
      tx.target = command.target;
      if (payload.consume) tx.destroy(command.consume!);
      tx.detach(card);
      if (def.type !== 'spell') {
        card.zone = 'board'; card.slot = slot; p.board[slot] = card.id;
        card.exhausted = tx.before(def.type === 'bastion' ? 'bastion.enter.before' : 'creature.enter.before',card,{exhausted:true}).exhausted ?? true;
        tx.emit('card.played',`${p.name} plays ${def.name} in ${positionName(slot)}.`,{player:envelope.actor,cardId:card.id});
        tx.emit(def.type === 'bastion' ? 'bastion.entered' : 'creature.entered',`${def.name} enters ${card.exhausted ? 'exhausted' : 'ready'}.`,{cardId:card.id});
      } else {
        card.zone = 'discard'; p.discard.push(card.id);
        const event = tx.emit('spell.cast',`${p.name} casts ${def.name}.`,{player:envelope.actor,cardId:card.id,target:command.target});
        for (const binding of def.cast!) registry.abilities[binding.id].cast!(tx.context(card,event),binding.params);
      }
    } else if (command.type === 'energy') {
      const legal = legalActions(next,registry).energy.find(a => a.cardId === command.cardId);
      requireRule(legal && Number.isInteger(command.option) && legal.options[command.option],'That creature cannot generate that energy now.');
      const card = next.cards[command.cardId];
      const output = tx.before('energy.generate.before',card,{output:structuredClone(legal!.options[command.option])}).output!;
      for (const [color,amount] of Object.entries(output)) requireRule(registry.energyTypes.includes(color as EnergyType) && Number.isInteger(amount) && amount >= 0,'Invalid energy output modifier.');
      card.exhausted = true; addEnergy(p.energy,output);
      tx.emit('creature.exhausted',`${definition(next,card.id,registry).name} exhausts.`,{cardId:card.id});
      tx.emit('energy.generated',`${definition(next,card.id,registry).name} generates energy.`,{cardId:card.id,player:envelope.actor});
    } else if (command.type === 'activate') {
      const legal = legalActions(next,registry).activations.find(action=>action.cardId===command.cardId&&action.ability===command.ability);
      requireRule(legal,'That ability cannot be activated now. Use a ready field card during your play phase.');
      if (legal!.requiresTarget) requireRule(command.target && legal!.targets.includes(command.target),'Select a legal target.');
      else requireRule(!command.target,'This ability has no legal target.');
      const card = next.cards[command.cardId], binding = definition(next,card.id,registry).abilities[command.ability];
      card.exhausted = true;
      tx.target = command.target;
      const event = tx.emit('ability.activated',`${definition(next,card.id,registry).name} activates ${describeAbility(binding,registry.abilities[binding.id]).name}.`,{cardId:card.id,player:envelope.actor,target:command.target});
      registry.abilities[binding.id].activate!(tx.context(card,event),binding.params);
    } else if (command.type === 'attack') {
      requireRule(next.phase === 'attack' && next.combat?.stage === 'declare','Declare attackers in the Attack Phase.');
      const eligible = legalActions(next,registry).attackers;
      requireRule(new Set(command.attackers).size === command.attackers.length && command.attackers.every(id => eligible.includes(id)),'Choose unique, unexhausted attackers.');
      if (!command.attackers.length) { next.phase = 'end'; next.combat = null; tx.emit('phase.started','Attack phase skipped.'); }
      else {
        const lanes: Record<string, number> = {}, targeted = new Set<number>();
        requireRule(Object.keys(command.lanes ?? {}).every(id => command.attackers.includes(id)),'A lane was chosen for a card that is not attacking.');
        for (const id of command.attackers) {
          const lane = command.lanes?.[id] ?? next.cards[id].slot!;
          requireRule(legalActions(next,registry).lanes[id].includes(lane),'Attack your own lane or an adjacent lane.');
          requireRule(!targeted.has(lane),'Only one attacker may target each lane.');
          targeted.add(lane); lanes[id] = lane;
        }
        next.combat!.attackers = [...command.attackers].sort((a,b) => next.cards[a].slot! - next.cards[b].slot!);
        next.combat!.lanes = lanes;
        next.combat!.blocks = laneBlocks(next,next.combat!.attackers,lanes,registry);
        next.combat!.stage = 'review';
        for (const id of next.combat!.attackers) { next.cards[id].exhausted = true; tx.emit('creature.attacked',`${definition(next,id,registry).name} attacks ${positionName(lanes[id])}.`,{cardId:id,player:envelope.actor}); }
        tx.emit('combat.blocks-set','Defenders in the targeted lanes block automatically. The attacker must review and confirm combat.',{player:other(next.active)});
      }
    } else if (command.type === 'confirm-combat') {
      requireRule(next.phase === 'attack' && next.combat?.stage === 'review','Confirm combat only after attackers are declared.');
      tx.combat();
    } else if (command.type === 'end') {
      requireRule(legalActions(next,registry).canEnd,'This phase cannot be ended yet.');
      tx.emit('phase.ended',`${next.phase} phase ends.`);
      tx.drain();
      if (!next.outcome && next.phase === 'play') {
        p.energy = {}; next.phase = 'attack'; next.combat = {stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};
        tx.emit('phase.started','Choose a batch of attackers, or skip combat.');
      } else if (!next.outcome && next.phase === 'attack') {
        if (next.combat!.stage === 'declare') { next.phase = 'end'; next.combat = null; }
        else { p.deathEnergy = {}; next.phase = 'end'; next.combat = null; tx.emit('death.closed','Death energy expires.'); }
      } else if (!next.outcome && next.phase === 'end') {
        tx.emit('turn.ended',`${p.name} ends their turn.`,{player:envelope.actor}); tx.drain();
        if (!next.outcome) {
          // Damage clears globally; only the ending controller's field cards ready.
          for (const card of Object.values(next.cards)) if (card.zone === 'board') { card.damage = 0; if (card.controller === next.active) card.exhausted = false; }
          for (const id of ['p1','p2'] as PlayerId[]) { next.players[id].energy = {}; next.players[id].deathEnergy = {}; }
          next.active = other(next.active); next.turn++; next.phase = 'draw';
          tx.emit('turn.started',`${next.players[next.active].name} begins turn ${next.turn}.`,{player:next.active}); tx.drain();
          tx.checkOutcome();
          if (!next.outcome) {
            const drawn = tx.draw(next.active,2,'choice');
            if (!next.outcome) {
              if (drawn.length === 2) next.pending = {id:`choice-${next.sequence}`,player:next.active,kind:'draw',options:drawn};
              else { if (drawn[0]) { next.cards[drawn[0]].zone = 'hand'; next.players[next.active].hand.push(drawn[0]); } next.phase = 'play'; }
            }
          }
        }
      }
    }
    tx.drain(); tx.checkOutcome(); next.revision++; assertInvariants(next);
    return { state:next,events:next.events.slice(state.events.length) };
  } catch (error) { return {state,events:[],error:error instanceof Error ? error.message : 'Invalid command.'}; }
}
export function assertInvariants(state: GameState) {
  const located = new Set<string>();
  for (const id of ['p1','p2'] as PlayerId[]) {
    const p = state.players[id]; requireRule(p.board.length === 5,'Board must have exactly five slots.');
    for (const [zone,ids] of [['deck',p.deck],['hand',p.hand],['board',p.board],['discard',p.discard]] as const) {
      for (const cid of ids) if (cid) {
        requireRule(!located.has(cid),`Duplicate zone membership: ${cid}`); located.add(cid);
        requireRule(state.cards[cid]?.zone === zone,`Incorrect zone: ${cid}`);
        requireRule(zone === 'board' ? state.cards[cid].controller === id && p.board[state.cards[cid].slot!] === cid : state.cards[cid].owner === id,'Incorrect owner or slot.');
      }
    }
    for (const pool of [p.energy,p.deathEnergy]) for (const value of Object.values(pool)) requireRule(Number.isInteger(value) && value >= 0,'Negative or fractional energy.');
  }
  if (state.pending?.kind === 'draw') for (const id of state.pending.options) { requireRule(!located.has(id) && state.cards[id].zone === 'choice','Invalid draw choice.'); located.add(id); }
  requireRule(located.size === Object.keys(state.cards).length,'A card is missing from its zone.');
}
export function projectForPlayer(state: GameState, viewer: PlayerId | null, registry: Registry): PlayerView {
  const publicIds = (['p1','p2'] as PlayerId[]).flatMap(p => [...state.players[p].board,...state.players[p].discard]).filter((id): id is string => !!id);
  const hand = viewer ? [...state.players[viewer].hand] : [];
  const pending = state.pending?.player === viewer ? structuredClone(state.pending) : null;
  if (pending?.kind === 'draw') publicIds.push(...pending.options);
  const cards = Object.fromEntries([...publicIds,...hand].map(id => [id,structuredClone(state.cards[id])]));
  const players = Object.fromEntries((['p1','p2'] as PlayerId[]).map(id => {
    const {deck,hand,...p} = structuredClone(state.players[id]);
    return [id,{...p,deckCount:deck.length,handCount:hand.length}];
  })) as PlayerView['players'];
  const legal = legalActions(state,registry);
  return { rulesVersion:state.rulesVersion,contentVersion:state.contentVersion,revision:state.revision,turn:state.turn,active:state.active,phase:state.phase,players,cards,hand,pending,combat:state.combat ? structuredClone(state.combat) : null,outcome:state.outcome,outcomeReason:state.outcomeReason,
    events:state.events.filter(e => e.visibility === 'public' || e.visibility === viewer).map(e => structuredClone(e)),
    legal: viewer === legal.actor ? legal : {actor:legal.actor,playable:[],energy:[],activations:[],attackers:[],lanes:{},canEnd:false} };
}
export const projectForSpectator = (state: GameState, registry: Registry) => projectForPlayer(state,null,registry);
export function replay(initial: GameState, commands: CommandEnvelope[], registry: Registry): GameState {
  requireRule(initial.rulesVersion === RULES_VERSION,'Rules version differs from this engine.');
  requireRule(initial.contentVersion === registry.version,'Content version differs from this registry.');
  return commands.reduce((state,envelope) => { const result = apply(state,envelope,registry); if (result.error) throw new Error(result.error); return result.state; },structuredClone(initial));
}
