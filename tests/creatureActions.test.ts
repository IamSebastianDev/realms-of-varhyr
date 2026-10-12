import { describe, expect, it } from 'vitest';
import { creatureActions, undoChannel, undoableChannels } from '../apps/web/src/creatureActions';
import type { AbilityExtension, Command, CommandEnvelope, GameState, Registry } from '../packages/contracts/src';
import { apply, createMatch, projectForPlayer, replay } from '../packages/core/src';
import raw, { abilities, compileContent, registry, starterDecks } from './fixtures/content';
import { compatibleMatch, restoreSession, type SavedSession } from './fixtures/session';

function accept(state:GameState, command:Command, content:Registry=registry):{state:GameState;envelope:CommandEnvelope} {
  const envelope:CommandEnvelope={actor:'p1',expectedRevision:state.revision,command};
  const result=apply(state,envelope,content);expect(result.error).toBeUndefined();
  return {state:result.state,envelope};
}
// Interaction fixtures must not depend on the opponent's evolving strategy.
function initial():GameState {
  const state=createMatch(registry,[starterDecks.hollow,starterDecks.verdant],4);
  for(const p of Object.values(state.players)){for(const id of p.hand){state.cards[id].zone='deck';p.deck.push(id);}p.hand=[];}
  function move(definitionId:string,owner:'p1'|'p2',slot:number|null){
    const p=state.players[owner],id=p.deck.find(id=>state.cards[id].definitionId===definitionId)!;
    p.deck=p.deck.filter(cid=>cid!==id);Object.assign(state.cards[id],{zone:slot===null?'hand':'board',slot,exhausted:false});
    if(slot===null)p.hand.push(id);else p.board[slot]=id;
  }
  move('wayfarer','p1',0);move('hollow-devourer','p1',1);move('ashen-initiate','p1',2);move('final-bargain','p1',null);
  move('forest-sprite','p2',0);move('crown-recruit','p2',1);return state;
}
const idAt=(state:GameState,slot:number)=>state.players.p1.board[slot]!;
describe('direct creature actions and reversible channel planning',()=>{
  it('clicking a single producer channels; clicking it again selects undo',()=>{
    const before=initial(),id=idAt(before,0),view=projectForPlayer(before,'p1',registry);
    expect(creatureActions(view,id,[],[])).toEqual([{kind:'channel',option:0,output:{neutral:1}}]);
    const channel=accept(before,{type:'energy',cardId:id,option:0});
    const ids=undoableChannels([channel.envelope],'p1');
    expect(creatureActions(projectForPlayer(channel.state,'p1',registry),id,ids,[])).toEqual([{kind:'undo-channel'}]);
    const undone=undoChannel(before,[channel.envelope],'p1',id,registry)!;
    expect(undone.commands).toEqual([]);expect(undone.state).toEqual(before);
  });
  it('accumulates several producers and independently undoes/rechannels either one',()=>{
    const before=initial(),commands:CommandEnvelope[]=[];let state=before;
    const one=idAt(state,0),two=idAt(state,2);
    for(const id of [one,two]){
      const actions=creatureActions(projectForPlayer(state,'p1',registry),id,undoableChannels(commands,'p1'),[]);
      expect(actions).toHaveLength(1);expect(actions[0].kind).toBe('channel');
      const result=accept(state,{type:'energy',cardId:id,option:0});state=result.state;commands.push(result.envelope);
    }
    expect(state.players.p1.energy).toMatchObject({neutral:1,ashen:1});
    const undone=undoChannel(before,commands,'p1',one,registry)!;
    expect(undone.state.players.p1.energy.neutral??0).toBe(0);expect(undone.state.players.p1.energy.ashen).toBe(1);
    const again=accept(undone.state,{type:'energy',cardId:one,option:0});
    expect(again.state.players.p1.energy).toMatchObject({neutral:1,ashen:1});
    expect(replay(before,[...undone.commands,again.envelope],registry)).toEqual(again.state);
  });
  it('offers one inline action per legal dual output, never both at once',()=>{
    const before=initial(),id=idAt(before,1);
    expect(creatureActions(projectForPlayer(before,'p1',registry),id,[],[])).toEqual([
      {kind:'channel',option:0,output:{ashen:1}},{kind:'channel',option:1,output:{clans:1}},
    ]);
  });
  it('undoes an earlier producer while preserving and rebasing a later channel',()=>{
    const before=initial(),one=idAt(before,0),two=idAt(before,2);
    const first=accept(before,{type:'energy',cardId:one,option:0}),second=accept(first.state,{type:'energy',cardId:two,option:0});
    const undone=undoChannel(before,[first.envelope,second.envelope],'p1',one,registry)!;
    expect(undone.state).toEqual(accept(before,second.envelope.command).state);
    expect(undone.state.cards[one].exhausted).toBe(false);expect(undone.state.cards[two].exhausted).toBe(true);
    expect(undone.commands[0].expectedRevision).toBe(before.revision);
    expect(replay(before,undone.commands,registry)).toEqual(undone.state);
  });
  it('locks all channel choices after a play, including excess energy',()=>{
    const before=initial(),one=accept(before,{type:'energy',cardId:idAt(before,1),option:0});
    const spell=before.players.p1.hand.find(id=>before.cards[id].definitionId==='final-bargain')!;
    const two=accept(one.state,{type:'energy',cardId:idAt(before,2),option:0}),play=accept(two.state,{type:'play',cardId:spell});
    expect(play.state.players.p1.energy.ashen).toBe(1);
    const commands=[one.envelope,two.envelope,play.envelope];
    expect(undoableChannels(commands,'p1')).toEqual([]);
    expect(undoChannel(before,commands,'p1',idAt(before,1),registry)).toBeNull();
  });
  it('locks channels on leaving Play and never offers another actor’s undo',()=>{
    const before=initial(),id=idAt(before,0),channel=accept(before,{type:'energy',cardId:id,option:0}),end=accept(channel.state,{type:'end'});
    expect(undoableChannels([channel.envelope],'p2')).toEqual([]);
    expect(undoChannel(before,[channel.envelope,end.envelope],'p1',id,registry)).toBeNull();
    expect(creatureActions(projectForPlayer(channel.state,'p2',registry),id,[],[])).toEqual([]);
  });
  it('undo restores channel-trigger damage, draws and the exact event/RNG history',()=>{
    const hook:AbilityExtension={id:'channel-test',name:'channel-test',description:'Test the energy generation hook.',version:1,validate:()=>{},hooks:{'energy.generated':ctx=>{
      if(ctx.event.cardId===ctx.source.id){ctx.issue({type:'damage',target:'p1',amount:1});ctx.issue({type:'draw',player:'p1',amount:1});}
    }}};
    const cards=structuredClone(raw);cards.find(c=>c.id==='forest-sprite')!.abilities=[{id:hook.id,params:{}}];
    const content=compileContent(cards,{...abilities,[hook.id]:hook}),before=createMatch(content,[starterDecks.verdant,starterDecks.hollow],731);
    const id=Object.keys(before.cards).find(id=>before.cards[id].owner==='p1'&&before.cards[id].definitionId==='forest-sprite')!;
    before.players.p1.hand=before.players.p1.hand.filter(x=>x!==id);before.players.p1.deck=before.players.p1.deck.filter(x=>x!==id);
    before.players.p1.board[0]=id;before.cards[id].zone='board';before.cards[id].slot=0;before.cards[id].exhausted=false;
    const channel=accept(before,{type:'energy',cardId:id,option:0},content);
    expect(channel.state.players.p1.life).toBe(9);expect(channel.state.players.p1.hand.length).toBe(before.players.p1.hand.length+1);
    expect(undoChannel(before,[channel.envelope],'p1',id,content)?.state).toEqual(before);
  });
  it('an attacker is offered its own and adjacent lanes, never one another attacker already claimed',()=>{
    const before=initial(),combat=accept(before,{type:'end'}).state,id=idAt(combat,1),view=projectForPlayer(combat,'p1',registry);
    const other=idAt(combat,2);
    expect(creatureActions(view,id,[],[])).toEqual([0,1,2].map(lane=>({kind:'attack',lane,current:false})));
    expect(creatureActions(view,id,[],[other],{[other]:2})).toEqual([0,1].map(lane=>({kind:'attack',lane,current:false})));
    expect(creatureActions(view,id,[],[id],{[id]:1})).toEqual([{kind:'attack',lane:0,current:false},{kind:'attack',lane:1,current:true},{kind:'attack',lane:2,current:false},{kind:'withdraw'}]);
    expect(creatureActions(view,idAt(combat,0),[],[])).toEqual([0,1].map(lane=>({kind:'attack',lane,current:false})));
  });
});

