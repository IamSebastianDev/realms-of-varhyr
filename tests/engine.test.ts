import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { combatForecast } from '../apps/web/src/combatForecast';
import type { AbilityExtension, CardDefinition, Command, CommandEnvelope, GameState, PlayerId } from '../packages/contracts/src';
import { apply, assertInvariants, autoPayment, createMatch, decisionPlayer, effectiveStats, legalActions, projectForPlayer, projectForSpectator, replay, validateDeck } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import raw, { abilities, compileContent, registry, starterDecks } from './fixtures/content';
import { startMatch } from './fixtures/session';
const fresh=(seed=42,r=registry)=>createMatch(r,[starterDecks.verdant,starterDecks.hollow],seed);
function step(s:GameState,command:Command,actor=decisionPlayer(s),r=registry){const result=apply(s,{actor,expectedRevision:s.revision,command},r);expect(result.error).toBeUndefined();return result.state;}
function fixture(s:GameState,definitionId:string,owner:PlayerId,zone:'board'|'hand',slot=0,exhausted=false){
 const id=Object.keys(s.cards).find(id=>s.cards[id].definitionId===definitionId&&s.cards[id].owner===owner&&s.cards[id].zone==='deck')!;
 if(!id)throw new Error(`No fixture card ${definitionId}`);
 s.players[owner].deck=s.players[owner].deck.filter(cid=>cid!==id);s.cards[id].zone=zone;s.cards[id].slot=zone==='board'?slot:null;s.cards[id].exhausted=exhausted;
 if(zone==='board')s.players[owner].board[slot]=id;else s.players[owner].hand.push(id);
 return id;
}
function setup(r=registry){const s=fresh(731,r); // Put opening hands back to make fixture selection independent of shuffling.
 for(const p of [s.players.p1,s.players.p2]){for(const id of p.hand){s.cards[id].zone='deck';p.deck.push(id);}p.hand=[];}s.events=[];return s;}
