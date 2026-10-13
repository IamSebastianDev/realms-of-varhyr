import { describe, expect, it } from 'vitest';
import { registry, starterDefinitions, compileContent } from './fixtures/winterContent';
import { apply, assertInvariants, createMatch, effectiveStats, legalActions, replay, validateDeck } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import type { Command, CommandEnvelope, GameState, PlayerId, Registry } from '../packages/contracts/src';
const crown = starterDefinitions.find(deck=>deck.id==='crown')!;
function setup(content=registry) {
  const state=createMatch(content,[crown.cards,crown.cards],731);
  for(const p of Object.values(state.players)) {for(const id of p.hand){state.cards[id].zone='deck';p.deck.push(id);}p.hand=[];}
  state.events=[];return state;
}
function card(state:GameState,definitionId:string,side:PlayerId='p1',slot?:number,exhausted=false) {
  const p=state.players[side],id=p.deck.pop()!;
  Object.assign(state.cards[id],{definitionId,zone:slot===undefined?'hand':'board',slot:slot??null,exhausted});
  if(slot===undefined)p.hand.push(id);else p.board[slot]=id;return id;
}
function step(state:GameState,command:Command,actor:PlayerId='p1',content=registry) {
  const result=apply(state,{actor,expectedRevision:state.revision,command},content);
  expect(result.error).toBeUndefined();assertInvariants(result.state);return result.state;
}
describe('retired Winter regression fixtures',()=>{
  it('has 15 faction cards, a legal 30-card starter, four free producers and seven spells',()=>{
    const cards=Object.values(registry.cards).filter(card=>card.factions.includes('winter-league'));
    expect(cards).toHaveLength(15);expect(cards.filter(card=>card.type==='spell')).toHaveLength(7);
    expect(cards.filter(card=>card.type==='creature'&&!card.cost.generic&&!Object.values(card.cost.factions).some(Boolean))).toHaveLength(4);
    const starter=starterDefinitions.find(deck=>deck.id==='winter')!;
    expect(starter.cards).toHaveLength(30);expect(validateDeck(starter.cards,registry)).toEqual([]);
    expect(starter.cards.filter(id=>registry.cards[id].type==='spell')).toHaveLength(12);
    for(const id of ['itinerant-notary','snowroad-broker','borrowed-wisdom']) expect(registry.cards[id].factions).toEqual([]);
    expect(registry.cards['crowns-winter-envoy'].stats!.energyOutputs).toEqual([{'winter-league':1},{crownlands:1}]);
  });
  it.each([['winter-correspondence',1,0,1],['council-deliberation',2,0,2],['open-the-white-archive',2,1,3]] as const)('%s pays Snow and draws the printed number directly into hand',(definition,snow,neutral,draw)=>{
    const state=setup(),id=card(state,definition),hand=state.players.p1.hand.length,library=state.players.p1.deck.length;
    state.players.p1.energy={'winter-league':snow,neutral};
    const next=step(state,{type:'play',cardId:id});
    expect(next.players.p1.hand).toHaveLength(hand-1+draw);expect(next.players.p1.deck).toHaveLength(library-draw);
    expect(next.cards[id].zone).toBe('discard');expect(next.pending).toBeNull();
    expect(Object.values(next.players.p1.energy).reduce((a,b)=>a+b,0)).toBe(0);
  });
  it('draw spells still lose immediately when the library reaches empty',()=>{
    const state=setup(),id=card(state,'council-deliberation');state.players.p1.energy={'winter-league':2};
    while(state.players.p1.deck.length>1){const moved=state.players.p1.deck.pop()!;state.cards[moved].zone='discard';state.players.p1.discard.push(moved);}
    const next=step(state,{type:'play',cardId:id});expect(next.outcome).toBe('p2');expect(next.outcomeReason).toBe('empty-library');
  });
});
describe('energy conversion spells',()=>{
  it('pays Snow before gaining two neutral energy, spends it on generic costs and replays exactly',()=>{
    const initial=setup(),ritual=card(initial,'thaw-the-seal'),broker=card(initial,'snowroad-broker'),magistrate=card(initial,'rime-magistrate');
    initial.players.p1.energy={'winter-league':1,crownlands:1};
    const commands:CommandEnvelope[]=[{actor:'p1',expectedRevision:0,command:{type:'play',cardId:ritual}}];
    const converted=step(initial,commands[0].command);
    expect(converted.players.p1.energy).toEqual({'winter-league':0,crownlands:1,neutral:2});
    expect(legalActions(converted,registry).playable.some(action=>action.cardId===magistrate)).toBe(false);
    const next=step(converted,{type:'play',cardId:broker,slot:2});
    commands.push({actor:'p1',expectedRevision:converted.revision,command:{type:'play',cardId:broker,slot:2}});
    expect(next.players.p1.energy.neutral).toBe(1);expect(next.players.p1.energy.crownlands).toBe(1);
    expect(next.events.find(event=>event.type==='energy.generated')?.cardId).toBe(ritual);
    expect(replay(initial,commands,registry)).toEqual(next);
    let ended=step(next,{type:'end'});ended=step(ended,{type:'attack',attackers:[]});ended=step(ended,{type:'end'});
    expect(Object.values(ended.players.p1.energy).every(n=>n===0)).toBe(true);
  });
  it('cannot cast a conversion without its Snow payment and rejects fabricated energy types atomically',()=>{
    const state=setup(),id=card(state,'thaw-the-seal');state.players.p1.energy={neutral:5};
    expect(apply(state,{actor:'p1',expectedRevision:0,command:{type:'play',cardId:id}},registry).error).toBeTruthy();
    const bad={...registry.abilities['channel-neutral'],cast:((ctx)=>ctx.issue({type:'gain-energy',player:'p1',output:{unregistered:2}}))} satisfies typeof registry.abilities[string];
    const content:Registry={...registry,abilities:{...registry.abilities,'channel-neutral':bad}};
    state.players.p1.energy={'winter-league':1};const before=structuredClone(state);
    const result=apply(state,{actor:'p1',expectedRevision:0,command:{type:'play',cardId:id}},content);
    expect(result.error).toBe('Invalid generated energy.');expect(result.state).toBe(state);expect(state).toEqual(before);
  });
  it('a death-timed energy spell credits only the defender’s death-energy pool',()=>{
    const death={...registry.cards['thaw-the-seal'],id:'death-conversion',deckLimitKey:'death-conversion',timing:['death']};
    const content=compileContent([...Object.values(registry.cards),death]);
    const state=setup(content),id=card(state,death.id,'p2');state.phase='attack';state.combat={stage:'death',attackers:[],lanes:{},blocks:[],dead:[]};
    state.players.p2.deathEnergy={'winter-league':1};state.players.p2.energy={crownlands:3};
    const next=step(state,{type:'play',cardId:id},'p2',content);
    expect(next.players.p2.deathEnergy).toEqual({'winter-league':0,neutral:2});expect(next.players.p2.energy).toEqual({crownlands:3});
  });
  it('the bot uses conversion to fund a useful follow-up rather than hoarding expiring energy',()=>{
    // A fixed useful follow-up keeps this planning regression independent of authored card balance.
    const followup={...registry.cards['borrowed-wisdom'],id:'conversion-followup',deckLimitKey:'conversion-followup',
      cost:{generic:2,factions:{}},cast:[{id:'heal',params:{amount:4}}]};
    const content=compileContent([...Object.values(registry.cards),followup]);
    const state=setup(content),ritual=card(state,'thaw-the-seal'),healing=card(state,followup.id);
    state.players.p1.energy={'winter-league':1};state.players.p1.life=4;
    expect(botCommand(state,content)).toEqual({type:'play',cardId:ritual,consume:undefined,target:undefined,slot:undefined});
    const next=step(state,botCommand(state,content),'p1',content);expect(botCommand(next,content)).toMatchObject({type:'play',cardId:healing});
    const useless=setup(content);card(useless,'thaw-the-seal');useless.players.p1.energy={'winter-league':1};
    expect(botCommand(useless,content)).toEqual({type:'end'});
  });
  it('the bot cycles a cheap cantrip without casting itself into deck exhaustion',()=>{
    const state=setup(),id=card(state,'winter-correspondence');state.players.p1.energy={'winter-league':1};
    expect(botCommand(state,registry)).toMatchObject({type:'play',cardId:id});
    while(state.players.p1.deck.length>1){const moved=state.players.p1.deck.pop()!;state.cards[moved].zone='discard';state.players.p1.discard.push(moved);}
    expect(botCommand(state,registry)).toEqual({type:'end'});
  });
});
describe('public positional magic',()=>{
  it('Rime weakens only the enemy directly opposite while exhausted, and ends when its source leaves',()=>{
    const state=setup(),source=card(state,'rime-pupil','p1',2,true),enemy=card(state,'crown-recruit','p2',2),adjacent=card(state,'runeguard','p2',1),friendly=card(state,'crown-recruit','p1',1);
    expect(effectiveStats(state,enemy,registry).attack).toBe(0);expect(effectiveStats(state,adjacent,registry).attack).toBe(2);expect(effectiveStats(state,friendly,registry).attack).toBe(1);
    const removal=card(state,'white-verdict','p2');state.active='p2';state.players.p2.energy={'winter-league':1,neutral:1};
    const next=step(state,{type:'play',cardId:removal,target:source},'p2');
    expect(next.cards[source].zone).toBe('discard');expect(effectiveStats(next,enemy,registry).attack).toBe(1);
  });
  it('Invocation is unavailable against an empty lane or bastion and cannot redirect to another lane',()=>{
    const state=setup(),mage=card(state,'glassfire-adept','p1',2),other=card(state,'crown-recruit','p2',1);
    expect(legalActions(state,registry).activations).toEqual([]);
    expect(apply(state,{actor:'p1',expectedRevision:0,command:{type:'activate',cardId:mage,ability:0,target:other}},registry).error).toBeTruthy();
    card(state,'crown-bastion','p2',2);expect(legalActions(state,registry).activations).toEqual([]);
  });
  it('Invocation damages the opposing creature, respects Armor, exhausts the mage and excludes combat',()=>{
    const state=setup(),mage=card(state,'first-speaker-of-the-league','p1',2),target=card(state,'aldric-runewarden','p2',2);
    expect(legalActions(state,registry).activations).toContainEqual({cardId:mage,ability:1,targets:[],requiresTarget:false});
    const next=step(state,{type:'activate',cardId:mage,ability:1});
    expect(next.cards[target].damage).toBe(1);expect(next.cards[mage].exhausted).toBe(true);
    expect(legalActions(next,registry).energy.some(action=>action.cardId===mage)).toBe(false);
    const combat=step(state,{type:'end'});expect(legalActions(combat,registry).activations).toEqual([]);
  });
});
