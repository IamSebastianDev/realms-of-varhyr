import { describe, expect, it } from 'vitest';
import { registry, starterDefinitions } from '../packages/content/src';
import { apply, createMatch, legalActions, projectForPlayer, projectForSpectator, replay } from '../packages/core/src';
import { factionAuras, factionBursts } from '../apps/web/src/factionEffects';
import { battleLog } from '../apps/web/src/logEntries';
import { NETWORK_VERSION, parseHostMessage } from '../packages/multiplayer/src/protocol';
import type { Command, GameState, PlayerId } from '../packages/contracts/src';

const deck=starterDefinitions[0].cards;
function setup(){return createMatch(registry,[deck,deck],731);}
function place(state:GameState,definitionId:string,side:PlayerId='p1',slot?:number){
  const p=state.players[side],id=p.deck.pop()!;
  Object.assign(state.cards[id],{definitionId,zone:slot===undefined?'hand':'board',slot:slot??null,exhausted:false});
  if(slot===undefined)p.hand.push(id);else p.board[slot]=id;return id;
}
function transition(state:GameState,command:Command){
  const envelope={actor:state.active,expectedRevision:state.revision,command},result=apply(state,envelope,registry);
  expect(result.error).toBeUndefined();
  expect(replay(state,[envelope],registry)).toEqual(result.state);
  const events=result.state.events.filter(e=>e.seq>state.sequence);
  const effects=factionBursts(state,result.state,events,registry,'test');
  // Remote clients get the same effect attribution without the source's private hand or library.
  const spectator=projectForSpectator(result.state,registry);
  const remote=factionBursts(projectForSpectator(state,registry),spectator,spectator.events.filter(e=>e.seq>state.sequence),registry,'test');
  expect(remote).toEqual(effects);
  return {after:result.state,events,effects};
}