function attackState(){const s=setup();s.phase='attack';s.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};return s;}
function discardAll(s:GameState,owner:PlayerId){const p=s.players[owner];for(const id of [...p.deck,...p.hand]){s.cards[id].zone='discard';p.discard.push(id);}p.deck=[];p.hand=[];}
describe('setup, economy and turn lifecycle',()=>{
 it('starts with 10 life, five cards, five slots and first draw skipped',()=>{const s=fresh();for(const p of [s.players.p1,s.players.p2]){expect(p.life).toBe(10);expect(p.hand).toHaveLength(5);expect(p.deck).toHaveLength(25);expect(p.board).toEqual([null,null,null,null,null]);}expect(s.phase).toBe('play');assertInvariants(s);});
 it('shuffles deterministically without sharing objects',()=>{expect(fresh(7)).toEqual(fresh(7));expect(fresh(7).players.p1.deck).not.toEqual(fresh(8).players.p1.deck);});
 it('rejects illegal decks and validates name/variant limits',()=>{expect(validateDeck(['forest-sprite'],registry)).not.toEqual([]);expect(()=>createMatch(registry,[Array(30).fill('forest-sprite'),starterDecks.hollow])).toThrow();const r=structuredClone(raw);r.find(c=>c.id==='forest-sprite')!.legendary=true;const custom=compileContent(r);expect(validateDeck(starterDecks.verdant,custom).some(e=>e.includes('Elderwood Sprite'))).toBe(true);});
 it('plays zero-cost creatures exhausted, without self-financing',()=>{let s=setup();const free=fixture(s,'forest-sprite','p1','hand'),expensive=fixture(s,'wild-guardian','p1','hand');s=step(s,{type:'play',cardId:free,slot:0});expect(s.cards[free].exhausted).toBe(true);expect(apply(s,{actor:'p1',expectedRevision:s.revision,command:{type:'energy',cardId:free,option:0}},registry).error).toBeTruthy();expect(legalActions(s,registry).playable.some(a=>a.cardId===expensive)).toBe(false);});
 it('Ready overrides exhausted entry',()=>{let s=setup();s.active='p2';const id=fixture(s,'clan-scout','p2','hand');s=step(s,{type:'play',cardId:id});expect(s.cards[id].exhausted).toBe(false);s=step(s,{type:'energy',cardId:id,option:0});expect(s.players.p2.energy).toEqual({clans:1});expect(s.cards[id].exhausted).toBe(true);});
 it('limits the board to five slots and rejects a sixth transactionally',()=>{let s=setup();for(let i=0;i<5;i++)fixture(s,i<3?'crown-recruit':'forest-sprite','p1','board',i);const sixth=fixture(s,'wayfarer','p1','hand');const previous=JSON.stringify(s);const result=apply(s,{actor:'p1',expectedRevision:s.revision,command:{type:'play',cardId:sixth}},registry);expect(result.error).toBeTruthy();expect(result.state).toBe(s);expect(JSON.stringify(s)).toBe(previous);});
 it('preserves excess energy through Play and expires it entering Attack',()=>{let s=setup();const id=fixture(s,'wild-guardian','p1','board');s=step(s,{type:'energy',cardId:id,option:0});expect(s.players.p1.energy).toEqual({elderwood:2});s=step(s,{type:'end'});expect(s.players.p1.energy).toEqual({});expect(s.phase).toBe('attack');expect(legalActions(s,registry).attackers).not.toContain(id);});
 it('readies only the ending controller, clears damage globally and offers two draws',()=>{let s=setup();const one=fixture(s,'forest-sprite','p1','board',0,true),two=fixture(s,'clan-scout','p2','board',0,true);s.cards[one].damage=0;s.cards[two].damage=0;s.phase='end';s=step(s,{type:'end'});expect(s.cards[one].exhausted).toBe(false);expect(s.cards[two].exhausted).toBe(true);expect(s.active).toBe('p2');expect(s.pending?.kind).toBe('draw');if(s.pending?.kind!=='draw')throw Error();const [keep,discard]=s.pending.options;s=step(s,{type:'choose',choiceId:s.pending.id,option:keep});expect(s.players.p2.hand).toContain(keep);expect(s.players.p2.discard).toContain(discard);expect(s.phase).toBe('play');});
 it('can serialize a pending draw choice and resume',()=>{let s=setup();s.phase='end';s=step(s,{type:'end'});s=JSON.parse(JSON.stringify(s));if(s.pending?.kind!=='draw')throw Error();s=step(s,{type:'choose',choiceId:s.pending.id,option:s.pending.options[0]});assertInvariants(s);expect(s.pending).toBeNull();});
 it.each([1,2])('loses immediately when the turn draw empties a %s-card library',remaining=>{
  let s=setup();s.phase='end';const p=s.players.p2;
  for(const id of p.deck.splice(remaining)){s.cards[id].zone='discard';p.discard.push(id);}
  const before=structuredClone(s),command:CommandEnvelope={actor:'p1',expectedRevision:s.revision,command:{type:'end'}};
  s=step(s,command.command);expect(s.outcome).toBe('p1');expect(s.outcomeReason).toBe('empty-library');expect(s.pending).toBeNull();
  expect(s.players.p2.deck).toHaveLength(0);expect(s.players.p2.hand).toHaveLength(remaining);
  expect(Object.values(s.cards).some(c=>c.zone==='choice')).toBe(false);expect(s.events.filter(e=>e.type==='game.ended')).toHaveLength(1);
  expect(replay(before,[command],registry)).toEqual(s);expect(projectForPlayer(s,'p2',registry).outcomeReason).toBe('empty-library');
  expect(projectForSpectator(s,registry).players.p2.handCount).toBe(remaining);expect(projectForSpectator(s,registry).hand).toEqual([]);
 });
 it('keeps the normal draw choice when at least one library card remains',()=>{
  let s=setup();s.phase='end';const p=s.players.p2;for(const id of p.deck.splice(3)){s.cards[id].zone='discard';p.discard.push(id);}
  s=step(s,{type:'end'});expect(s.players.p2.deck).toHaveLength(1);expect(s.pending?.kind).toBe('draw');expect(s.outcome).toBeNull();
 });
 it('never recycles the discard when a library is empty',()=>{
  let s=setup();discardAll(s,'p2');const discard=[...s.players.p2.discard];s.phase='end';s=step(s,{type:'end'});
  expect(s.outcome).toBe('p1');expect(s.players.p2.deck).toEqual([]);expect(s.players.p2.discard).toEqual(discard);
  expect(s.events.some(e=>e.type==='deck.reshuffled')).toBe(false);expect(s.players.p2.life).toBe(10);
 });
});
describe('colored payments and additional costs',()=>{
 it('reserves specific colors and uses neutral for generic',()=>{expect(autoPayment({crownlands:1,neutral:1},{generic:1,factions:{crownlands:1}})).toEqual({crownlands:1,neutral:1});expect(autoPayment({neutral:5},{generic:0,factions:{ashen:1}})).toBeNull();expect(autoPayment({elderwood:2},{generic:2,factions:{}})).toEqual({elderwood:2});});
 it('supports an explicit generic allocation and rejects overspending',()=>{let s=setup();const id=fixture(s,'wild-guardian','p1','hand');s.players.p1.energy={elderwood:1,crownlands:1,neutral:1};const bad=apply(s,{actor:'p1',expectedRevision:s.revision,command:{type:'play',cardId:id,payment:{elderwood:1,neutral:2}}},registry);expect(bad.state).toBe(s);s=step(s,{type:'play',cardId:id,payment:{elderwood:1,crownlands:1}});expect(s.players.p1.energy).toEqual({elderwood:0,crownlands:0,neutral:1});});
 it('dual producers choose one output, never both',()=>{let s=setup();const id=fixture(s,'runeguard','p1','board');s=step(s,{type:'energy',cardId:id,option:1});expect(s.players.p1.energy).toEqual({ironbound:1});});
 it('Consume frees a full slot before entry; no universal sacrifice',()=>{let s=setup();s.active='p2';for(let i=0;i<5;i++)fixture(s,i<3?'ashen-initiate':'wayfarer','p2','board',i);const victim=s.players.p2.board[1]!,id=fixture(s,'hollow-devourer','p2','hand');s.players.p2.energy={ashen:1,neutral:1};s=step(s,{type:'play',cardId:id,consume:victim});expect(s.players.p2.board[1]).toBe(id);expect(s.players.p2.discard).toContain(victim);expect(s.cards[id].exhausted).toBe(true);assertInvariants(s);});
 it('rejects absent/hostile Consume costs without spending energy',()=>{const s=setup();s.active='p2';const id=fixture(s,'hollow-devourer','p2','hand'),enemy=fixture(s,'forest-sprite','p1','board');fixture(s,'ashen-initiate','p2','board');s.players.p2.energy={ashen:1,neutral:1};for(const consume of [undefined,enemy]){const result=apply(s,{actor:'p2',expectedRevision:s.revision,command:{type:'play',cardId:id,consume}},registry);expect(result.error).toBeTruthy();expect(result.state).toBe(s);}});
});
describe('simultaneous combat and death energy',()=>{
 it('holds committed blockers for attacker review, serializes and resolves only on confirmation',()=>{
  let s=attackState();const attacker=fixture(s,'wild-guardian','p1','board'),blocker=fixture(s,'clan-scout','p2','board',0,true);
  s=step(s,{type:'attack',attackers:[attacker]});const before=s;
  
  expect(s.combat?.stage).toBe('review');expect(s.combat?.blocks).toEqual([{attacker,blocker}]);expect(decisionPlayer(s)).toBe('p1');
  expect(s.cards[blocker]).toEqual(before.cards[blocker]);expect(s.players.p2).toEqual(before.players.p2);expect(s.pending).toBeNull();
  expect(s.events.some(e=>['creature.blocked','damage.dealt'].includes(e.type))).toBe(false);
  expect(projectForPlayer(s,'p1',registry).combat?.blocks).toEqual([{attacker,blocker}]);expect(projectForPlayer(s,'p2',registry).combat?.blocks).toEqual([{attacker,blocker}]);
  for(const [actor,command] of [['p2',{type:'confirm-combat'}],['p1',{type:'block',assignments:[]}],['p1',{type:'end'}]] as [PlayerId,Command][]){const result=apply(s,{actor,expectedRevision:s.revision,command},registry);expect(result.error).toBeTruthy();expect(result.state).toBe(s);}
  const restored=JSON.parse(JSON.stringify(s)) as GameState;
  expect(botCommand(restored,registry)).toEqual({type:'confirm-combat'});
  const envelope:CommandEnvelope={actor:'p1',expectedRevision:s.revision,command:{type:'confirm-combat'}};
  const resolved=step(restored,envelope.command);expect(replay(s,[envelope],registry)).toEqual(resolved);
  expect(resolved.cards[blocker].zone).toBe('discard');expect(resolved.combat?.stage).toBe('death');expect(resolved.players.p2.deathEnergy).toEqual({clans:1});
 });
 it('also waits for confirmation when no blockers are set, before lethal damage',()=>{
  let s=attackState();const attacker=fixture(s,'wild-guardian','p1','board');s.players.p2.life=1;
  expect(apply(s,{actor:'p1',expectedRevision:s.revision,command:{type:'confirm-combat'}},registry).error).toBeTruthy();
  s=step(s,{type:'attack',attackers:[attacker]});expect(s.players.p2.life).toBe(1);expect(s.outcome).toBeNull();
  s=step(s,{type:'confirm-combat'});expect(s.outcome).toBe('p1');
 });
 it('owns the committed formation independently of the command payload',()=>{
  let s=attackState();const attacker=fixture(s,'wild-guardian','p1','board'),blocker=fixture(s,'wayfarer','p2','board');
  s=step(s,{type:'attack',attackers:[attacker]});const assignments=[{attacker,blocker}];
  assignments[0].blocker='edited-after-submit';assignments.length=0;
  expect(s.combat?.blocks).toEqual([{attacker,blocker}]);s=step(s,{type:'confirm-combat'});expect(s.cards[blocker].zone).toBe('discard');
 });
 it('allows exhausted blockers to strike back, without spillover',()=>{let s=attackState();const attacker=fixture(s,'wild-guardian','p1','board'),blocker=fixture(s,'clan-scout','p2','board',0,true);s=step(s,{type:'attack',attackers:[attacker]});expect(decisionPlayer(s)).toBe('p1');s=step(s,{type:'confirm-combat'});expect(s.cards[attacker].damage).toBe(1);expect(s.cards[blocker].zone).toBe('discard');expect(s.players.p2.life).toBe(10);expect(s.players.p2.deathEnergy).toEqual({clans:1});expect(s.combat?.stage).toBe('death');});
 it('rejects reused attackers, shared or unreachable lanes and out-of-turn declarations without committing',()=>{
  const s=attackState();const a=fixture(s,'forest-sprite','p1','board'),b=fixture(s,'crown-recruit','p1','board',1);fixture(s,'wayfarer','p2','board');
  const reject=(actor:PlayerId,command:Command)=>{const result=apply(s,{actor,expectedRevision:s.revision,command},registry);expect(result.error).toBeTruthy();expect(result.state).toBe(s);};
  reject('p1',{type:'attack',attackers:[a,a]});
  reject('p1',{type:'attack',attackers:[a,b],lanes:{[a]:1}}); // both would target Left Wing
  reject('p1',{type:'attack',attackers:[a],lanes:{[a]:2}}); // Center is two lanes away
  reject('p1',{type:'attack',attackers:[a],lanes:{[b]:2}}); // lane for a card that is not attacking
  reject('p2',{type:'attack',attackers:[a]});
  expect(legalActions(s,registry).lanes).toEqual({[a]:[0,1],[b]:[0,1,2]});
 });
 it('blocks automatically in the targeted lane, otherwise the attack reaches the player',()=>{
  let s=attackState();const attacker=fixture(s,'wild-guardian','p1','board',1),own=fixture(s,'clan-scout','p2','board',1),side=fixture(s,'wayfarer','p2','board',2);
  const own_=step(s,{type:'attack',attackers:[attacker]});expect(own_.combat?.lanes).toEqual({[attacker]:1});expect(own_.combat?.blocks).toEqual([{attacker,blocker:own}]);
  const adjacent=step(s,{type:'attack',attackers:[attacker],lanes:{[attacker]:2}});expect(adjacent.combat?.blocks).toEqual([{attacker,blocker:side}]);
  const open=step(s,{type:'attack',attackers:[attacker],lanes:{[attacker]:0}});expect(open.combat?.blocks).toEqual([]);
  const resolved=step(open,{type:'confirm-combat'});expect(resolved.players.p2.life).toBe(10-effectiveStats(s,attacker,registry).attack);expect(resolved.cards[own].damage).toBe(0);
 });
 describe('draw choice destination',()=>{
  const offered=()=>{let s=setup();s.phase='end';s=step(s,{type:'end'});if(s.pending?.kind!=='draw')throw Error('no draw');return s;};
  it('discards the unchosen card by default',()=>{
   const s=offered(),p=s.pending as {id:string;options:string[]},who=s.active,deck=s.players[who].deck.length;
   const n=step(s,{type:'choose',choiceId:p.id,option:p.options[0]});
   expect(n.players[who].discard).toContain(p.options[1]);expect(n.players[who].deck).toHaveLength(deck);expect(n.players[who].hand).toContain(p.options[0]);
  });
  it('can put the unchosen card under the library instead, hiding which card it was',()=>{
   const s=offered(),p=s.pending as {id:string;options:string[]},who=s.active,deck=s.players[who].deck.length;
   const n=step(s,{type:'choose',choiceId:p.id,option:p.options[0],other:'bottom'});
   expect(n.players[who].discard).not.toContain(p.options[1]);expect(n.players[who].deck).toHaveLength(deck+1);
   expect(n.players[who].deck[0]).toBe(p.options[1]);expect(n.cards[p.options[1]].zone).toBe('deck');
   const seen=projectForPlayer(n,who==='p1'?'p2':'p1',registry).events.filter(e=>e.type==='card.bottomed');
   expect(seen).toHaveLength(1);expect(seen[0].cardId).toBeUndefined();assertInvariants(n);
  });
  it('rejects an unknown destination',()=>{
   const s=offered(),p=s.pending as {id:string;options:string[]};
   expect(apply(s,{actor:decisionPlayer(s),expectedRevision:s.revision,command:{type:'choose',choiceId:p.id,option:p.options[0],other:'void'} as never},registry).error).toBeDefined();
  });
 });
 describe('mulligan',()=>{
  const opening=()=>createMatch(registry,[starterDecks.verdant,starterDecks.hollow],731,{mulligan:true});
  const mull=(s:GameState,cardIds:string[],actor=decisionPlayer(s))=>apply(s,{actor,expectedRevision:s.revision,command:{type:'mulligan',cardIds}},registry);
  it('opens with player one choosing, and nothing else is legal until both have answered',()=>{
   const s=opening();expect(s.pending).toMatchObject({kind:'mulligan',player:'p1',max:2});expect(decisionPlayer(s)).toBe('p1');
   expect(apply(s,{actor:'p1',expectedRevision:s.revision,command:{type:'end'}},registry).error).toMatch(/pending/);
   expect(legalActions(s,registry).canEnd).toBe(false);
  });
  it('replaces drawn-first so no returned card comes straight back, then hands over to player two',()=>{
   const s=opening(),hand=[...s.players.p1.hand],give=hand.slice(0,2),deckSize=s.players.p1.deck.length;
   const r=mull(s,give);expect(r.error).toBeUndefined();const n=r.state;
   expect(n.players.p1.hand).toHaveLength(5);expect(n.players.p1.deck).toHaveLength(deckSize);
   for(const id of give){expect(n.players.p1.hand).not.toContain(id);expect(n.cards[id].zone).toBe('deck');}
   expect(hand.slice(2).every(id=>n.players.p1.hand.includes(id))).toBe(true);
   expect(n.pending).toMatchObject({kind:'mulligan',player:'p2'});
   const done=mull(n,[]);expect(done.error).toBeUndefined();expect(done.state.pending).toBeNull();expect(done.state.active).toBe('p1');expect(done.state.phase).toBe('play');
   assertInvariants(done.state);
  });
  it('rejects more than two cards, duplicates and cards outside the hand',()=>{
   const s=opening(),hand=s.players.p1.hand;
   expect(mull(s,hand.slice(0,3)).error).toMatch(/at most 2/);expect(mull(s,[hand[0],hand[0]]).error).toBeDefined();expect(mull(s,[s.players.p2.hand[0]]).error).toBeDefined();
   expect(apply(s,{actor:'p2',expectedRevision:s.revision,command:{type:'mulligan',cardIds:[]}},registry).error).toMatch(/not your decision/);
  });
  it('keeps replacement draws private and lets the bot answer',()=>{
   const s=opening(),r=mull(s,s.players.p1.hand.slice(0,1)).state;
   expect(projectForPlayer(r,'p2',registry).events.some(e=>e.type==='card.drawn'&&e.player==='p1')).toBe(false);
   expect(projectForPlayer(r,'p1',registry).events.some(e=>e.type==='card.drawn'&&e.player==='p1')).toBe(true);
   const bot=botCommand(r,registry);expect(bot.type).toBe('mulligan');expect(apply(r,{actor:'p2',expectedRevision:r.revision,command:bot},registry).error).toBeUndefined();
  });
 });
 describe('guard',()=>{
  const guardRegistry=compileContent([...raw,{...registry.cards['wayfarer'],id:'guard-test',deckLimitKey:'guard-test',abilities:[{id:'guard',params:{}}]},{...registry.cards['wild-guardian'],id:'evader-test',deckLimitKey:'evader-test',abilities:[{id:'flank-evasion',params:{}}]}]);
  const guardSetup=(slot:number)=>{const s=setup(guardRegistry);s.phase='attack';s.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};const guard=fixture(s,'wayfarer','p2','board',slot);s.cards[guard].definitionId='guard-test';return {s,guard};};
  const attack=(s:GameState,lanes:Record<string,number>)=>step(s,{type:'attack',attackers:Object.keys(lanes),lanes},'p1',guardRegistry).combat!.blocks;
  it('intercepts attacks aimed at an adjacent lane, empty or not, but not farther lanes',()=>{
   const {s,guard}=guardSetup(2);const attacker=fixture(s,'wild-guardian','p1','board',0);
   expect(attack(s,{[attacker]:1})).toEqual([{attacker,blocker:guard}]);
   expect(attack(s,{[attacker]:0})).toEqual([]);
  });
  it('always blocks in its own lane and stops only one attacker per combat',()=>{
   const {s,guard}=guardSetup(2);const left=fixture(s,'wild-guardian','p1','board',1),right=fixture(s,'grove-keeper','p1','board',3);
   expect(attack(s,{[left]:2})).toEqual([{attacker:left,blocker:guard}]);
   // Left attacker is met first; the Guard is spent, so the right-hand lane stays open.
   expect(attack(s,{[left]:1,[right]:3})).toEqual([{attacker:left,blocker:guard}]);
  });
  it('blocks in its own lane before it intercepts, leaving the neighbouring lane card to block',()=>{
   const {s,guard}=guardSetup(2);const scout=fixture(s,'clan-scout','p2','board',1),a=fixture(s,'wild-guardian','p1','board',1),b=fixture(s,'crown-recruit','p1','board',2);
   expect(attack(s,{[a]:1,[b]:2})).toEqual([{attacker:a,blocker:scout},{attacker:b,blocker:guard}]);
  });
  it('cannot intercept Flank Evasion attackers from a flank',()=>{
   const {s}=guardSetup(4);const raider=fixture(s,'wild-guardian','p1','board',2);s.cards[raider].definitionId='evader-test';
   expect(attack(s,{[raider]:3})).toEqual([]);
  });
 });
 it('unblocked attacks damage the player, with victory after resolution',()=>{let s=attackState();const a=fixture(s,'wild-guardian','p1','board'),b=fixture(s,'grove-keeper','p1','board',1);s.players.p2.life=4;s=step(s,{type:'attack',attackers:[b,a]});expect(s.combat?.attackers).toEqual([a,b]);s=step(s,{type:'confirm-combat'});expect(s.players.p2.life).toBe(-1);expect(s.outcome).toBe('p1');});
 it('marked damage accumulates, then clears at end of turn',()=>{let s=attackState();const attacker=fixture(s,'crown-recruit','p1','board'),blocker=fixture(s,'wayfarer','p2','board');s.cards[blocker].damage=1;s=step(s,{type:'attack',attackers:[attacker]});s=step(s,{type:'confirm-combat'});expect(s.cards[blocker].zone).toBe('discard');s=step(s,{type:'end'});s=step(s,{type:'end'});expect(s.cards[attacker].damage).toBe(0);});
 it('requires a defender choice for a dual-output combat death',()=>{let s=attackState();s.active='p2';const attacker=fixture(s,'hollow-devourer','p2','board'),blocker=fixture(s,'runeguard','p1','board');s=step(s,{type:'attack',attackers:[attacker]});s=step(s,{type:'confirm-combat'});expect(s.pending?.kind).toBe('death-energy');const choice=s.pending!;s=JSON.parse(JSON.stringify(s));s=step(s,{type:'choose',choiceId:choice.id,option:1});expect(s.players.p1.deathEnergy).toEqual({ironbound:1});expect(s.pending).toBeNull();});
 it('only the defender can cast eligible spells using the death pool',()=>{let s=attackState();const attacker=fixture(s,'crown-recruit','p1','board'),blocker=fixture(s,'ashen-initiate','p2','board'),spell=fixture(s,'final-bargain','p2','hand');s=step(s,{type:'attack',attackers:[attacker]});s=step(s,{type:'confirm-combat'});expect(legalActions(s,registry).playable.map(a=>a.cardId)).toContain(spell);s=step(s,{type:'play',cardId:spell});expect(s.players.p2.life).toBe(12);expect(s.cards[spell].zone).toBe('discard');expect(s.players.p2.deathEnergy.ashen).toBe(0);s=step(s,{type:'end'});expect(s.players.p2.deathEnergy).toEqual({});expect(s.phase).toBe('end');});
 it('does not grant death energy for spell deaths',()=>{let s=setup();const target=fixture(s,'ashen-initiate','p2','board'),spell=fixture(s,'cleansing-light','p1','hand');s.players.p1.energy={crownlands:1,neutral:1};s=step(s,{type:'play',cardId:spell,target});expect(s.cards[target].zone).toBe('discard');expect(s.players.p2.deathEnergy).toEqual({});});
});
describe('reusable extension composition',()=>{
 it('runs deathbound using last-known state after battlefield removal',()=>{let s=attackState();s.active='p2';const attacker=fixture(s,'abyss-whelp','p2','board'),blocker=fixture(s,'grove-keeper','p1','board');const before=s.players.p1.hand.length;s=step(s,{type:'attack',attackers:[attacker]});s=step(s,{type:'confirm-combat'});expect(s.players.p1.hand).toHaveLength(before+1);});
 it('supports live auras and removes their modifiers with the source',()=>{let s=setup();const banner=fixture(s,'dawn-banner','p1','board'),ally=fixture(s,'forest-sprite','p1','board',1);expect(effectiveStats(s,ally,registry).attack).toBe(2);const spell=fixture(s,'homeward','p2','hand');s.active='p2';s.players.p2.energy={neutral:1}; // Return only targets friendly units.
 s.active='p1';s.cards[spell].owner='p1';s.cards[spell].controller='p1';s.players.p2.hand=s.players.p2.hand.filter(id=>id!==spell);s.players.p1.hand.push(spell);s.players.p1.energy={neutral:1};s=step(s,{type:'play',cardId:spell,target:banner});expect(effectiveStats(s,ally,registry).attack).toBe(1);});
 it('armor intercepts damage before marking it',()=>{let s=attackState();s.active='p2';const attacker=fixture(s,'abyss-whelp','p2','board'),blocker=fixture(s,'iron-guard','p1','board');s=step(s,{type:'attack',attackers:[attacker]});s=step(s,{type:'confirm-combat'});expect(s.cards[blocker].damage).toBe(2);expect(s.cards[attacker].damage).toBe(0);});
 it('chains Consume, collector draw and on-play damage once',()=>{let s=setup();s.active='p2';const collector=fixture(s,'grave-collector','p2','board'),victim=fixture(s,'ashen-initiate','p2','board',1),target=fixture(s,'forest-sprite','p1','board'),devourer=fixture(s,'hollow-devourer','p2','hand');s.players.p2.energy={ashen:1,neutral:1};const handBefore=s.players.p2.hand.length;s=step(s,{type:'play',cardId:devourer,consume:victim,target});expect(s.players.p2.hand).toHaveLength(handBefore);expect(s.cards[target].zone).toBe('discard');expect(s.events.filter(e=>e.type==='card.drawn')).toHaveLength(1);expect(s.cards[collector].zone).toBe('board');});
 it('checks simultaneous lethal effects only after the complete spell',()=>{const extra:CardDefinition={...registry.cards['final-bargain'],id:'reckoning-test',deckLimitKey:'reckoning-test',cost:{generic:0,factions:{}},cast:[{id:'reckoning',params:{amount:10}}]};const r=compileContent([...raw,extra]);let s=setup(r);const id=fixture(s,'final-bargain','p2','hand');s.cards[id].definitionId='reckoning-test';s.active='p2';s=step(s,{type:'play',cardId:id},'p2',r);expect(s.outcome).toBe('draw');});
 it('validates extension params and prevents executable/unknown content',()=>{const invalid=structuredClone(raw);invalid[0].abilities=[{id:'deathbound',params:{amount:-1}}] as never;expect(()=>compileContent(invalid)).toThrow();invalid[0].abilities=[{id:'arbitrary-function',params:{}}] as never;expect(()=>compileContent(invalid)).toThrow();expect(()=>compileContent([raw[0],raw[0]])).toThrow('Duplicate');});
 it('adding a dual-faction multi-ability card requires only content',()=>{const c:CardDefinition={...registry.cards['runeguard'],id:'new-champion',deckLimitKey:'new-champion',cost:{generic:0,factions:{}},abilities:[{id:'ready',params:{}},{id:'war-banner',params:{amount:1}}]};const r=compileContent([...raw,c]);let s=setup(r);const id=fixture(s,'crown-recruit','p1','hand');s.cards[id].definitionId=c.id;s=step(s,{type:'play',cardId:id},'p1',r);expect(s.cards[id].exhausted).toBe(false);expect(r.cards[c.id].factions).toHaveLength(2);});
 it('bounds infinite effect chains and rolls back all mutations',()=>{const loop:AbilityExtension={id:'loop',name:'loop',description:'Repeat zero damage after each damage event.',version:1,validate:p=>{v.parse(v.object({}),p);},hooks:{'damage.dealt':ctx=>ctx.issue({type:'damage',target:'p1',amount:0})},cast:ctx=>ctx.issue({type:'damage',target:'p1',amount:0})};const cards=structuredClone(raw);cards.find(c=>c.id==='forest-sprite')!.abilities=[{id:'loop',params:{}}] as never;cards.find(c=>c.id==='cleansing-light')!.cast=[{id:'loop',params:{}}];cards.find(c=>c.id==='cleansing-light')!.cost={generic:0,factions:{}};const r=compileContent(cards,{...abilities,loop});const s=setup(r);fixture(s,'forest-sprite','p1','board');const id=fixture(s,'cleansing-light','p1','hand');const before=JSON.stringify(s),result=apply(s,{actor:'p1',expectedRevision:0,command:{type:'play',cardId:id}},r);expect(result.error).toContain('RESOLUTION_LIMIT');expect(result.state).toBe(s);expect(JSON.stringify(s)).toBe(before);});
});
describe('projections, replay and headless vertical slice',()=>{
 it('filters opponent hand, deck identities and private draw events',()=>{const s=fresh(),view=projectForPlayer(s,'p1',registry),spectator=projectForSpectator(s,registry);expect(Object.keys(view.cards).sort()).toEqual([...s.players.p1.hand].sort());expect(view.players.p2).not.toHaveProperty('hand');expect(view.players.p2).not.toHaveProperty('deck');expect(view.events.filter(e=>e.type==='card.drawn')).toHaveLength(5);expect(Object.keys(spectator.cards)).toHaveLength(0);expect(spectator.events.filter(e=>e.type==='card.drawn')).toHaveLength(0);});
 it('hides pending choices and their legal actions from the wrong viewer',()=>{let s=setup();s.phase='end';s=step(s,{type:'end'});const wrong=projectForPlayer(s,'p1',registry);expect(wrong.pending).toBeNull();expect(wrong.legal.playable).toEqual([]);for(const id of s.pending!.options as string[])expect(wrong.cards[id]).toBeUndefined();});
 it('rejects stale revisions, wrong actors and choices without mutation',()=>{const s=fresh();for(const e of [{actor:'p1' as const,expectedRevision:99,command:{type:'end'} as Command},{actor:'p2' as const,expectedRevision:0,command:{type:'end'} as Command},{actor:'p1' as const,expectedRevision:0,command:{type:'choose',choiceId:'wrong',option:'bad'} as Command}]){const result=apply(s,e,registry);expect(result.state).toBe(s);expect(result.events).toEqual([]);expect(result.error).toBeTruthy();}});
 it.each([731,42,77,101,999])('two scripts finish a legal game with deterministic replay (seed %s)',seed=>{const initial=fresh(seed),commands:CommandEnvelope[]=[];let s=initial;for(let i=0;i<500&&!s.outcome;i++){const envelope={actor:decisionPlayer(s),expectedRevision:s.revision,command:botCommand(s,registry)};s=step(s,envelope.command,envelope.actor);commands.push(envelope);assertInvariants(s);}expect(s.outcome).not.toBeNull();expect(replay(initial,commands,registry)).toEqual(s);});
 it('the skirmish is reachable by ordinary legal commands',()=>{const s=startMatch(731,'verdant',true);expect(s.turn).toBe(5);expect(s.active).toBe('p1');expect(s.phase).toBe('play');expect(s.players.p1.board.filter(Boolean).length).toBeGreaterThan(0);assertInvariants(s);});
});
it('rejects malformed and unknown commands at the runtime boundary',()=>{const s=fresh();for(const command of [{type:'executeAnyOrder'},{type:'energy',cardId:7,option:-1},{type:'attack',attackers:null}]){const result=apply(s,{actor:'p1',expectedRevision:0,command:command as unknown as Command},registry);expect(result.error).toBeTruthy();expect(result.state).toBe(s);}});
it('pins content hash and rejects replays with changed card definitions',()=>{const changed=structuredClone(raw);changed[0].stats!.attack=9;const r=compileContent(changed);expect(r.version).not.toBe(registry.version);const s=fresh();expect(apply(s,{actor:'p1',expectedRevision:0,command:{type:'end'}},r).error).toContain('Content version');});
it('rejects incompatible replay snapshots even with no commands',()=>{const s=fresh();expect(()=>replay({...s,rulesVersion:'varhir-rules-0.4'},[],registry)).toThrow('Rules version');expect(()=>replay({...s,contentVersion:'old-content'},[],registry)).toThrow('Content version');});

