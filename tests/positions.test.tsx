import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { battlefieldPositions, positionName, positionSlot, areAdjacent, type Command, type GameState, type PlayerId } from '../packages/contracts/src';
import { registry as live } from '../packages/content/src';
import { compileContent, registry as old, starterDecks } from './fixtures/content';
import { apply, assertInvariants, canBlock, createMatch, decisionPlayer, effectiveStats, legalActions, projectForPlayer, replay } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import { creatureActions } from '../apps/web/src/creatureActions';
import { nextPlayStage, resolveDrop } from '../apps/web/src/cardInteraction';
import { CardFacts } from '../packages/ui/src/CardPresentation';
import { BoardPositionLabel } from '../apps/web/src/BoardPositionLabel';

const base=live.cards['crown-recruit'];
const banner={...base,id:'adjacent-test',deckLimitKey:'adjacent-test',abilities:[{id:'adjacent-banner',params:{amount:1}}]};
const evader={...base,id:'evader-test',deckLimitKey:'evader-test',abilities:[{id:'flank-evasion',params:{}}]};
const charger={...base,id:'charge-test',deckLimitKey:'charge-test',abilities:[{id:'charge',params:{amount:4,position:'Center'}}]};
const fort={...live.cards['crown-bulwark'],id:'plain-bulwark',deckLimitKey:'plain-bulwark',abilities:[]};
const r=compileContent(Object.values({...old.cards,...Object.fromEntries(['crown-recruit','crown-bulwark','aldric-runewarden','runeguard'].map(id=>[id,live.cards[id]])),[banner.id]:banner,[evader.id]:evader,[charger.id]:charger,[fort.id]:fort}));
function setup(){
 const state=createMatch(r,[starterDecks.verdant,starterDecks.hollow],731);
 for(const p of Object.values(state.players)){for(const id of p.hand){state.cards[id].zone='deck';p.deck.push(id);}p.hand=[];}
 state.events=[];return state;
}
function card(state:GameState,definitionId:string,side:PlayerId,slot?:number,exhausted=false){
 const p=state.players[side],id=p.deck.pop()!;
 Object.assign(state.cards[id],{definitionId,zone:slot===undefined?'hand':'board',slot:slot??null,exhausted});
 if(slot===undefined)p.hand.push(id);else p.board[slot]=id;return id;
}
function step(state:GameState,command:Command){
 const result=apply(state,{actor:decisionPlayer(state),expectedRevision:state.revision,command},r);
 expect(result.error).toBeUndefined();assertInvariants(result.state);return result.state;
}
function combat(state:GameState,attackers:string[]){state.phase='attack';state.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};}

