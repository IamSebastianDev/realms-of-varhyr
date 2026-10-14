import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileContent, registry, starterDecks } from '../packages/content/src';
import { apply, assertInvariants, createMatch, decisionPlayer, legalActions, projectForPlayer, replay } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import type { Command, CommandEnvelope, GameState, PlayerId } from '../packages/contracts/src';
import { creatureActions } from '../apps/web/src/creatureActions';
import { CardFace, CardFacts } from '../apps/web/src/CardPresentation';
import { builderCards, initialBuilderFilters, summarizeDeck } from '../apps/web/src/deckTools';

const unicorn=registry.cards['ancient-unicorn'];
const colors=registry.energyTypes.filter(color=>color!=='neutral');
function setup(){return createMatch(registry,[starterDecks.crown,starterDecks.crown],731);}
function place(state:GameState,definitionId:string,side:PlayerId,slot:number|null){
  const p=state.players[side],id=p.deck.pop()!;
  Object.assign(state.cards[id],{definitionId,zone:slot===null?'hand':'board',slot,exhausted:false,damage:0});
  if(slot===null)p.hand.push(id);else p.board[slot]=id;
  return id;
}
function step(state:GameState,command:Command){
  const envelope:CommandEnvelope={actor:decisionPlayer(state),expectedRevision:state.revision,command};
  const result=apply(state,envelope,registry);expect(result.error).toBeUndefined();assertInvariants(result.state);
  return {state:result.state,envelope};
}
function reject(state:GameState,command:Command,actor=decisionPlayer(state)){
  const before=structuredClone(state),result=apply(state,{actor,expectedRevision:state.revision,command},registry);
  expect(result.error).toBeTruthy();expect(result.state).toBe(state);expect(state).toEqual(before);
}

describe('Primal and creatures without printed production',()=>{
  it('keeps the authored stats and copy limit, with an unnumbered bilingual ability and no printed production',()=>{
    expect(unicorn).toMatchObject({type:'creature',legendary:true,cost:{generic:1,factions:{}},stats:{attack:1,defense:2,energyOutputs:[]},abilities:[{id:'primal',params:{}}]});
    expect(unicorn.factions).toEqual([]);expect(registry.abilities.primal.name).toBe('Primal');
    expect(registry.abilities.primal.translations?.de?.name).toBe('Urkraft');
    expect(()=>compileContent([{...unicorn,abilities:[{id:'primal',params:{amount:9}}]}])).toThrow();
    expect(()=>compileContent([{...unicorn,type:'bulwark'}])).toThrow('cannot produce energy');
  });
  it.each(colors)('chooses exactly one %s energy, exhausts, and replays deterministically',color=>{
    const before=setup(),id=place(before,unicorn.id,'p1',2),legal=legalActions(before,registry);
    expect(legal.energy.some(action=>action.cardId===id)).toBe(false);
    expect(legal.activations.find(action=>action.cardId===id)).toMatchObject({requiresTarget:true,targets:colors,energyOptions:colors.map(c=>({[c]:1}))});
    const result=step(before,{type:'activate',cardId:id,ability:0,target:color});
    expect(result.state.players.p1.energy).toEqual({[color]:1});expect(result.state.cards[id].exhausted).toBe(true);
    expect(replay(before,[result.envelope],registry)).toEqual(result.state);
    reject(result.state,{type:'activate',cardId:id,ability:0,target:color});
  });
  it('rejects missing/forged energy choices, enemy actions and ordinary channeling without mutating state',()=>{
    const state=setup(),id=place(state,unicorn.id,'p1',2);
    for(const target of [undefined,'neutral','generic','primal','not-a-faction','p2'])reject(state,{type:'activate',cardId:id,ability:0,target});
    reject(state,{type:'activate',cardId:id,ability:0,target:'crownlands'},'p2');
    reject(state,{type:'energy',cardId:id,option:0});
    const combat=step(state,{type:'end'}).state;
    reject(combat,{type:'activate',cardId:id,ability:0,target:'crownlands'});
  });
  it('offers eight direct inline Primal choices, without a board-target selection or channel action',()=>{
    const state=setup(),id=place(state,unicorn.id,'p1',2),view=projectForPlayer(state,'p1',registry);
    expect(creatureActions(view,id,[],[])).toEqual(colors.map(color=>({kind:'activate',ability:0,target:color,output:{[color]:1}})));
    expect(creatureActions(projectForPlayer(state,'p2',registry),id,[],[])).toEqual([]);
    const facts=renderToStaticMarkup(<CardFacts card={unicorn}/>),face=renderToStaticMarkup(<CardFace card={unicorn}/>);
    expect(facts).toContain('Primal');expect(facts).toContain('choose a faction');expect(facts).toContain('No printed energy output.');
    expect(face).not.toContain('card-energy-output');
  });
  it('generates no death energy and never opens an empty pending choice when killed defending',()=>{
    let state=setup();const attacker=place(state,'ban-vale-cavalry','p1',2),defender=place(state,unicorn.id,'p2',2);
    state=step(state,{type:'end'}).state;
    state=step(state,{type:'attack',attackers:[attacker],lanes:{[attacker]:2}}).state;
    state=step(state,{type:'confirm-combat'}).state;
    expect(state.cards[defender].zone).toBe('discard');expect(state.pending).toBeNull();
    expect(state.players.p2.deathEnergy).toEqual({});expect(decisionPlayer(state)).toBe('p2');
    expect(state.combat?.stage).toBe('death');
    state=step(state,{type:'end'}).state;expect(state.phase).toBe('end');
  });
  it('counts Primal as an energy producer and the bot uses the required faction to fund a play',()=>{
    expect(builderCards(registry,[],{...initialBuilderFilters,role:'producers'}).map(card=>card.id)).toContain(unicorn.id);
    expect(summarizeDeck([unicorn.id],registry)).toMatchObject({producers:1,freeProducers:0});
    const state=setup();for(const id of state.players.p1.hand){state.cards[id].zone='deck';state.players.p1.deck.push(id);}state.players.p1.hand=[];
    const id=place(state,unicorn.id,'p1',2),recruit=place(state,'crown-recruit','p1',null);
    // Require a faction cost which cannot be paid from the otherwise empty pool.
    const content={...registry,cards:{...registry.cards,'crown-recruit':{...registry.cards['crown-recruit'],cost:{generic:0,factions:{'winter-league':1}}}}};
    const command=botCommand(state,content);
    expect(command).toEqual({type:'activate',cardId:id,ability:0,target:'winter-league'});
    const funded=apply(state,{actor:'p1',expectedRevision:state.revision,command},content);expect(funded.error).toBeUndefined();
    expect(legalActions(funded.state,content).playable.map(action=>action.cardId)).toContain(recruit);
  });
});