describe('faction ability visual cues',()=>{
  it('uses the real Fealty and Sanctuary modifiers, including exhausted sources, elf bonus and creature-only targets',()=>{
    const state=setup(),alderic=place(state,'aldric-runewarden','p1',0),queen=place(state,'ilyria-queen-of-the-elves','p1',2);
    const elf=place(state,'ilyria-queen-of-the-elves','p1',1),bastion=place(state,'crown-bastion','p1',3),enemy=place(state,'crown-recruit','p2',0);
    state.cards[alderic].exhausted=state.cards[queen].exhausted=true;
    const cues=factionAuras(projectForPlayer(state,'p1',registry),registry);
    const fealty=cues.find(a=>a.kind==='fealty')!,sanctuary=cues.find(a=>a.kind==='sanctuary'&&a.source.slot===2)!;
    expect(fealty.buffs.map(b=>b.id)).toEqual([alderic,elf,queen]);
    expect(fealty.buffs.every(b=>b.attack===1&&b.defense===1)).toBe(true);
    expect(sanctuary.buffs).toEqual([{id:elf,spot:{player:'p1',slot:1},attack:0,defense:2}]);
    expect(cues.flatMap(c=>c.buffs.map(b=>b.id))).not.toContain(bastion);
    expect(cues.flatMap(c=>c.buffs.map(b=>b.id))).not.toContain(enemy);
  });
  it('reflects Raid stacking, omits inactive bonuses, and disappears when the source leaves play',()=>{
    const state=setup(),brut=place(state,'brut-chief-of-the-harpies','p1',2);
    expect(factionAuras(state,registry)[0].buffs).toEqual([]);
    place(state,'crown-recruit','p1',1);place(state,'crown-recruit','p1',3);
    expect(factionAuras(state,registry)[0].buffs[0].attack).toBe(2);
    state.players.p1.board[2]=null;state.cards[brut].zone='hand';state.cards[brut].slot=null;state.players.p1.hand.push(brut);
    expect(factionAuras(state,registry)).toEqual([]);
  });
  it('shows Rally from its source to the chosen deployment position, without a rejected-activation effect',()=>{
    const state=setup(),source=place(state,'bosci-lord-of-seacliffe','p1',2),target=place(state,'morie-grandmistress');
    const {effects}=transition(state,{type:'activate',cardId:source,ability:0,target,slot:4});
    expect(effects).toMatchObject([{kind:'rally',source:{player:'p1',slot:2},to:{player:'p1',slot:4}}]);
    const invalid=apply(state,{actor:'p1',expectedRevision:state.revision,command:{type:'activate',cardId:source,ability:0,target,slot:2}},registry);
    expect(invalid.error).toBeTruthy();expect(factionBursts(state,invalid.state,invalid.state.events.filter(e=>e.seq>state.sequence),registry,'invalid')).toEqual([]);
  });
  it('shows Trade coin sparks to the correct pool, even when ordinary energy output is also generated',()=>{
    const state=setup();state.active='p2';const source=place(state,'dwell-mountain-merchant','p2',1);
    expect(transition(state,{type:'energy',cardId:source,option:0}).effects).toMatchObject([{kind:'trade',source:{player:'p2',slot:1},to:{player:'p2',area:'pool'}}]);
  });
  it('preserves event counts, sequence and later draw-choice IDs when tracing faction effects',()=>{
    const state=setup(),source=place(state,'hekata-lady-of-the-fields'),target=place(state,'crown-bastion','p2',4);
    state.players.p1.energy={neutral:2,'ember-fields':2};
    const untraced={...registry,abilities:Object.fromEntries(Object.entries(registry.abilities).map(([id,a])=>[id,{...a,faction:undefined}]))};
    let traced=state,plain=structuredClone(state);
    for(const command of [{type:'play',cardId:source,slot:4},{type:'end'},{type:'attack',attackers:[]},{type:'end'}] as Command[]){
      const a=apply(traced,{actor:traced.active,expectedRevision:traced.revision,command},registry);
      const b=apply(plain,{actor:plain.active,expectedRevision:plain.revision,command},untraced);
      expect(a.error).toBeUndefined();expect(b.error).toBeUndefined();traced=a.state;plain=b.state;
      expect(traced.sequence).toBe(plain.sequence);
      expect(traced.events.map(({effects,...event})=>event)).toEqual(plain.events);
      expect(traced.pending).toEqual(plain.pending);
    }
    expect(traced.cards[target].damage).toBe(plain.cards[target].damage);
  });
  it('does not mistake unrelated energy gain on a Trader for channeling',()=>{
    const state=setup(),source=place(state,'dwell-mountain-merchant','p1',2);
    const events=[{seq:state.sequence+1,type:'energy.generated',message:'Not inspected.',cardId:source,amount:1,visibility:'public' as const}];
    expect(factionBursts(state,state,events,registry,'gain')).toEqual([]);
  });
  it('shows Scorch at its actual opposite target, including a target destroyed before the final state',()=>{
    const state=setup(),source=place(state,'hekata-lady-of-the-fields'),target=place(state,'crown-recruit','p2',4);state.players.p1.energy={neutral:2,'ember-fields':2};
    const {effects,after,events}=transition(state,{type:'play',cardId:source,slot:4});
    expect(after.cards[target].zone).toBe('discard');
    expect(events.find(e=>e.type==='card.played')?.effects).toContainEqual({abilityId:'scorch',cardId:source,target});
    expect(effects).toMatchObject([{kind:'scorch',source:{player:'p1',slot:4},to:{player:'p2',slot:4}}]);
    expect(battleLog(events,after.cards).some(e=>e.text==='A faction ability resolves.')).toBe(false);
  });
  it('shows Accord frost only for its energy trigger, not for normal channeling or a later spell',()=>{
    const state=setup(),source=place(state,'morie-grandmistress','p1',2),spell=place(state,'cleansing-light'),second=place(state,'cleansing-light');state.players.p1.energy={neutral:2,crownlands:2};
    const {effects,after}=transition(state,{type:'play',cardId:spell,target:'p2'});
    expect(effects).toMatchObject([{kind:'accord',to:{player:'p1',area:'pool'}}]);
    expect(transition(after,{type:'play',cardId:second,target:'p2'}).effects).toEqual([]);
    expect(transition(state,{type:'energy',cardId:source,option:0}).effects).toEqual([]);
  });
  it('shows Soul Harvest from a fallen ally to the priest, without exposing the drawn card',()=>{
    const state=setup(),priest=place(state,'dark-priest-of-run','p2',2),victim=place(state,'crown-recruit','p2',0),spell=place(state,'cleansing-light');state.players.p1.energy={neutral:1,crownlands:1};
    const {effects,events,after}=transition(state,{type:'play',cardId:spell,target:victim});
    expect(effects).toMatchObject([{kind:'soul-harvest',from:{player:'p2',slot:0},to:{player:'p2',slot:2}}]);
    const traced=events.find(e=>e.type==='creature.destroyed')!;
    expect(traced).toMatchObject({cardId:victim,visibility:'public'});
    expect(traced.effects).toContainEqual({cardId:priest,abilityId:'soul-harvest',target:victim});
    expect(traced.effects![0]).not.toHaveProperty('snapshot');
    const snapshot=parseHostMessage({type:'snapshot',version:NETWORK_VERSION,matchId:'effects',seat:'p1',view:projectForPlayer(after,'p1',registry),undoable:[],forecast:null});
    expect(snapshot.type==='snapshot'&&snapshot.view.events.find(e=>e.type==='creature.destroyed')?.effects?.[0].abilityId).toBe('soul-harvest');
    expect(snapshot.type==='snapshot'&&snapshot.view.events.some(e=>e.type==='card.drawn'&&e.player==='p2')).toBe(false);
  });
  it('returns a borrowed friendly creature to its actual owner’s hand',()=>{
    const state=setup(),source=place(state,'the-lonely-wanderer','p1',2),borrowed=place(state,'crown-recruit','p2',1);
    state.players.p2.board[1]=null;state.players.p1.board[1]=borrowed;state.cards[borrowed].controller='p1';
    const {effects}=transition(state,{type:'activate',cardId:source,ability:0,target:borrowed});
    expect(effects[0].to).toEqual({player:'p2',area:'hand'});
  });
  it.each(['self','ally'] as const)('shows the Wayfarer portal for returning %s, including a source that left play',kind=>{
    const state=setup(),source=place(state,'the-lonely-wanderer','p1',2),ally=place(state,'crown-recruit','p1',1);
    const target=kind==='self'?source:ally;
    const action=legalActions(state,registry).activations.find(a=>a.cardId===source)!;
    const {effects}=transition(state,{type:'activate',cardId:source,ability:action.ability,target});
    expect(effects).toMatchObject([{kind:'wayfarer',source:{player:'p1',slot:2},from:{player:'p1',slot:kind==='self'?2:1},to:{player:'p1',area:'hand'}}]);
  });
});
