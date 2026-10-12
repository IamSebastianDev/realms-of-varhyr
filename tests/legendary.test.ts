import { describe, expect, it } from 'vitest';
import { registry as liveRegistry, compileContent } from '../packages/content/src';
import { apply, assertInvariants, createMatch, decisionPlayer, validateDeck } from '../packages/core/src';
import { addDeckCard } from '../apps/web/src/decks';
import type { Command, GameState, PlayerId } from '../packages/contracts/src';

const heroId='aldric-runewarden';
const registry=compileContent([...Object.values(liveRegistry.cards),...Array.from({length:9},(_,i)=>({...liveRegistry.cards['crown-recruit'],id:`test-recruit-${i}`,deckLimitKey:`test-recruit-${i}`}))]);
function heroDeck(){return [...Array.from({length:9},(_,i)=>Array(3).fill(`test-recruit-${i}`)).flat(),'crown-recruit','crown-recruit',heroId];}
function step(state:GameState,command:Command){const result=apply(state,{actor:decisionPlayer(state),expectedRevision:state.revision,command},registry);expect(result.error).toBeUndefined();assertInvariants(result.state);return result.state;}
function move(state:GameState,definitionId:string,owner:PlayerId,slot?:number){
  const player=state.players[owner],id=player.deck.find(id=>state.cards[id].definitionId===definitionId)!;
  expect(id).toBeTruthy();player.deck=player.deck.filter(cardId=>cardId!==id);
  Object.assign(state.cards[id],{zone:slot===undefined?'hand':'board',slot:slot??null,exhausted:false});
  if(slot===undefined)player.hand.push(id);else player.board[slot]=id;
  return id;
}
describe('Aldric, the Runewarden',()=>{
  it('is a playable singleton in the real collection and deck builder',()=>{
    const deck=heroDeck();expect(validateDeck(deck,registry)).toEqual([]);
    expect(addDeckCard(deck,heroId,registry)).toBe(deck);
    expect(validateDeck([...deck,heroId],registry)).toContain('Too many copies of Aldric, the Runewarden.');
  });
  it('requires four energy, enters exhausted, and uses Armor while striking back as a blocker',()=>{
    let state=createMatch(registry,[heroDeck(),heroDeck()],731);
    for(const player of Object.values(state.players)){for(const id of player.hand){state.cards[id].zone='deck';player.deck.push(id);}player.hand=[];}
    const sources=['crown-recruit','test-recruit-0','test-recruit-1','test-recruit-2'].map((def,slot)=>move(state,def,'p1',slot));
    const hero=move(state,heroId,'p1');
    for(const cardId of sources.slice(0,3))state=step(state,{type:'energy',cardId,option:0});
    expect(apply(state,{actor:'p1',expectedRevision:state.revision,command:{type:'play',cardId:hero,slot:4}},registry).error).toBeTruthy();
    state=step(state,{type:'energy',cardId:sources[3],option:0});
    state=step(state,{type:'play',cardId:hero,slot:4});
    expect(Object.values(state.players.p1.energy).every(amount=>amount===0)).toBe(true);expect(state.cards[hero].exhausted).toBe(true);
    const attacker=move(state,heroId,'p2',4);
    state.active='p2';state.phase='attack';state.combat={stage:'declare',attackers:[],lanes:{},blocks:[],dead:[]};
    state=step(state,{type:'attack',attackers:[attacker]});
    
    state=step(state,{type:'confirm-combat'});
    expect(state.cards[hero].zone).toBe('board');expect(state.cards[hero].damage).toBe(2);
    expect(state.cards[attacker].zone).toBe('board');expect(state.cards[attacker].damage).toBe(2);
  });
});