describe('permanent battlefield positions',()=>{
 it('names the five slots and renders the same names in the UI',()=>{
  expect(battlefieldPositions).toEqual(['Left Flank','Left Wing','Center','Right Wing','Right Flank']);
  battlefieldPositions.forEach((name,slot)=>{
   expect(positionSlot(name)).toBe(slot);expect(positionName(slot)).toBe(name);
   expect(renderToStaticMarkup(<BoardPositionLabel slot={slot}/>)).toContain(name);
  });
  expect(positionName(null)).toBeUndefined();expect(positionName(5)).toBeUndefined();
 });
 it('buffs only immediate friendly neighbors, including bulwarks, while exhausted',()=>{
  const s=setup(),source=card(s,banner.id,'p1',2,true),left=card(s,base.id,'p1',1),right=card(s,fort.id,'p1',3);
  const far=card(s,base.id,'p1',0),enemy=card(s,base.id,'p2',1);
  expect(effectiveStats(s,left,r).attack).toBe(2);expect(effectiveStats(s,right,r).attack).toBe(2);
  for(const id of [source,far,enemy])expect(effectiveStats(s,id,r).attack).toBe(1);
  expect(areAdjacent(s.cards[source],s.cards[left])).toBe(true);expect(areAdjacent(s.cards[left],s.cards[source])).toBe(true);
  expect(areAdjacent(s.cards[source],s.cards[enemy])).toBe(false);
 });
 it('never wraps the flanks or jumps across an empty slot; overlapping banners stack',()=>{
  const s=setup(),source=card(s,banner.id,'p1',0),near=card(s,banner.id,'p1',1),far=card(s,base.id,'p1',2),opposite=card(s,base.id,'p1',4);
  expect(effectiveStats(s,source,r).attack).toBe(2);expect(effectiveStats(s,near,r).attack).toBe(2);
  expect(effectiveStats(s,far,r).attack).toBe(2);expect(effectiveStats(s,opposite,r).attack).toBe(1);
  expect(areAdjacent(s.cards[source],s.cards[opposite])).toBe(false);
  const center=setup(),unit=card(center,base.id,'p1',2);card(center,banner.id,'p1',1);card(center,banner.id,'p1',3);
  expect(effectiveStats(center,unit,r).attack).toBe(3);
 });
 it('requires the UI to choose a position, but a drag supplies it directly',()=>{
  const s=setup(),id=card(s,base.id,'p1'),view=projectForPlayer(s,'p1',r),legal=view.legal.playable.find(x=>x.cardId===id)!;
  expect(nextPlayStage(base,legal,{cardId:id})).toBe('position');
  expect(nextPlayStage(base,{...legal,requiresTarget:true},{cardId:id})).toBe('position');
  expect(nextPlayStage(base,{...legal,requiresTarget:true},{cardId:id,slot:3})).toBe('target');
  const drop=resolveDrop(view,'p1',r,id,{player:'p1',slot:3})!;
  expect(drop).toEqual({cardId:id,slot:3});expect(nextPlayStage(base,legal,drop)).toBe('none');
 });
 it('preserves the chosen position and rejects replaying a deployed card to move it',()=>{
  const s=setup(),id=card(s,base.id,'p1'),command:Command={type:'play',cardId:id,slot:4};
  const envelope={actor:'p1' as const,expectedRevision:s.revision,command},next=step(s,command);
  expect(next.cards[id].slot).toBe(4);expect(next.events.find(e=>e.type==='card.played')?.message).toContain('Right Flank');
  expect(replay(s,[envelope],r)).toEqual(next);
  const before=structuredClone(next),result=apply(next,{actor:'p1',expectedRevision:next.revision,command:{type:'play',cardId:id,slot:0}},r);
  expect(result.error).toBeTruthy();expect(result.state).toBe(next);expect(next).toEqual(before);
  expect(resolveDrop(projectForPlayer(next,'p1',r),'p1',r,id,{player:'p1',slot:0})).toBeNull();
 });
 it('the bot evaluates all deployment slots and places a banner between its allies',()=>{
  const s=setup();card(s,base.id,'p1',0);card(s,base.id,'p1',2);const id=card(s,banner.id,'p1');
  expect(botCommand(s,r)).toMatchObject({type:'play',cardId:id,slot:1});
  const next=step(s,botCommand(s,r));expect(next.cards[id].slot).toBe(1);
 });
});

describe('position-based blocking restrictions',()=>{
 it('publishes reachable lanes, and neither flank can block a Flank Evasion attacker',()=>{
  const s=setup(),attacker=card(s,evader.id,'p1',2),defenders=battlefieldPositions.map((_,slot)=>card(s,slot%2?'crown-bulwark':base.id,'p2',slot,true));combat(s,[attacker]);
  defenders.forEach((blocker,slot)=>expect(canBlock(s,attacker,blocker,r)).toBe(slot>0&&slot<4));
  expect(legalActions(s,r).lanes).toEqual({[attacker]:[1,2,3]});
  expect(projectForPlayer(s,'p2',r).legal.lanes).toEqual({});expect(projectForPlayer(s,null,r).legal.lanes).toEqual({});
  for(const lane of [1,2,3])expect(step(s,{type:'attack',attackers:[attacker],lanes:{[attacker]:lane}}).combat?.blocks).toEqual([{attacker,blocker:defenders[lane]}]);
 });
 it('an attack on a flank lane slips past Flank Evasion to the player, while a plain attacker is still blocked',()=>{
  const s=setup(),restricted=card(s,evader.id,'p1',1),plain=card(s,base.id,'p1',2),flank=card(s,base.id,'p2',0),wing=card(s,base.id,'p2',2);combat(s,[restricted,plain]);
  const declared=step(s,{type:'attack',attackers:[restricted,plain],lanes:{[restricted]:0,[plain]:2}});
  expect(declared.combat?.blocks).toEqual([{attacker:plain,blocker:wing}]);expect(declared.combat?.lanes).toEqual({[restricted]:0,[plain]:2});
  const resolved=step(declared,{type:'confirm-combat'});
  expect(resolved.players.p2.life).toBe(10-effectiveStats(s,restricted,r).attack);expect(resolved.cards[flank].damage).toBe(0);expect(resolved.cards[wing].damage).toBe(effectiveStats(s,plain,r).attack);
 });
 it('the bot aims at the only lane that cannot block its attacker, and otherwise declines a pointless trade',()=>{
  const s=setup(),attacker=card(s,evader.id,'p1',1);card(s,'crown-bulwark','p2',0);card(s,'crown-bulwark','p2',1);card(s,'crown-bulwark','p2',2);combat(s,[attacker]);
  expect(botCommand(s,r)).toEqual({type:'attack',attackers:[attacker],lanes:{[attacker]:0}});step(s,botCommand(s,r));
  const walled=setup(),lone=card(walled,evader.id,'p1',2);for(const slot of [1,2,3])card(walled,'crown-bulwark','p2',slot);combat(walled,[lone]);
  expect(botCommand(walled,r)).toEqual({type:'attack',attackers:[],lanes:{}});
 });
});

