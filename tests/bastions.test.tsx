import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDrop } from '../apps/web/src/cardInteraction';
import { ArtCard, CardFacts } from '../apps/web/src/CardPresentation';
import { creatureActions } from '../apps/web/src/creatureActions';
import { compileContent, registry as live } from '../packages/content/src';
import type { AbilityExtension, Command, CommandEnvelope, GameState, PlayerId } from '../packages/contracts/src';
import { apply, assertInvariants, createMatch, decisionPlayer, effectiveStats, legalActions, projectForPlayer, replay } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import { compileContent as compileFixture, registry as old, starterDecks } from './fixtures/content';

// Keep gameplay fixtures stable while the authored card's cost and rarity change.
const bastion={...live.cards['crown-bastion'],legendary:false,cost:{generic:1,factions:{crownlands:1}}};
const targeted:AbilityExtension={id:'test-volley',version:1,name:'Volley {amount}',description:'Exhaust to deal {amount} damage to an enemy field card.',validate:()=>{},target:'enemy-field',activate:(ctx,p)=>ctx.issue({type:'damage',target:ctx.target!,amount:p.amount as number})};
const r=compileFixture([...Object.values(old.cards),bastion,{...bastion,id:'volley-bastion',deckLimitKey:'volley-bastion',abilities:[{id:'test-volley',params:{amount:1}}]}],{...old.abilities,'test-volley':targeted});
function setup(content=r) {
  const state=createMatch(content,[starterDecks.verdant,starterDecks.hollow],731);
  for(const p of Object.values(state.players)){for(const id of p.hand){state.cards[id].zone='deck';p.deck.push(id);}p.hand=[];}
  state.events=[];return state;
}
function field(state:GameState,definitionId:string,owner:PlayerId,slot?:number,exhausted=false) {
  const p=state.players[owner],id=p.deck.pop()!;
  Object.assign(state.cards[id],{definitionId,zone:slot===undefined?'hand':'board',slot:slot??null,exhausted});
  if(slot===undefined)p.hand.push(id);else p.board[slot]=id;
  return id;
}
function step(state:GameState,command:Command,content=r) {
  const result=apply(state,{actor:decisionPlayer(state),expectedRevision:state.revision,command},content);
  expect(result.error).toBeUndefined();assertInvariants(result.state);return result.state;
}
function reject(state:GameState,command:Command,actor=decisionPlayer(state),content=r) {
  const before=structuredClone(state),result=apply(state,{actor,expectedRevision:state.revision,command},content);
  expect(result.error).toBeTruthy();expect(result.state).toBe(state);expect(state).toEqual(before);
}
function attack(state:GameState) {state.phase='attack';state.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};}

