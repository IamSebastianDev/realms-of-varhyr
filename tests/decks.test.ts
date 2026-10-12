import { describe, expect, it } from 'vitest';
import type { CommandEnvelope, Registry } from '../packages/contracts/src';
import { registry, starterDecks } from './fixtures/content';
import { addDeckCard, copyCount, parseDeck, parseDecks, removeDeckCard, type CustomDeck } from './fixtures/decks';
import { restoreSession, startMatch, type SavedSession } from './fixtures/session';
import { apply, replay } from '../packages/core/src';
const custom=():CustomDeck=>({id:'custom-test',name:'My woodland deck',cards:[...starterDecks.verdant]});
describe('deck editing and saved collections',()=>{
  it('adds copies up to the limit and removes exactly one without mutating the draft',()=>{
    let cards:string[]=[];for(let i=0;i<3;i++)cards=addDeckCard(cards,'forest-sprite');
    expect(copyCount(cards,'forest-sprite')).toBe(3);expect(addDeckCard(cards,'forest-sprite')).toBe(cards);
    expect(removeDeckCard(cards,'forest-sprite')).toHaveLength(2);expect(cards).toHaveLength(3);expect(addDeckCard(cards,'missing')).toBe(cards);
  });
  it('shares copy limits across variants and restricts legendary cards to one',()=>{
    const sprite=registry.cards['forest-sprite'];
    const r:Registry={...registry,cards:{...registry.cards,variant:{...sprite,id:'variant'},legend:{...sprite,id:'legend',deckLimitKey:'legend',legendary:true}}};
    const cards=['forest-sprite','variant','forest-sprite'];expect(addDeckCard(cards,'variant',r)).toBe(cards);expect(copyCount(cards,'variant',r)).toBe(3);
    const one=addDeckCard([],'legend',r);expect(addDeckCard(one,'legend',r)).toBe(one);
  });
  it('round-trips saved decks and incomplete drafts while rejecting corrupt entries',()=>{
    const deck=custom(),incomplete={...custom(),id:'custom-draft',cards:['forest-sprite']};
    const input=[deck,incomplete,deck,{...custom(),id:'verdant'},{...custom(),cards:['missing']},{...custom(),cards:Array(4).fill('forest-sprite')},null];
    expect(parseDecks(JSON.stringify(input))).toEqual([deck,incomplete]);expect(parseDecks('{invalid')).toEqual([]);
    expect(parseDeck({...incomplete,name:''})).toBeNull();expect(parseDeck({...incomplete,name:''},true)?.cards).toEqual(incomplete.cards);
  });
});
describe('playing custom decks',()=>{
  it('starts a match with the custom composition and name without retaining editable references',()=>{
    const deck=custom();deck.cards=deck.cards.map(id=>id==='cleansing-light'?'final-bargain':id);
    const state=startMatch(42,'verdant',false,deck),ids=Object.values(state.cards).filter(c=>c.owner==='p1').map(c=>c.definitionId);
    expect(state.players.p1.name).toBe(deck.name);expect(state.players.p2.name).toBe('The Hollow Court');expect(ids.filter(id=>id==='final-bargain')).toHaveLength(3);expect(ids).not.toContain('cleansing-light');
    deck.cards.length=0;expect(Object.values(state.cards).filter(c=>c.owner==='p1')).toHaveLength(30);
  });
  it('allows saving unfinished decks but refuses to play them',()=>{
    const deck={...custom(),cards:['forest-sprite']};expect(parseDeck(deck)).toEqual(deck);expect(()=>startMatch(42,'verdant',false,deck)).toThrow('30 cards');
  });
  it('retains the custom snapshot during stale-session recovery and exact replay',()=>{
    const deck=custom(),initial=startMatch(42,'verdant',false,deck),entry:CommandEnvelope={actor:'p1',expectedRevision:0,command:{type:'end'}};
    const saved:SavedSession={initial,commands:[entry],mode:'practice',deck:'verdant',skirmish:false,customDeck:structuredClone(deck),started:true};
    initial.pending=null;const restored=restoreSession(JSON.parse(JSON.stringify(saved)));expect(replay(restored.initial,restored.commands,registry)).toEqual(apply(initial,entry,registry).state);
    saved.initial.rulesVersion='previous-rules';const recovered=restoreSession(saved);expect(recovered.commands).toEqual([]);expect(recovered.initial.players.p1.name).toBe(deck.name);expect(recovered.customDeck).toEqual(deck);expect(recovered.initial).toEqual(startMatch(42,'verdant',false,deck));
  });
});