describe('Charge against a named position',()=>{
 it.each(['p1','p2'] as const)('automatically hits the opposing Center for %s, respecting Armor',side=>{
  const s=setup();s.active=side;const enemy=side==='p1'?'p2':'p1',target=card(s,'aldric-runewarden',enemy,2),wing=card(s,base.id,enemy,1),id=card(s,charger.id,side);
  const next=step(s,{type:'play',cardId:id,slot:4});
  expect(next.cards[target].damage).toBe(3);expect(next.cards[target].zone).toBe('board');expect(next.cards[wing].damage).toBe(0);
  expect(next.players[enemy].life).toBe(10);expect(next.cards[id].slot).toBe(4);
 });
 it('does nothing to an empty Center or a bulwark there, and does not redirect to a wing',()=>{
  for(const center of [undefined,'crown-bulwark']){
   const s=setup(),wing=card(s,base.id,'p2',1);if(center)card(s,center,'p2',2);const id=card(s,charger.id,'p1');
   const next=step(s,{type:'play',cardId:id,slot:2});
   expect(next.events.filter(e=>e.type==='damage.dealt')).toEqual([]);expect(next.cards[wing].damage).toBe(0);
  }
 });
 it('can kill a central creature, removing its adjacency aura, and only fires for its own play',()=>{
  let s=setup();const target=card(s,banner.id,'p2',2),neighbor=card(s,base.id,'p2',1),id=card(s,charger.id,'p1');
  expect(effectiveStats(s,neighbor,r).attack).toBe(2);
  s=step(s,{type:'play',cardId:id,slot:0});expect(s.cards[target].zone).toBe('discard');expect(effectiveStats(s,neighbor,r).attack).toBe(1);
  const nextTarget=card(s,'aldric-runewarden','p2',2),other=card(s,base.id,'p1');s=step(s,{type:'play',cardId:other,slot:1});
  expect(s.cards[nextTarget].damage).toBe(0);
 });
 it('supports another named position and rejects invalid content parameters',()=>{
  const left={...charger,id:'left-charge',deckLimitKey:'left-charge',abilities:[{id:'charge',params:{amount:4,position:'Left Flank'}}]};
  const content=compileContent([...Object.values(r.cards),left]);
  const s=createMatch(content,[starterDecks.verdant,starterDecks.hollow]),target=card(s,base.id,'p2',0),id=card(s,left.id,'p1');
  const result=apply(s,{actor:'p1',expectedRevision:s.revision,command:{type:'play',cardId:id,slot:1}},content);
  expect(result.error).toBeUndefined();expect(result.state.cards[target].zone).toBe('discard');
  for(const params of [{amount:4,position:'Middle'},{amount:-1,position:'Center'},{amount:4}])expect(()=>compileContent([{...charger,abilities:[{id:'charge',params}]}])).toThrow();
  const facts=renderToStaticMarkup(<CardFacts card={charger}/>);expect(facts).toContain('Charge 4 · Center');expect(facts).toContain('enemy creature in Center');
 });
});
