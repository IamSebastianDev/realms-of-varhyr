import type { CommandEnvelope, GameState, PlayerId, Registry } from '../../contracts/src';
import { apply, createMatch, decisionPlayer, projectForPlayer, RULES_VERSION, validateDeck } from '../../core/src';
import { undoChannel, undoableChannels } from '../../core/src/channelUndo';
import { combatForecast, type AttackDraft } from '../../core/src/combatForecast';
import { NETWORK_VERSION, type Hello, type MatchAction, type MatchDeck, type MatchSnapshot } from './protocol';

/** Browser host today, server worker later. No sockets, browser APIs or React dependencies. */
export class MatchAuthority {
  private initial: GameState;
  private state: GameState;
  private commands: CommandEnvelope[] = [];
  private revision = 0;
  private accepted = new Map<string, { serialized: string; error?: string }>();
  constructor(registry: Registry, matchId: string, start: GameState);
  constructor(registry: Registry, matchId: string, decks: [MatchDeck,MatchDeck], names: [string,string], seed: number, avatars?: [string|undefined,string|undefined], backs?: [string|undefined,string|undefined], draft?: boolean);
  constructor(private registry: Registry, readonly matchId: string, start: GameState|[MatchDeck,MatchDeck], names?: [string,string], seed?: number, avatars?: [string|undefined,string|undefined], backs?: [string|undefined,string|undefined], draft?: boolean) {
    if(Array.isArray(start)){
      this.initial = createMatch(registry,[start[0].cards,start[1].cards],seed!,{mulligan:true,draft});
      this.initial.players.p1.name=names![0];this.initial.players.p2.name=names![1];
      if(avatars?.[0])this.initial.players.p1.avatar=avatars[0];if(avatars?.[1])this.initial.players.p2.avatar=avatars[1];
      if(backs?.[0])this.initial.players.p1.cardBack=backs[0];if(backs?.[1])this.initial.players.p2.cardBack=backs[1];
    }else this.initial = structuredClone(start);
    this.state=structuredClone(this.initial);
  }
  /** Host-side access for seats that run inside the authority's own process (a bot, the tutorial script). Never sent to a client. */
  get fullState(): GameState { return this.state; }
  get log(): readonly CommandEnvelope[] { return this.commands; }
  /** What the next combat would do for `seat`'s draft attack, computed on a disposable copy of the real state. */
  forecast(seat: PlayerId, draft: AttackDraft|null): MatchSnapshot['forecast'] {
    if(decisionPlayer(this.state)!==seat)return null;
    return combatForecast(this.state,draft,this.registry);
  }
  static validateHello(hello: Hello, registry: Registry) {
    if (hello.version !== NETWORK_VERSION || hello.rules !== RULES_VERSION || hello.content !== registry.version) throw new Error('Rules or card content differs. Both players must use the same game build.');
    const errors = validateDeck(hello.deck.cards,registry);
    if (errors.length) throw new Error(errors.join(' '));
  }
  snapshot(seat: PlayerId, ack?: string, error?: string): MatchSnapshot {
    const view=projectForPlayer(this.state,seat,this.registry);
    // Wire revisions are monotonic even when channel undo rewinds the engine's command log.
    view.revision=this.revision;
    return {type:'snapshot',version:NETWORK_VERSION,matchId:this.matchId,seat,view,
      undoable:decisionPlayer(this.state)===seat&&this.state.phase==='play'?undoableChannels(this.commands,seat):[],
      forecast:combatForecast(this.state,null,this.registry),...(ack?{ack}:{}),...(error?{error}:{})};
  }
  act(seat: PlayerId, action: MatchAction): MatchSnapshot {
    const key=`${seat}:${action.id}`,serialized=JSON.stringify(action.intent),previous=this.accepted.get(key);
    if(previous)return this.snapshot(seat,action.id,previous.serialized===serialized?previous.error:'This action ID was already used for a different move.');
    let error: string|undefined;
    if(action.revision!==this.revision)error='The match advanced. Review the refreshed board and try again.';
    else if(decisionPlayer(this.state)!==seat&&!(action.intent.kind==='command'&&(action.intent.command as {type?:unknown})?.type==='concede'))error='Wait for your decision.';
    else if(this.state.outcome)error='This match has ended.';
    else if(action.intent.kind==='undo-channel'){
      const undone=undoChannel(this.initial,this.commands,seat,action.intent.cardId,this.registry);
      if(!undone)error='This energy is committed and cannot be undone.';
      else {this.state=undone.state;this.commands=undone.commands;this.revision++;}
    }else{
      const envelope:CommandEnvelope={actor:seat,expectedRevision:this.state.revision,command:action.intent.command,clientActionId:action.id};
      const result=apply(this.state,envelope,this.registry);
      if(result.error)error=result.error;
      else {this.state=result.state;this.commands.push(envelope);this.revision++;}
    }
    this.accepted.set(key,{serialized,error});
    return this.snapshot(seat,action.id,error);
  }
}
