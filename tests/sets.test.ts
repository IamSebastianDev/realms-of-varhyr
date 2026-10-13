import { describe, expect, it } from 'vitest';
import { compileContent, factionDefinitions, registry, setDefinitions, setInfo } from '../packages/content/src';
import { parseSetDefinition, validateSetDefinitions } from '../packages/content/src/setDefinition';
import { boosterPacks, drawBooster, packCards } from '../packages/content/src/boosters';
import { builderCards, initialBuilderFilters } from '../apps/web/src/deckTools';
import { createCollection, openCollectionBooster, parseCollection } from '../apps/web/src/collection';
import { translate } from '../apps/web/src/i18n';

const cards=Object.values(registry.cards),foundations=setInfo.foundations;
describe('logical card sets',()=>{
  it('puts all current cards in RoV: Foundations with independent faction identities',()=>{
    expect(setDefinitions.map(set=>set.id)).toEqual(['foundations']);
    expect(foundations.name).toBe('RoV: Foundations');
    expect(cards.length).toBeGreaterThan(0);expect(cards.every(card=>card.set==='foundations')).toBe(true);
    expect(cards.some(card=>card.factions.length===0)).toBe(true);
    expect(new Set(cards.flatMap(card=>card.factions))).toEqual(new Set(foundations.introduces));
    expect(foundations.introduces).toHaveLength(8);
  });
  it('validates set metadata, unique codes, booster IDs and referenced factions',()=>{
    expect(parseSetDefinition(foundations)).toEqual(foundations);
    expect(()=>parseSetDefinition({...foundations,id:'Bad Name'})).toThrow();
    expect(()=>parseSetDefinition({...foundations,translations:{de:{name:''}}})).toThrow();
    expect(()=>validateSetDefinitions([foundations,foundations],factionDefinitions)).toThrow('Duplicate set ID');
    expect(()=>validateSetDefinitions([foundations,{...foundations,id:'next-set'}],factionDefinitions)).toThrow('Duplicate set code');
    expect(()=>validateSetDefinitions([{...foundations,pack:{...foundations.pack!,id:'bounty'}}],factionDefinitions)).toThrow('booster pack ID');
    expect(()=>validateSetDefinitions([{...foundations,factions:['unknown']}],factionDefinitions)).toThrow('unknown faction');
    expect(()=>validateSetDefinitions([{...foundations,introduces:['unknown']}],factionDefinitions)).toThrow('unknown faction');
    expect(validateSetDefinitions([{...foundations,factions:[],introduces:[],pack:undefined}],factionDefinitions)).toHaveLength(1);
  });
  it('draws five cards by set membership across factions and excludes other releases',()=>{
    const pack=boosterPacks.find(pack=>pack.id==='foundations')!;
    expect(pack.set).toBe('foundations');expect(pack.faction).toBeNull();
    const future={...registry.cards['crown-recruit'],id:'future-recruit',set:'future-set'};
    const pool=packCards([...cards,future],pack);
    expect(pool).toHaveLength(cards.length);expect(pool).not.toContain(future);
    expect(pool.some(card=>!card.factions.length)).toBe(true);
    expect(new Set(pool.flatMap(card=>card.factions))).toEqual(new Set(foundations.introduces));
    expect(drawBooster(pool,()=>0)).toHaveLength(5);
  });
  it('filters by set alongside faction and finds localized set names and codes',()=>{
    const future={...registry.cards['crown-recruit'],id:'future-recruit',deckLimitKey:'future-recruit',set:'future-set'};
    const content=compileContent([...cards,future]);
    expect(builderCards(content,[],{...initialBuilderFilters,set:'future-set'}).map(card=>card.id)).toEqual(['future-recruit']);
    expect(builderCards(content,[],{...initialBuilderFilters,set:'foundations',faction:'neutral'}).every(card=>!card.factions.length)).toBe(true);
    expect(builderCards(content,[],{...initialBuilderFilters,query:'Grundlagen'})).toHaveLength(cards.length);
    expect(builderCards(content,[],{...initialBuilderFilters,query:'FND'})).toHaveLength(cards.length);
    expect(translate(foundations.name,'de')).toBe('RoV: Grundlagen');
    expect(translate(foundations.pack!.blurb,'de')).toBe(foundations.translations!.de!.pack!.blurb);
  });
  it('keeps set metadata out of gameplay compatibility and preserves saved collection identities',()=>{
    const card=registry.cards['crown-recruit'],{set:_set,...legacy}=card;
    const before=compileContent([legacy]),after=compileContent([{...card,set:'another-release'}]);
    expect(after.version).toBe(before.version);expect(after.cards[card.id].set).toBe('another-release');
    const collection=createCollection(before,[card.id,card.id,card.id]);
    collection.packs={bounty:2,foundations:1};
    expect(parseCollection(JSON.stringify(collection),after)).toEqual(collection);
    const opened=openCollectionBooster(collection,boosterPacks.find(pack=>pack.id==='foundations')!,registry,()=>0);
    expect(opened.cards).toHaveLength(5);expect(opened.collection.packs.foundations).toBe(0);
    expect(opened.collection.packs.bounty).toBe(2);expect(collection.packs.foundations).toBe(1);
  });
});
