import { describe, expect, it } from 'vitest';
import { resolveDrop, resolveLaneDrop } from '../apps/web/src/cardInteraction';
import type { GameState, PlayerId } from '../packages/contracts/src';
import { apply, createMatch, projectForPlayer } from '../packages/core/src';
import { registry, starterDecks } from './fixtures/content';

function setup() {
  const state=createMatch(registry,[starterDecks.verdant,starterDecks.hollow],731);
  for(const player of Object.values(state.players)) {
    for(const id of player.hand){state.cards[id].zone='deck';player.deck.push(id);}
    player.hand=[];
  }
  return state;
}
function card(state:GameState, definition:string, owner:PlayerId, slot?:number) {
  const id=state.players[owner].deck.find(id=>state.cards[id].definitionId===definition)!;
  if(!id)throw new Error(`Missing fixture ${definition}`);
  state.players[owner].deck=state.players[owner].deck.filter(x=>x!==id);
  state.cards[id].zone=slot===undefined?'hand':'board';state.cards[id].slot=slot??null;
  if(slot===undefined)state.players[owner].hand.push(id);else state.players[owner].board[slot]=id;
  return id;
}
const view=(state:GameState,viewer:PlayerId='p1')=>projectForPlayer(state,viewer,registry);
describe('hand-to-battlefield gestures',()=>{
  it('deploys to the chosen free slot through an accepted engine command',()=>{
    const state=setup(),id=card(state,'forest-sprite','p1');
    const drop=resolveDrop(view(state),'p1',registry,id,{player:'p1',slot:4});
    expect(drop).toEqual({cardId:id,slot:4});
    const result=apply(state,{actor:'p1',expectedRevision:0,command:{type:'play',...drop!}},registry);
    expect(result.error).toBeUndefined();expect(result.state.players.p1.board[4]).toBe(id);
  });
  it('rejects occupied, hostile, out-of-range and off-board drops without mutating state',()=>{
    const state=setup(),id=card(state,'forest-sprite','p1');card(state,'crown-recruit','p1',0);
    const before=structuredClone(state),projection=view(state);
    for(const zone of [{player:'p1' as const,slot:0},{player:'p2' as const,slot:1},{player:'p1' as const,slot:9},null])expect(resolveDrop(projection,'p1',registry,id,zone)).toBeNull();
    expect(state).toEqual(before);
  });
  it('cannot bypass colored costs, active player or phase',()=>{
    const state=setup(),id=card(state,'grove-keeper','p1');
    expect(resolveDrop(view(state),'p1',registry,id,{player:'p1',slot:0})).toBeNull();
    state.players.p1.energy={elderwood:1};state.active='p2';
    expect(resolveDrop(view(state),'p1',registry,id,{player:'p1',slot:0})).toBeNull();
    state.active='p1';state.phase='end';
    expect(resolveDrop(view(state),'p1',registry,id,{player:'p1',slot:0})).toBeNull();
  });
  it('only moves hand cards; hidden cards are unavailable to a gesture',()=>{
    const state=setup(),board=card(state,'forest-sprite','p1',0),hidden=card(state,'ashen-initiate','p2');
    for(const id of [board,hidden,'missing'])expect(resolveDrop(view(state),'p1',registry,id,{player:'p1',slot:1})).toBeNull();
  });
  it('drops Consume onto a friendly victim on a full board, preserving the extra target choice',()=>{
    const state=setup();state.active='p2';
    for(let i=0;i<5;i++)card(state,i<3?'ashen-initiate':'wayfarer','p2',i);
    const id=card(state,'hollow-devourer','p2'),target=card(state,'forest-sprite','p1',0),victim=state.players.p2.board[3]!;
    state.players.p2.energy={ashen:1,neutral:1};
    const projection=view(state,'p2'),drop=resolveDrop(projection,'p2',registry,id,{player:'p2',slot:3});
    expect(drop).toEqual({cardId:id,slot:3,consume:victim});
    expect(projection.legal.playable.find(a=>a.cardId===id)?.requiresTarget).toBe(true);
    const result=apply(state,{actor:'p2',expectedRevision:0,command:{type:'play',...drop!,target}},registry);
    expect(result.error).toBeUndefined();expect(result.state.players.p2.board[3]).toBe(id);expect(result.state.players.p2.discard).toContain(victim);
  });
  it('does not guess a Consume victim on an empty or opposing slot',()=>{
    const state=setup();state.active='p2';card(state,'ashen-initiate','p2',0);
    const id=card(state,'hollow-devourer','p2');state.players.p2.energy={ashen:1,neutral:1};
    for(const zone of [{player:'p2' as const,slot:1},{player:'p1' as const,slot:0}])expect(resolveDrop(view(state,'p2'),'p2',registry,id,zone)).toBeNull();
  });
  it('targets spells by creature or opponent avatar and rejects invalid targets',()=>{
    const state=setup(),id=card(state,'cleansing-light','p1'),enemy=card(state,'ashen-initiate','p2',0);card(state,'forest-sprite','p1',0);
    state.players.p1.energy={crownlands:1,neutral:1};const projection=view(state);
    expect(resolveDrop(projection,'p1',registry,id,{player:'p2',slot:0})).toEqual({cardId:id,target:enemy});
    expect(resolveDrop(projection,'p1',registry,id,{player:'p2'})).toEqual({cardId:id,target:'p2'});
    for(const zone of [{player:'p1' as const,slot:0},{player:'p2' as const,slot:1},{player:'p1' as const}])expect(resolveDrop(projection,'p1',registry,id,zone)).toBeNull();
  });
  it('allows a targetless death-window spell on the viewer’s battlefield',()=>{
    const state=setup(),id=card(state,'final-bargain','p2');state.phase='attack';state.combat={stage:'death',attackers:[],lanes:{},blocks:[],dead:[]};state.players.p2.deathEnergy={ashen:1};
    const projection=view(state,'p2');
    expect(resolveDrop(projection,'p2',registry,id,{player:'p2',slot:2})).toEqual({cardId:id});
    expect(resolveDrop(projection,'p2',registry,id,{player:'p1',slot:2})).toBeNull();
  });
});