describe('public combat forecast',()=>{
 it('uses actual armor and marked damage without changing the match',()=>{
  let s=attackState();s.active='p2';const attacker=fixture(s,'hollow-devourer','p2','board'),blocker=fixture(s,'iron-guard','p1','board');
  s=step(s,{type:'attack',attackers:[attacker]});const before=structuredClone(s);
  expect(combatForecast(s,null,registry)).toEqual({defender:'p1',blocked:1,lifeDamage:0,fallen:0,attackersFallen:0});expect(s).toEqual(before);
  s.cards[blocker].damage=1;expect(combatForecast(s,null,registry)?.fallen).toBe(1);
 });
 it('shows unblocked life damage and casualties, then respects committed assignments',()=>{
  let s=attackState();const one=fixture(s,'wild-guardian','p1','board'),two=fixture(s,'forest-sprite','p1','board',1),blocker=fixture(s,'clan-scout','p2','board');
  
  const draft={attackers:[one,two],lanes:{}};const before=structuredClone(s);
  expect(combatForecast(s,draft,registry)).toEqual({defender:'p2',blocked:1,lifeDamage:1,fallen:1,attackersFallen:0});expect(s).toEqual(before);
  expect(combatForecast(s,{attackers:[one,two],lanes:{[one]:1,[two]:2}},registry)?.blocked).toBe(0);
  s=step(s,{type:'attack',attackers:[one,two]});
  expect(combatForecast(s,null,registry)).toEqual({defender:'p2',blocked:1,lifeDamage:1,fallen:1,attackersFallen:0});
 });
 it('suppresses previews for invalid assignments and non-combat phases',()=>{
  expect(combatForecast(setup(),null,registry)).toBeNull();const s=attackState();const attacker=fixture(s,'forest-sprite','p1','board');
  expect(combatForecast(s,null,registry)).toBeNull();expect(combatForecast(s,{attackers:[],lanes:{}},registry)).toBeNull();
  expect(combatForecast(s,{attackers:[attacker],lanes:{[attacker]:3}},registry)).toBeNull(); // not an adjacent lane
  expect(combatForecast(s,{attackers:[attacker],lanes:{[attacker]:1}},registry)).not.toBeNull();
 });
});

