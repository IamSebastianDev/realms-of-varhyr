import * as v from 'valibot';
import type { Command, GameState, PlayerId, PlayerView } from '../../contracts/src';
import { parseCommand } from '../../core/src';
import type { combatForecast } from '../../core/src/combatForecast';

export const NETWORK_VERSION = 1;
export type MatchDeck = { name: string; cards: string[] };
export type MatchAction = { id: string; revision: number; intent: { kind: 'command'; command: Command } | { kind: 'undo-channel'; cardId: string } };
export type Hello = { type: 'hello'; version: number; rules: string; content: string; token: string; name: string; avatar?: string; cardBack?: string; deck: MatchDeck };
export type MatchSnapshot = { type: 'snapshot'; version: number; matchId: string; seat: PlayerId; view: PlayerView; undoable: string[]; forecast: ReturnType<typeof combatForecast>; ack?: string; error?: string };
export type AttackPreview = { attackers: string[]; lanes: Record<string, number> };
export type Forecast = MatchSnapshot['forecast'];
export type HostMessage = MatchSnapshot | { type: 'reject'; message: string } | { type: 'ping' } | { type: 'preview'; id: string; forecast: Forecast };
export type ClientMessage = Hello | { type: 'action'; action: MatchAction } | { type: 'preview'; id: string; draft: AttackPreview } | { type: 'pong' };
const text = v.pipe(v.string(), v.minLength(1), v.maxLength(200));
const number = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER));
const zoneCount = v.pipe(number, v.maxValue(10000));
const seat = v.picklist(['p1', 'p2']);
const pool = v.record(text, number);
const entity = v.object({ id:text,definitionId:text,owner:seat,controller:seat,zone:v.picklist(['deck','hand','board','discard','choice']),slot:v.nullable(number),exhausted:v.boolean(),damage:number,attackBonus:v.optional(number),defenseBonus:v.optional(number) });
const dead = v.object({card:entity,outputs:v.array(pool)});
const pending = v.variant('kind',[
  v.object({id:text,player:seat,kind:v.literal('draw'),options:v.array(text)}),
  v.object({id:text,player:seat,kind:v.literal('mulligan'),options:v.array(text),max:number}),
  v.object({id:text,player:seat,kind:v.literal('response-energy'),options:v.array(pool),sourceName:v.string(),remaining:v.array(dead)}),
]);
const avatarId = v.optional(v.pipe(v.string(),v.maxLength(64)));
const player = v.object({id:seat,name:v.string(),avatar:avatarId,cardBack:avatarId,life:v.number(),board:v.pipe(v.array(v.nullable(text)),v.length(5)),discard:v.array(text),energy:pool,responseEnergy:pool,deckCount:zoneCount,handCount:zoneCount});
const event = v.object({seq:number,type:text,message:v.string(),abilityId:v.optional(text),effects:v.optional(v.array(v.object({abilityId:text,cardId:text,target:v.optional(text)}))),player:v.optional(seat),cardId:v.optional(text),target:v.optional(text),amount:v.optional(v.number()),visibility:v.picklist(['public','p1','p2']),snapshot:v.optional(entity)});
const legal = v.object({actor:seat,playable:v.array(v.object({cardId:text,slots:v.array(number),targets:v.array(text),consumes:v.array(text),requiresTarget:v.boolean(),slotTargets:v.optional(v.record(text,v.array(text)))})),energy:v.array(v.object({cardId:text,options:v.array(pool)})),activations:v.array(v.object({cardId:text,ability:number,targets:v.array(text),requiresTarget:v.boolean(),slots:v.optional(v.array(number)),energyOptions:v.optional(v.array(pool))})),attackers:v.array(text),lanes:v.record(text,v.array(number)),canEnd:v.boolean()});
const view = v.object({rulesVersion:text,contentVersion:text,revision:number,turn:number,active:seat,phase:v.picklist(['draw','play','attack','end']),players:v.object({p1:player,p2:player}),cards:v.record(text,entity),hand:v.array(text),pending:v.nullable(pending),combat:v.nullable(v.object({stage:v.picklist(['declare','review','response']),attackers:v.array(text),lanes:v.record(text,number),blocks:v.array(v.object({attacker:text,blocker:text})),dead:v.array(dead)})),outcome:v.nullable(v.picklist(['p1','p2','draw'])),outcomeReason:v.nullable(v.picklist(['life','empty-library','concede'])),responseStep:v.optional(v.nullable(seat)),events:v.array(event),legal});
const forecast = v.nullable(v.object({defender:seat,blocked:number,lifeDamage:v.number(),attackersFallen:number,fallen:number}));
const snapshotSchema = v.object({type:v.literal('snapshot'),version:v.literal(NETWORK_VERSION),matchId:text,seat,view,undoable:v.array(text),forecast,ack:v.optional(text),error:v.optional(v.string())});
const previewSchema = v.object({id:text,draft:v.object({attackers:v.pipe(v.array(text),v.maxLength(5)),lanes:v.record(text,v.pipe(number,v.maxValue(4)))})});
const helloSchema = v.object({type:v.literal('hello'),version:number,rules:text,content:text,token:text,name:v.pipe(v.string(),v.minLength(1),v.maxLength(40)),avatar:avatarId,cardBack:avatarId,deck:v.object({name:v.pipe(v.string(),v.minLength(1),v.maxLength(60)),cards:v.array(text)})});
const actionSchema = v.object({id:text,revision:number,intent:v.variant('kind',[
  v.object({kind:v.literal('command'),command:v.unknown()}),v.object({kind:v.literal('undo-channel'),cardId:text}),
])});