afterEach(()=>vi.unstubAllGlobals());
describe('creatures and bastions',()=>{
  it('imports creatures and bastions, but rejects the old monster type and invalid energy',()=>{
    expect(Object.values(live.cards).map(c=>c.type)).toContain('creature');
    expect(bastion.stats?.energyOutputs).toEqual([]);
    expect(()=>compileContent([{...live.cards['crown-recruit'],type:'monster'}])).toThrow();
    expect(()=>compileContent([{...bastion,stats:{...bastion.stats,energyOutputs:[{crownlands:1}]}}])).toThrow('cannot produce energy');
    expect(()=>compileContent([{...bastion,stats:undefined}])).toThrow('Invalid field card');
    expect(()=>compileContent([{...live.cards['crown-recruit'],stats:{attack:1,defense:1}}])).toThrow('needs energy outputs');
    expect(()=>compileContent([{...bastion,timing:['play']}])).toThrow('Invalid field card');
    expect(()=>compileContent([{...live.cards['cleansing-light'],abilities:[{id:'rally',params:{amount:1}}]}])).toThrow('activated field ability');
  });
  it('deploys into a shared slot exhausted, and refuses a full battlefield',()=>{
    let s=setup();const id=field(s,bastion.id,'p1');s.players.p1.energy={crownlands:1,neutral:1};
    const drop=resolveDrop(projectForPlayer(s,'p1',r),'p1',r,id,{player:'p1',slot:4});
    expect(drop).toEqual({cardId:id,slot:4});
    expect(resolveDrop(projectForPlayer(s,'p1',r),'p1',r,id,{player:'p2',slot:4})).toBeNull();
    s=step(s,{type:'play',...drop!});expect(s.cards[id].exhausted).toBe(true);expect(s.players.p1.board[4]).toBe(id);
    expect(legalActions(s,r).activations).toEqual([]);
    for(let slot=0;slot<4;slot++)field(s,'crown-recruit','p1',slot);
    const extra=field(s,bastion.id,'p1');s.players.p1.energy={crownlands:1,neutral:1};
    expect(legalActions(s,r).playable.map(a=>a.cardId)).not.toContain(extra);reject(s,{type:'play',cardId:extra});
  });
  it('cannot generate energy or attack, including forged commands',()=>{
    const s=setup(),id=field(s,bastion.id,'p1',0);
    expect(legalActions(s,r).energy.map(a=>a.cardId)).not.toContain(id);reject(s,{type:'energy',cardId:id,option:0});
    attack(s);expect(legalActions(s,r).attackers).not.toContain(id);reject(s,{type:'attack',attackers:[id]});
  });
  it('blocks while exhausted and strikes back, then dies without death energy',()=>{
    let s=setup();const attacker=field(s,'hollow-devourer','p1',0),blocker=field(s,bastion.id,'p2',0,true);attack(s);
    s=step(s,{type:'attack',attackers:[attacker]});expect(s.combat?.blocks).toEqual([{attacker,blocker}]);
    expect(s.cards[blocker].zone).toBe('board');
    s=step(s,{type:'confirm-combat'});expect(s.cards[attacker].damage).toBe(1);expect(s.cards[blocker].zone).toBe('discard');
    expect(s.players.p2.life).toBe(10);expect(s.players.p2.deathEnergy).toEqual({});expect(s.pending).toBeNull();expect(s.phase).toBe('end');
    expect(s.events.some(e=>e.type==='bastion.destroyed')).toBe(true);
  });
  it('still grants energy for a creature dying alongside a bastion',()=>{
    let s=setup();const a=field(s,'hollow-devourer','p1',0),b=field(s,'wild-guardian','p1',1),fort=field(s,bastion.id,'p2',0,true),creature=field(s,'ashen-initiate','p2',1,true);attack(s);
    s=step(s,{type:'attack',attackers:[a,b]});s=step(s,{type:'confirm-combat'});
    expect(s.cards[fort].zone).toBe('discard');expect(s.cards[creature].zone).toBe('discard');expect(s.players.p2.deathEnergy).toEqual({ashen:1});expect(s.combat?.stage).toBe('death');
  });
  it('keeps a continuous bonus while exhausted and removes it with its source',()=>{
    let s=setup();const fort=field(s,bastion.id,'p2',0,true),ally=field(s,'crown-recruit','p2',1),second=field(s,bastion.id,'p2',2),spell=field(s,'cleansing-light','p1');
    expect(effectiveStats(s,ally,r).attack).toBe(3);expect(effectiveStats(s,fort,r).attack).toBe(1);expect(effectiveStats(s,second,r).attack).toBe(1);
    s.cards[fort].damage=2;s.players.p1.energy={crownlands:1,neutral:1};s=step(s,{type:'play',cardId:spell,target:fort});
    expect(s.cards[fort].zone).toBe('discard');expect(effectiveStats(s,ally,r).attack).toBe(2);
  });
  it('activates once by exhausting, uses the printed description, and replays deterministically',()=>{
    const s=setup(),id=field(s,bastion.id,'p1',0);s.players.p1.life=7;
    expect(legalActions(s,r).activations).toEqual([{cardId:id,ability:1,targets:[],requiresTarget:false}]);
    expect(projectForPlayer(s,'p2',r).legal.activations).toEqual([]);
    expect(creatureActions(projectForPlayer(s,'p1',r),id,[],[])).toEqual([{kind:'activate',ability:1}]);
    const envelope:CommandEnvelope={actor:'p1',expectedRevision:s.revision,command:{type:'activate',cardId:id,ability:1}};
    const after=step(s,envelope.command);expect(after.players.p1.life).toBe(8);expect(after.cards[id].exhausted).toBe(true);
    expect(after.events.some(e=>e.message==='Crown Bastion activates Rally 1.')).toBe(true);expect(replay(s,[envelope],r)).toEqual(after);
    expect(legalActions(after,r).activations).toEqual([]);reject(after,envelope.command);
    after.phase='end';const next=step(after,{type:'end'});expect(next.cards[id].exhausted).toBe(false);
  });
  it('rejects activation from hand, wrong actor, wrong phase, invalid index and extra target',()=>{
    const s=setup(),id=field(s,bastion.id,'p1',0),hand=field(s,bastion.id,'p1');
    reject(s,{type:'activate',cardId:hand,ability:1});reject(s,{type:'activate',cardId:id,ability:1},'p2');
    for(const ability of [0,2,-1,.5])reject(s,{type:'activate',cardId:id,ability});
    reject(s,{type:'activate',cardId:id,ability:1,target:'p2'});attack(s);reject(s,{type:'activate',cardId:id,ability:1});
  });
  it('keeps targeted activation separate from deployment and requires a legal target',()=>{
    let s=setup();const id=field(s,'volley-bastion','p1'),enemy=field(s,bastion.id,'p2',0);s.players.p1.energy={crownlands:1,neutral:1};
    expect(legalActions(s,r).playable.find(a=>a.cardId===id)?.requiresTarget).toBe(false);
    s=step(s,{type:'play',cardId:id,slot:0});s.cards[id].exhausted=false;
    expect(legalActions(s,r).activations).toEqual([{cardId:id,ability:0,targets:[enemy],requiresTarget:true}]);
    for(const target of [undefined,'p2',id,'missing'])reject(s,{type:'activate',cardId:id,ability:0,target});
    s=step(s,{type:'activate',cardId:id,ability:0,target:enemy});expect(s.cards[enemy].damage).toBe(1);expect(s.cards[id].exhausted).toBe(true);
  });
  it('offers no targeted action with no targets, and creature-specific targeting excludes bastions',()=>{
    const s=setup(),id=field(s,'volley-bastion','p1',0);expect(legalActions(s,r).activations).toEqual([]);reject(s,{type:'activate',cardId:id,ability:0});
    const creatureOnly=compileFixture(Object.values(r.cards),{...r.abilities,'test-volley':{...targeted,target:'enemy-creature'}});
    const only=setup(creatureOnly),source=field(only,'volley-bastion','p1',0);field(only,bastion.id,'p2',0);
    expect(legalActions(only,creatureOnly).activations).toEqual([]);reject(only,{type:'activate',cardId:source,ability:0},'p1',creatureOnly);
    const enemy=field(only,'crown-recruit','p2',1);expect(legalActions(only,creatureOnly).activations[0].targets).toEqual([enemy]);
  });
  it('offers a popover choice for a creature with both energy and an activated ability',()=>{
    const s=setup(),id=field(s,'crown-recruit','p1',0);
    const content=compileFixture(Object.values(r.cards).map(c=>c.id==='crown-recruit'?{...c,abilities:[{id:'rally',params:{amount:1}}]}:c),r.abilities);
    s.contentVersion=content.version;
    expect(creatureActions(projectForPlayer(s,'p1',content),id,[],[])).toEqual([{kind:'channel',option:0,output:{crownlands:1}},{kind:'activate',ability:0}]);
  });
  it('lets the bot activate and deploy a bastion, which blocks its lane without generating invalid commands',()=>{
    let s=setup();const fort=field(s,bastion.id,'p1',0);s.players.p1.life=6;
    expect(botCommand(s,r)).toMatchObject({type:'activate',cardId:fort,ability:1});s=step(s,botCommand(s,r));expect(botCommand(s,r)).toEqual({type:'end'});
    const hand=field(s,bastion.id,'p1');s.players.p1.energy={crownlands:1,neutral:1};expect(botCommand(s,r)).toMatchObject({type:'play',cardId:hand});s=step(s,botCommand(s,r));
    s=step(s,{type:'end'});expect(botCommand(s,r)).toEqual({type:'attack',attackers:[],lanes:{}});
    s=setup();const attacker=field(s,'crown-recruit','p1',0),blocker=field(s,bastion.id,'p2',0,true);s.players.p2.life=1;attack(s);s=step(s,{type:'attack',attackers:[attacker]});
    expect(s.combat?.blocks).toEqual([{attacker,blocker}]);expect(botCommand(s,r)).toEqual({type:'confirm-combat'});s=step(s,botCommand(s,r));expect(s.outcome).toBeNull();
  });
  it('renders a bastion crest, defensive stats and stacked effects without energy output',()=>{
    vi.stubGlobal('window',{matchMedia:()=>({matches:false})});
    const card=renderToStaticMarkup(<ArtCard card={bastion}/>),facts=renderToStaticMarkup(<CardFacts card={bastion}/>);
    expect(card).toContain('Bastion');expect(card).toContain('bastion-card');expect(card).not.toContain('Energy produced');
    expect(facts).toContain('Defensive damage');expect(facts).toContain('cannot attack or generate energy');expect(facts).toContain('War Banner 1');expect(facts).toContain('Rally 1');
    expect(facts.match(/class="ability-fact"/g)).toHaveLength(2);expect(facts).not.toContain('ENERGY OUTPUT');
  });
  it.each([11,731,2048])('finishes a full bot match with bastions at seed %s',seed=>{
    const replace=(deck:string[])=>deck.map((id,i)=>i<2?bastion.id:id);
    let state=createMatch(r,[replace(starterDecks.verdant),replace(starterDecks.hollow)],seed),count=0;
    while(!state.outcome&&count++<700)state=step(state,botCommand(state,r));
    expect(state.outcome).not.toBeNull();expect(count).toBeLessThan(700);
  });
});
