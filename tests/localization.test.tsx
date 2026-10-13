import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { registry, compileContent } from '../packages/content/src';
import { translate, localizedCard, localizedAbility, subtypeLabel } from '../apps/web/src/i18n';
import { updatePreferences } from '../apps/web/src/preferences';
import { CardDetail } from '../apps/web/src/CardDetail';
import { CardFacts, CardFace, CardLore } from '../apps/web/src/CardPresentation';
import { builderCards, initialBuilderFilters } from '../apps/web/src/deckTools';
import german from '../apps/web/src/i18n/de.json';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
afterEach(()=>{updatePreferences({language:'en'});vi.unstubAllGlobals();});
describe('English and German presentation',()=>{
  it('translates interpolated UI text and preserves missing authored translations',()=>{
    expect(translate('Turn {v0} · {v1}','de',{v0:3,v1:'Opponent’s turn'})).toBe('Zug 3 · Gegner am Zug');
    expect(translate('New expansion name','de')).toBe('New expansion name');
    const card=registry.cards['crown-recruit'];
    expect(localizedCard(card,'en').name).toBe(card.name);
    expect(localizedCard({...card,translations:undefined},'de').name).toBe(card.name);
    expect(card.name).toBe('Crownlands Recruit');
  });
  it('has German names and existing lore for every active card',()=>{
    for(const card of Object.values(registry.cards)){
      expect(card.translations?.de?.name,card.id).toBeTruthy();
      if(card.lore)expect(card.translations?.de?.lore,card.id).toBeTruthy();
      for(const binding of [...card.abilities,...card.cast??[]]){
        const text=localizedAbility(binding,registry.abilities[binding.id],'de');
        expect(text.name).not.toMatch(/\{\w+\}/);expect(text.description).not.toMatch(/\{\w+\}/);
      }
    }
  });
  it('translates subtypes once in the shared dictionary, never per card',()=>{
    const subtypes=new Set(Object.values(registry.cards).flatMap(card=>card.subtypes));
    for(const subtype of subtypes)expect(Object.hasOwn(german,subtype.replace(/\b[a-z]/g,c=>c.toUpperCase())),`German term for '${subtype}'`).toBe(true);
    expect(subtypeLabel('human','de')).toBe('Mensch');expect(subtypeLabel('human','en')).toBe('Human');
    for(const card of Object.values(registry.cards))expect(Object.keys(card.translations?.de??{}).filter(key=>!['name','lore'].includes(key)),card.id).toEqual([]);
  });
  it('renders German card faces, lore and rules without changing card IDs or rules',()=>{
    vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{}});updatePreferences({language:'de'});
    const card=registry.cards['aldric-runewarden'];
    expect(renderToStaticMarkup(<CardFace card={card}/>)).toContain('Alderic, Heermeister des Imperiums');
    expect(renderToStaticMarkup(<CardLore card={card}/>)).toContain('Auf Ariannas Geheiß');
    expect(renderToStaticMarkup(<CardFacts card={card}/>)).toContain('Rüstung 1');
    expect(renderToStaticMarkup(<CardFacts card={card}/>)).toContain('Verringere jeden erlittenen Schaden um 1');
    vi.stubGlobal('window',{matchMedia:()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}})});
    const inspector=renderToStaticMarkup(<CardDetail card={card}/>);
    expect(inspector).toContain('<h2>Alderic, Heermeister des Imperiums</h2>');
    expect(inspector).toContain('Die Kronlande');
    expect(inspector).not.toContain('Alderic, Warmaster of the Empire');
    expect(card.id).toBe('aldric-runewarden');expect(card.name).toBe('Alderic, Warmaster of the Empire');
  });
  it('validates author translations and excludes presentation text from the gameplay content hash',()=>{
    const {translations:_translations,...card}=registry.cards['crown-recruit'];
    const english=compileContent([card]);
    const translated=compileContent([{...card,translations:{de:{name:'Rekrut',lore:'Ein Schwur.'}}}]);
    expect(translated.version).toBe(english.version);
    expect(translated.cards[card.id].translations?.de?.name).toBe('Rekrut');
    expect(()=>compileContent([{...card,translations:{de:{name:''}}}])).toThrow();
    expect(()=>compileContent([{...card,translations:{xx:{name:'wrong'}}}])).toThrow();
  });
  it('localizes position parameters without changing the engine binding',()=>{
    const binding={id:'charge',params:{amount:4,position:'Center'}};
    const text=localizedAbility(binding,registry.abilities.charge,'de');
    expect(text.name).toBe('Ansturm 4 · Mitte');
    expect(text.description).toContain('Position Mitte');
    expect(binding.params.position).toBe('Center');
  });
  it('finds cards by German names and localized ability vocabulary',()=>{
    expect(builderCards(registry,[],{...initialBuilderFilters,query:'Goldfeldbauer'}).map(card=>card.id)).toContain('goldfield-farmer');
    expect(builderCards(registry,[],{...initialBuilderFilters,query:'Rüstung'}).map(card=>card.id)).toContain('aldric-runewarden');
  });
  it('translates public log text and tutorial card references only for display',()=>{
    expect(translate('Crownlands Recruit takes 2 damage from Cleansing Light.','de')).toBe('Rekrut der Kronlande erleidet 2 Schaden durch Läuterndes Licht.');
    const template='Drag Goldfield Farmer onto the center slot. Creatures enter exhausted, so it can’t make energy until your next turn.';
    expect(translate(template,'de')).toContain('Ziehe Goldfeldbauer');
    expect(translate(template,'en')).toBe(template);
  });
  it('keeps a German catalogue entry for each literal UI translation key',()=>{
    const files=['ResetControls.tsx','AudioExperience.tsx','App.tsx','Lobby.tsx','SettingsPage.tsx','GameSetup.tsx','DeckBuilder.tsx','CardPresentation.tsx','CardDetail.tsx','DrawChoice.tsx','MatchSummary.tsx','BoosterOpening.tsx','ProfilePage.tsx','CollectionStats.tsx','CardPurchase.tsx','Onboarding.tsx','multiplayer/MultiplayerLobby.tsx'];
    const missing=new Set<string>();
    for(const file of files){const tree=ts.createSourceFile(file,readFileSync(`apps/web/src/${file}`,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
      function scan(node:ts.Node){if(ts.isCallExpression(node)&&['t','msg'].includes(node.expression.getText(tree))&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){
        const key=node.arguments[0].text;if(!Object.hasOwn(german,key))missing.add(key);
      }ts.forEachChild(node,scan);}scan(tree);
    }
    expect([...missing]).toEqual([]);
  });
});
