import { describe, expect, it } from 'vitest';
import type { Command, GameState, PlayerId } from '../packages/contracts/src';
import { apply, assertInvariants, createMatch, decisionPlayer } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import { registry, starterDecks } from './fixtures/content';
function setup():GameState {
  const s=createMatch(registry,[starterDecks.verdant,starterDecks.hollow],731);
  for(const p of Object.values(s.players)){for(const id of p.hand){s.cards[id].zone='deck';p.deck.push(id);}p.hand=[];}
  return s;
}
function card(s:GameState,def:string,owner:PlayerId,slot:number|null,exhausted=false):string {
  const p=s.players[owner],id=p.deck.find(id=>s.cards[id].definitionId===def)!;
  if(!id)throw Error(`Missing fixture ${def}`);
  p.deck=p.deck.filter(cid=>cid!==id);Object.assign(s.cards[id],{zone:slot===null?'hand':'board',slot,exhausted});
  if(slot===null)p.hand.push(id);else p.board[slot]=id;return id;
}
function move(s:GameState,command=botCommand(s,registry)) {
  const result=apply(s,{actor:decisionPlayer(s),expectedRevision:s.revision,command},registry);
  expect(result.error).toBeUndefined();assertInvariants(result.state);return result.state;
}
describe('opponent decision regressions',()=>{
  it('preserves attackers when a full board prevents the only possible play',()=>{
    const s=setup();for(let i=0;i<5;i++)card(s,i<3?'forest-sprite':'wayfarer','p1',i);
    card(s,'wild-guardian','p1',null);expect(botCommand(s,registry)).toEqual({type:'end'});
  });
  it('never starts a partial payment when the remaining faction cannot be produced',()=>{
    const s=setup();card(s,'crown-recruit','p1',0);card(s,'runeguard','p1',null);
    expect(botCommand(s,registry)).toEqual({type:'end'});
  });
  it('plans a complete payment from three producers with matching colors',()=>{
    let s=setup();card(s,'crown-recruit','p1',0);card(s,'crown-recruit','p1',1);card(s,'iron-squire','p1',2);
    const upgrade=card(s,'runeguard','p1',null),commands:Command[]=[];
    for(let i=0;i<4;i++){const command=botCommand(s,registry);commands.push(command);s=move(s,command);}
    expect(commands.map(c=>c.type)).toEqual(['energy','energy','energy','play']);expect(s.cards[upgrade].zone).toBe('board');
  });
  it('uses the producer with least attack loss',()=>{
    const s=setup();card(s,'crown-recruit','p1',0);const squire=card(s,'iron-squire','p1',1);card(s,'stone-golem','p2',null);
    // Transfer a neutral-cost upgrade into our hand using a valid local fixture.
    const upgrade=s.players.p2.hand.pop()!;s.cards[upgrade].owner='p1';s.cards[upgrade].controller='p1';s.players.p1.hand.push(upgrade);
    s.players.p1.energy={neutral:1};expect(botCommand(s,registry)).toEqual({type:'energy',cardId:squire,option:0});
  });
  it('uses Homeward to complete an affordable upgrade on a full board',()=>{
    let s=setup();s.active='p2';for(let i=0;i<5;i++)card(s,i<3?'ashen-initiate':'wayfarer','p2',i);
    const bounce=card(s,'homeward','p2',null),upgrade=card(s,'stone-golem','p2',null);s.players.p2.energy={neutral:3};
    const command=botCommand(s,registry);expect(command.type).toBe('play');expect((command as {cardId:string}).cardId).toBe(bounce);
    s=move(s,command);s=move(s);expect(s.cards[upgrade].zone).toBe('board');expect(s.players.p2.board.filter(Boolean)).toHaveLength(5);
  });
  it('does not bounce a creature simply to replay it or attempt an unaffordable upgrade',()=>{
    const s=setup();s.active='p2';for(let i=0;i<5;i++)card(s,i<3?'ashen-initiate':'wayfarer','p2',i,true);
    card(s,'homeward','p2',null);card(s,'stone-golem','p2',null);s.players.p2.energy={neutral:1};
    expect(botCommand(s,registry)).toEqual({type:'end'});
  });
  it('leaves the last slot open for a stronger card payable next cycle',()=>{
    const s=setup();for(let i=0;i<4;i++)card(s,i<3?'forest-sprite':'wayfarer','p1',i,true);
    card(s,'crown-recruit','p1',null);card(s,'wild-guardian','p1',null);
    expect(botCommand(s,registry)).toEqual({type:'end'});
  });
  it('prefers removing a valuable creature over incidental hero damage, but takes lethal',()=>{
    const s=setup(),target=card(s,'abyss-whelp','p2',0),spell=card(s,'cleansing-light','p1',null);s.players.p1.energy={crownlands:1,neutral:1};
    expect(botCommand(s,registry)).toMatchObject({type:'play',cardId:spell,target});
    s.players.p2.life=2;expect(botCommand(s,registry)).toMatchObject({type:'play',cardId:spell,target:'p2'});
  });
  it('does not cast a draw spell that would empty its own library',()=>{
    const s=setup();s.active='p2';card(s,'final-bargain','p2',null);s.players.p2.energy={neutral:1};s.players.p2.life=2;
    const removed=s.players.p2.deck.splice(1);for(const id of removed){s.cards[id].zone='discard';s.players.p2.discard.push(id);}
    expect(botCommand(s,registry)).toEqual({type:'end'});
  });
  function declare(attackers:[string,number][],defenders:[string,number][],life=10) {
    const s=setup();s.active='p2';s.phase='attack';s.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};
    const ids=attackers.map(([def,slot])=>card(s,def,'p2',slot)),blockers=defenders.map(([def,slot])=>card(s,def,'p1',slot));s.players.p1.life=life;
    return {s,ids,blockers};
  }
  it('steps into an open adjacent lane rather than a losing trade in its own lane',()=>{
    const {s,ids}=declare([['clan-scout',1]],[['iron-guard',1]]);
    expect(botCommand(s,registry)).toEqual({type:'attack',attackers:ids,lanes:{[ids[0]]:0}});move(s);
  });
  it('takes lethal damage through an open lane even when its own lane would trade favourably',()=>{
    const {s,ids}=declare([['abyss-whelp',0]],[['grove-keeper',0]],1);
    expect(botCommand(s,registry)).toEqual({type:'attack',attackers:ids,lanes:{[ids[0]]:1}});
    expect(move(move(s)).outcome).toBe('p2');
  });
  it('stays home when every reachable lane holds a defender that wins the exchange',()=>{
    const {s}=declare([['clan-scout',0]],[['iron-guard',0],['iron-guard',1]]);
    expect(botCommand(s,registry)).toEqual({type:'attack',attackers:[],lanes:{}});move(s);
  });
  it('never sends two attackers into one lane, and resolves its own declaration',()=>{
    const {s,ids}=declare([['abyss-whelp',0],['clan-scout',1],['hollow-devourer',2]],[]);
    const command=botCommand(s,registry);expect(command).toMatchObject({type:'attack'});
    const lanes=Object.values((command as Extract<Command,{type:'attack'}>).lanes!);expect(new Set(lanes).size).toBe(lanes.length);expect(lanes).toHaveLength(ids.length);move(s);
  });
  it('skips zero-power attackers and makes the same decision deterministically',()=>{
    const s=setup();const zero=card(s,'iron-squire','p1',0),attack=card(s,'forest-sprite','p1',1);s.phase='attack';s.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};
    expect(botCommand(s,registry)).toEqual({type:'attack',attackers:[attack],lanes:{[attack]:1}});expect(s.cards[zero].exhausted).toBe(false);
    expect(botCommand(structuredClone(s),registry)).toEqual(botCommand(s,registry));
  });
});