describe('library depletion during effects',()=>{
 function trim(s:GameState,p:PlayerId,count:number){for(const id of s.players[p].deck.splice(count)){s.cards[id].zone='discard';s.players[p].discard.push(id);}}
 it('a spell drawing the last card loses immediately, despite positive life',()=>{
  let s=setup();s.active='p2';const spell=fixture(s,'final-bargain','p2','hand');trim(s,'p2',1);s.players.p2.energy={ashen:1};
  s=step(s,{type:'play',cardId:spell});expect(s.outcome).toBe('p1');expect(s.outcomeReason).toBe('empty-library');expect(s.players.p2.life).toBe(12);
  expect(s.players.p2.deck).toEqual([]);expect(s.pending).toBeNull();
  expect(apply(s,{actor:'p2',expectedRevision:s.revision,command:{type:'end'}},registry).error).toContain('ended');expect(legalActions(s,registry).playable).toEqual([]);
 });
 it('a deathbound draw can end combat before later attackers and death-energy choices',()=>{
  let s=attackState();s.active='p2';const first=fixture(s,'abyss-whelp','p2','board'),later=fixture(s,'hollow-devourer','p2','board',1),blocker=fixture(s,'grove-keeper','p1','board');trim(s,'p1',1);
  s=step(s,{type:'attack',attackers:[first,later]});s=step(s,{type:'confirm-combat'});
  expect(s.outcome).toBe('p2');expect(s.outcomeReason).toBe('empty-library');expect(s.players.p1.life).toBe(10);expect(s.pending).toBeNull();expect(s.players.p1.deathEnergy).toEqual({});
 });
 it('the first library to empty wins precedence over another queued draw',()=>{
  const custom:AbilityExtension={id:'two-draws',name:'two-draws',description:'Draw twice in separate effects.',version:1,validate:()=>{},cast:ctx=>{
    ctx.issue({type:'draw',player:'p2',amount:2});ctx.issue({type:'draw',player:'p1',amount:2});ctx.issue({type:'damage',target:'p1',amount:100});
  }};
  const cards=structuredClone(raw);cards.find(c=>c.id==='cleansing-light')!.cost={generic:0,factions:{}};cards.find(c=>c.id==='cleansing-light')!.cast=[{id:custom.id,params:{}}];
  const r=compileContent(cards,{...abilities,[custom.id]:custom});let s=setup(r);const spell=fixture(s,'cleansing-light','p1','hand');trim(s,'p1',1);trim(s,'p2',1);
  s=step(s,{type:'play',cardId:spell},'p1',r);expect(s.outcome).toBe('p1');expect(s.outcomeReason).toBe('empty-library');
  expect(s.players.p2.deck).toHaveLength(0);expect(s.players.p1.deck).toHaveLength(1);expect(s.players.p1.life).toBe(10);
  expect(s.events.filter(e=>e.type==='game.ended')).toHaveLength(1);
 });
});