/** Drop unknown fields, assign actors at the host, and let the engine validate all command data. */
export function parseClientMessage(input: unknown): ClientMessage {
  if (!input || typeof input !== 'object') throw new Error('Invalid multiplayer message.');
  const type = (input as {type?:unknown}).type;
  if (type === 'hello') return v.parse(helloSchema,input);
  if (type === 'pong') return {type:'pong'};
  if (type === 'preview') return {type:'preview',...v.parse(previewSchema,input)};
  if (type !== 'action') throw new Error('Unknown multiplayer message.');
  const action = v.parse(actionSchema,(input as {action?:unknown}).action);
  return {type:'action',action:{...action,intent:action.intent.kind==='command'?{kind:'command',command:parseCommand(action.intent.command)}:action.intent}};
}
export function parseHostMessage(input: unknown): HostMessage {
  if (!input || typeof input !== 'object') throw new Error('Invalid host message.');
  const type = (input as {type?:unknown}).type;
  if (type === 'snapshot') return v.parse(snapshotSchema,input);
  if (type === 'ping') return {type:'ping'};
  if (type === 'preview') return v.parse(v.object({type:v.literal('preview'),id:text,forecast}),input);
  if (type === 'reject') return v.parse(v.object({type:v.literal('reject'),message:v.string()}),input);
  throw new Error('Unknown host message.');
}

/** Presentation-only state for existing public board helpers. Never run engine commands on it.
 * Hidden libraries contain count placeholders, never card IDs, definitions, RNG or shuffle seed.
 */
export function presentationState(snapshot: MatchSnapshot): GameState {
  const p = snapshot.view;
  return {...p,seed:0,rng:0,sequence:p.events.at(-1)?.seq??0,players:{
    p1:{...p.players.p1,deck:Array.from({length:p.players.p1.deckCount},(_,i)=>`hidden-p1-${i}`),hand:snapshot.seat==='p1'?[...p.hand]:[]},
    p2:{...p.players.p2,deck:Array.from({length:p.players.p2.deckCount},(_,i)=>`hidden-p2-${i}`),hand:snapshot.seat==='p2'?[...p.hand]:[]},
  }};
}