describe('attacker-to-lane gestures',()=>{
  function declare() {
    const state=setup();state.phase='attack';state.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};
    return state;
  }
  it('accepts only enemy-row lanes the engine lists for that attacker',()=>{
    const state=declare(),a=card(state,'forest-sprite','p1',1);card(state,'clan-scout','p2',1);
    const v=view(state);
    expect(resolveLaneDrop(v,'p1',a,{player:'p2',slot:1},[],{})).toBe(1);   // own lane, occupied
    expect(resolveLaneDrop(v,'p1',a,{player:'p2',slot:0},[],{})).toBe(0);   // adjacent, open
    expect(resolveLaneDrop(v,'p1',a,{player:'p2',slot:3},[],{})).toBeNull(); // two lanes away
    expect(resolveLaneDrop(v,'p1',a,{player:'p1',slot:1},[],{})).toBeNull(); // own row
    expect(resolveLaneDrop(v,'p1',a,{player:'p2'},[],{})).toBeNull();        // the player avatar is not a lane
    expect(resolveLaneDrop(v,'p1',a,null,[],{})).toBeNull();
  });
  it('rejects a lane another attacker holds, but lets an attacker re-target its own',()=>{
    const state=declare(),a=card(state,'forest-sprite','p1',1),b=card(state,'wild-guardian','p1',2);
    const v=view(state);
    expect(resolveLaneDrop(v,'p1',a,{player:'p2',slot:2},[b],{[b]:2})).toBeNull();
    expect(resolveLaneDrop(v,'p1',b,{player:'p2',slot:2},[b],{[b]:2})).toBe(2);
    const declared=apply(state,{actor:'p1',expectedRevision:0,command:{type:'attack',attackers:[a,b],lanes:{[a]:0,[b]:2}}},registry);
    expect(declared.error).toBeUndefined();expect(declared.state.combat?.lanes).toEqual({[a]:0,[b]:2});
  });
  it('offers nothing outside the declare stage or to exhausted cards',()=>{
    const state=declare(),a=card(state,'forest-sprite','p1',1);state.cards[a].exhausted=true;
    expect(resolveLaneDrop(view(state),'p1',a,{player:'p2',slot:1},[],{})).toBeNull();
    const play=setup(),b=card(play,'forest-sprite','p1',1);
    expect(resolveLaneDrop(view(play),'p1',b,{player:'p2',slot:1},[],{})).toBeNull();
  });
});
