import { describe, expect, it } from 'vitest';
import type { CustomDeck } from '../apps/web/src/decks';
import { restoreSession, startMatch } from '../apps/web/src/session';
import { compileContent, defaultDeckId, registry, starterDefinitions } from '../packages/content/src';
import { factions } from '../packages/content/src/factions';
import { apply, autoPayment, validateDeck } from '../packages/core/src';
import { abilities } from '../packages/extensions/src';

const allCards = () => Object.values(registry.cards);
function completedTestContent() {
  const extra = Array.from({length:9}, (_,index) => ({
    ...registry.cards['crown-recruit'], id:`authoring-${index}`, deckLimitKey:`authoring-${index}`,
  }));
  const content = {registry:compileContent([...allCards(),...extra]),starters:[{...starterDefinitions[0],cards:starterDefinitions[0].cards.slice(0,10)}]};
  const custom:CustomDeck = {id:'custom-authoring',name:'My test deck',cards:[...extra.flatMap(card=>[card.id,card.id,card.id]),...Array(3).fill('crown-recruit')]};
  return {content,custom};
}

describe('editable Crownlands content',()=>{
  it('exposes the Crown cards and registered authoring abilities',()=>{
    expect(factions).toEqual(['black-host','bright-marches','conclave','crownlands','ember-fields','horde','mountain-clans','winter-league']);
    expect(allCards().map(card=>card.id)).toEqual(expect.arrayContaining(['crown-recruit','dawn-banner','cleansing-light','runeguard','crown-bulwark','aldric-runewarden']));
    expect(allCards().every(card=>card.factions.every(faction=>factions.includes(faction)))).toBe(true);
    expect(Object.keys(abilities).sort()).toEqual(['accord','adjacent-banner','armor','barrage','channel','charge','damage','draw','drillmaster','fealty','flank-evasion','guard','heal','invocation','longshot','marches-rally','primal','raid','rally','rime','sanctuary','scorch','shield-wall','shoulder-to-shoulder','soul-harvest','trade','war-banner','wayfarer']);
    expect(registry.cards.runeguard.stats?.energyOutputs).toEqual([{crownlands:2}]);
    expect(registry.cards['aldric-runewarden'].cost.factions).toEqual({crownlands:2});
    expect(allCards().every(card=>!('text' in card))).toBe(true);
    expect(registry.cards['crown-recruit'].lore).toBe('Every kingdom begins with an oath.');
  });
  it('rejects removed factions and commented abilities during import',()=>{
    expect(()=>compileContent([{...registry.cards['crown-recruit'],factions:['ironbound']}])).toThrow();
    expect(()=>compileContent([{...registry.cards['crown-recruit'],abilities:[{id:'ready',params:{}}]}])).toThrow('Unknown ability ready');
  });
  it('imports explicit or empty neutral affiliation, optional faction costs and neutral production',()=>{
    const card={...registry.cards['crown-recruit'],factions:['neutral'],cost:{generic:3},stats:{attack:4,defense:3,energyOutputs:[{neutral:2}]}};
    const explicit=compileContent([card]),empty=compileContent([{...card,factions:[]}]);
    expect(explicit.cards[card.id].factions).toEqual([]);
    expect(explicit.cards[card.id].cost).toEqual({generic:3,factions:{}});
    expect(explicit.cards[card.id].stats?.energyOutputs).toEqual([{neutral:2}]);
    expect(explicit.version).toBe(empty.version);
    expect(autoPayment({neutral:3},explicit.cards[card.id].cost)).toEqual({neutral:3});
    expect(autoPayment({neutral:3},{generic:0,factions:{crownlands:1}})).toBeNull();
    expect(()=>compileContent([{...card,factions:['neutral','crownlands']}])).toThrow('cannot mix neutral');
    expect(()=>compileContent([{...card,stats:{...card.stats,energyOutputs:[{generic:2}]}}])).toThrow();
  });
  it('supports new faction IDs and energy without changing the engine',()=>{
    const card={...registry.cards['crown-recruit'],factions:['test-one','test-two'],cost:{generic:1,factions:{'test-one':1}},stats:{attack:1,defense:2,energyOutputs:[{'test-one':1},{'test-two':1}]}};
    const compiled=compileContent([card],abilities,'test-content',['crownlands','test-one','test-two']);
    expect(compiled.energyTypes).toEqual(['crownlands','test-one','test-two','neutral']);
    expect(autoPayment({'test-one':1,neutral:1},card.cost)).toEqual({'test-one':1,neutral:1});
    expect(compiled.version).not.toBe(compileContent([card],abilities,'test-content',['test-one','test-two']).version);
  });
  it('keeps the 30-card rule and refuses unfinished starter matches',()=>{
    const unfinished={...starterDefinitions[0],cards:starterDefinitions[0].cards.slice(0,10)};
    expect(validateDeck(unfinished.cards,registry)).toEqual(['A deck needs at least 30 cards.']);
    expect(()=>startMatch(731,unfinished.id,false,undefined,{registry,starters:[unfinished]})).toThrow('30 cards');
  });
  it('can play a complete custom mirror while starters are still unfinished',()=>{
    const {content,custom}=completedTestContent();
    const state=startMatch(731,defaultDeckId,false,custom,content);
    expect(state.players.p1.name).toBe('My test deck');
    expect(state.players.p2.name).toBe('My test deck · opponent');
    expect(Object.values(state.cards).filter(card=>card.owner==='p2')).toHaveLength(30);
    const saved={initial:state,commands:[],mode:'practice' as const,deck:defaultDeckId,skirmish:false,customDeck:structuredClone(custom)};
    expect(restoreSession(saved,content)).toEqual(saved);
    const illegal=apply(state,{actor:'p1',expectedRevision:0,command:{type:'play',cardId:state.players.p1.hand[0],payment:{'unregistered-energy':1}}},content.registry);
    expect(illegal.error).toBeTruthy();expect(illegal.state).toBe(state);
    custom.cards.length=0;expect(Object.keys(state.cards)).toHaveLength(60);
  });
  it('casts Battlefield Hymn, pays its cost and draws two cards',()=>{
    const {content,custom}=completedTestContent();
    const state=startMatch(731,defaultDeckId,false,custom,content);state.pending=null;
    const cardId=state.players.p1.hand[0];
    state.cards[cardId].definitionId='battlefield-hymn';
    state.players.p1.energy={crownlands:1,neutral:2};
    const result=apply(state,{actor:'p1',expectedRevision:state.revision,command:{type:'play',cardId}},content.registry);
    expect(result.error).toBeUndefined();
    expect(result.state.players.p1.hand).toHaveLength(state.players.p1.hand.length+1);
    expect(result.state.players.p1.deck).toHaveLength(state.players.p1.deck.length-2);
    expect(result.state.cards[cardId].zone).toBe('discard');
    expect(Object.values(result.state.players.p1.energy).reduce((sum,n)=>sum+(n??0),0)).toBe(0);
    expect(result.events.filter(event=>event.type==='card.drawn')).toHaveLength(2);
  });
});

describe('opponent deck choice',()=>{
  it('uses the chosen opponent deck, ignores an invalid choice, and survives restore',()=>{
    const mirror=starterDefinitions[0].cards;
    const chosen=startMatch(731,defaultDeckId,false,undefined,undefined,{id:'rival',name:'The Rival',cards:mirror});
    expect(chosen.players.p2.name).toBe('The Rival');
    expect(chosen.players.p2.deck.concat(chosen.players.p2.hand).every(id=>chosen.cards[id].definitionId in registry.cards)).toBe(true);
    const bad=startMatch(731,defaultDeckId,false,undefined,undefined,{id:'tiny',name:'Tiny',cards:mirror.slice(0,3)});
    expect(bad.players.p2.name).not.toBe('Tiny');
    const saved={initial:{...chosen,contentVersion:'old'},commands:[],mode:'practice' as const,deck:defaultDeckId,skirmish:false,opponentDeck:{id:'rival',name:'The Rival',cards:mirror}};
    expect(restoreSession(saved).initial.players.p2.name).toBe('The Rival');
  });
});