describe('session compatibility during engine updates',()=>{
  function saved():SavedSession{return {initial:initial(),commands:[],mode:'hotseat',deck:'hollow',skirmish:false};}
  it('restores an existing session with energy from multiple creatures intact',()=>{
    const session=saved();let state=session.initial;
    for(const slot of [0,2]){const result=accept(state,{type:'energy',cardId:idAt(state,slot),option:0});session.commands.push(result.envelope);state=result.state;}
    const restored=restoreSession(JSON.parse(JSON.stringify(session)));
    expect(restored).toEqual(session);expect(replay(restored.initial,restored.commands,registry).players.p1.energy).toMatchObject({neutral:1,ashen:1});
  });
  it.each(['rulesVersion','contentVersion'] as const)('restarts stale %s while retaining the selected match setup',key=>{
    const session=saved(),channel=accept(session.initial,{type:'energy',cardId:idAt(session.initial,0),option:0});session.commands.push(channel.envelope);session.initial[key]='previous-version';
    expect(compatibleMatch(session.initial)).toBe(false);
    const restored=restoreSession(session);expect(compatibleMatch(restored.initial)).toBe(true);expect(restored.commands).toEqual([]);
    expect(restored.initial.seed).toBe(session.initial.seed);expect(restored.mode).toBe('hotseat');expect(restored.deck).toBe('hollow');expect(restored.skirmish).toBe(false);expect(restored.initial.players.p1.name).toBe('The Hollow Court');
  });
});