describe('single blockers and simultaneous retaliation',()=>{
 function resolve(s:GameState,attacker:string,blocker:string,r=registry){s=step(s,{type:'attack',attackers:[attacker]},s.active,r);return step(s,{type:'confirm-combat'},s.active,r);}
 it('mutually lethal creatures strike before either is destroyed',()=>{
  let s=attackState();const attacker=fixture(s,'forest-sprite','p1','board'),blocker=fixture(s,'clan-scout','p2','board',0,true);
  s=resolve(s,attacker,blocker);expect(s.cards[attacker].zone).toBe('discard');expect(s.cards[blocker].zone).toBe('discard');expect(s.players.p2.life).toBe(10);expect(s.players.p2.deathEnergy).toEqual({clans:1});expect(s.players.p1.deathEnergy).toEqual({});
  const hits=s.events.filter(e=>e.type==='damage.dealt'),deaths=s.events.filter(e=>e.type==='creature.destroyed');expect(hits).toHaveLength(2);expect(Math.max(...hits.map(e=>e.seq))).toBeLessThan(Math.min(...deaths.map(e=>e.seq)));assertInvariants(s);
 });
 it('applies full attack damage to a marked armored blocker and still receives retaliation',()=>{
  let s=attackState();s.active='p2';const attacker=fixture(s,'abyss-whelp','p2','board'),blocker=fixture(s,'iron-guard','p1','board');s.cards[blocker].damage=2;
  s=resolve(s,attacker,blocker);expect(s.cards[blocker].zone).toBe('discard');expect(s.cards[attacker].zone).toBe('discard');expect(s.players.p1.life).toBe(10);
  expect(s.events.filter(e=>e.type==='damage.dealt'&&e.target===blocker).map(e=>e.amount)).toEqual([2]);
 });
 it('applies attacker armor to the single return hit',()=>{
  let s=attackState();const attacker=fixture(s,'iron-guard','p1','board'),blocker=fixture(s,'clan-scout','p2','board');
  s=resolve(s,attacker,blocker);expect(s.cards[attacker].zone).toBe('board');expect(s.cards[attacker].damage).toBe(0);expect(s.cards[blocker].zone).toBe('discard');expect(s.events.filter(e=>e.type==='damage.dealt'&&e.target===attacker).map(e=>e.amount)).toEqual([0]);
 });
 it('a killed aura source still strikes, then its aura leaves play',()=>{
  let s=attackState();const attacker=fixture(s,'dawn-banner','p1','board'),sprite=fixture(s,'forest-sprite','p1','board',1),blocker=fixture(s,'abyss-whelp','p2','board');
  expect(effectiveStats(s,sprite,registry).attack).toBe(2);s=resolve(s,attacker,blocker);expect(s.cards[attacker].zone).toBe('discard');expect(s.cards[blocker].zone).toBe('discard');expect(effectiveStats(s,sprite,registry).attack).toBe(1);
 });
 it('attacker deaths alone do not grant defender death energy',()=>{
  let s=attackState();const attacker=fixture(s,'forest-sprite','p1','board'),blocker=fixture(s,'stone-golem','p2','board');s=resolve(s,attacker,blocker);expect(s.cards[attacker].zone).toBe('discard');expect(s.cards[blocker].zone).toBe('board');expect(s.phase).toBe('end');expect(s.combat).toBeNull();expect(s.players.p2.deathEnergy).toEqual({});
 });
 it('serializes separate one-to-one pairs and replays their simultaneous trades exactly',()=>{
  let s=attackState();const one=fixture(s,'forest-sprite','p1','board'),two=fixture(s,'crown-recruit','p1','board',1),first=fixture(s,'clan-scout','p2','board'),second=fixture(s,'wayfarer','p2','board',1);
  s=step(s,{type:'attack',attackers:[one,two]});const pairs=[{attacker:one,blocker:first},{attacker:two,blocker:second}];expect(s.combat?.blocks).toEqual(pairs);expect(s.cards[first].zone).toBe('board');
  const before=JSON.parse(JSON.stringify(s)),envelope:CommandEnvelope={actor:'p1',expectedRevision:s.revision,command:{type:'confirm-combat'}};s=step(s,envelope.command);expect(replay(before,[envelope],registry)).toEqual(s);
  expect(s.cards[one].zone).toBe('discard');expect(s.cards[first].zone).toBe('discard');expect(s.cards[two].damage).toBe(1);expect(s.cards[second].damage).toBe(1);expect(s.players.p2.life).toBe(10);
 });
 it('forecasts a one-to-one mutual trade without mutating the match',()=>{
  let s=attackState();const attacker=fixture(s,'forest-sprite','p1','board'),blocker=fixture(s,'clan-scout','p2','board');s=step(s,{type:'attack',attackers:[attacker]});const before=structuredClone(s);
  expect(combatForecast(s,null,registry)).toEqual({defender:'p2',blocked:1,fallen:1,attackersFallen:1,lifeDamage:0});expect(s).toEqual(before);
 });
 it('retains blocked status if a block trigger removes the defender',()=>{
  const hook:AbilityExtension={id:'escape-block',name:'escape-block',description:'Return this creature to hand when it blocks.',version:1,validate:()=>{},hooks:{'creature.blocked':ctx=>{if(ctx.event.cardId===ctx.source.id)ctx.issue({type:'return',target:ctx.source.id});}}};
  const cards=structuredClone(raw);cards.find(c=>c.id==='ashen-initiate')!.abilities=[{id:hook.id,params:{}}];const r=compileContent(cards,{...abilities,[hook.id]:hook});let s=setup(r);s.phase='attack';s.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};
  const attacker=fixture(s,'crown-recruit','p1','board'),blocker=fixture(s,'ashen-initiate','p2','board');s=resolve(s,attacker,blocker,r);expect(s.cards[blocker].zone).toBe('hand');expect(s.players.p2.life).toBe(10);expect(s.cards[attacker].damage).toBe(0);
 });
 it('completes the return strike before running effects queued by the first hit',()=>{
  const hook:AbilityExtension={id:'return-on-hit',name:'return-on-hit',description:'Return this creature to hand when hit.',version:1,validate:()=>{},hooks:{'damage.dealt':ctx=>{if(ctx.event.target===ctx.source.id)ctx.issue({type:'return',target:ctx.source.id});}}};
  const cards=structuredClone(raw);cards.find(c=>c.id==='wayfarer')!.abilities=[{id:hook.id,params:{}}];const r=compileContent(cards,{...abilities,[hook.id]:hook});let s=setup(r);s.phase='attack';s.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};
  const attacker=fixture(s,'forest-sprite','p1','board'),blocker=fixture(s,'wayfarer','p2','board');s=resolve(s,attacker,blocker,r);expect(s.cards[attacker].zone).toBe('discard');expect(s.cards[blocker].zone).toBe('hand');expect(s.players.p2.life).toBe(10);
  const hits=s.events.filter(e=>e.type==='damage.dealt');expect(hits).toHaveLength(2);expect(Math.max(...hits.map(e=>e.seq))).toBeLessThan(s.events.find(e=>e.type==='card.returned')!.seq);
 });
});
