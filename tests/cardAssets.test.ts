import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultDeckId, factionDefinitions, factionInfo, registry, starterDecks, starterDefinitions } from '../packages/content/src';
import { factions } from '../packages/content/src/factions';
import { boosterPacks, packCards } from '../packages/content/src/boosters';
import { importCardAssets, readCardAssets, readFactionAssets, readSetAssets, isCardAssetPath } from '../scripts/card-assets';

const roots:string[]=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=','base64');
// Import checks the EBML/DocType header; playback is outside this filesystem test.
const webmHeader=Buffer.from('1a45dfa38b4282847765626d42858102','hex');
const crownlands={id:'crownlands',name:'The Crownlands',short:'Crown',color:'#deb966',pack:{id:'crown',name:'Banners of the Crown',blurb:'Only Crownlands cards.'}};
async function faction(root:string,definition:Record<string,unknown>=crownlands,file=`${definition.id}.json`){
  await mkdir(join(root,'assets/factions'),{recursive:true});await writeFile(join(root,'assets/factions',file),JSON.stringify(definition));
}
const neutral={id:'neutral',name:'Neutral',short:'Neutral',color:'#c6c3b5'};
async function fixture(){const root=await mkdtemp(join(tmpdir(),'varhir-assets-test-'));roots.push(root);await mkdir(join(root,'assets/cards'),{recursive:true});await faction(root);await faction(root,neutral);await mkdir(join(root,'assets/sets'),{recursive:true});await writeFile(join(root,'assets/sets/foundations.json'),JSON.stringify({id:'foundations',name:'Foundations',code:'FND',description:'Test set',color:'#d4bd85',symbol:'⟐',factions:['crownlands']}));return root;}
async function card(root:string,folder:string,id='runeguard',overrides:Record<string,unknown>={}){
  const path=join(root,'assets/cards',folder);await mkdir(path,{recursive:true});
  const {art:_art,animation:_animation,translations,...definition}=registry.cards[id];
  await writeFile(join(path,'data.json'),JSON.stringify({...definition,...overrides}));await writeFile(join(path,'data.png'),png);
  if(translations?.de)await writeFile(join(path,'data.de.json'),JSON.stringify(translations.de));
  return path;
}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

describe('card asset imports',()=>{
  it('requires a known set for every authored card and preserves generated sets on failure',async()=>{
    const root=await fixture(),path=await card(root,'runeguard');
    await importCardAssets(root,{});
    const setOutput=join(root,'packages/content/src/sets.json'),cardOutput=join(root,'packages/content/src/cards.json');
    const saved=await readFile(setOutput,'utf8'),savedCards=await readFile(cardOutput,'utf8');
    expect(JSON.parse(saved)[0].id).toBe('foundations');
    for(const set of [undefined,'unreleased',42]){
      await card(root,'runeguard','runeguard',{set});
      await expect(importCardAssets(root,{})).rejects.toThrow(`${path}/data.json: set must name a defined set`);
      expect(await readFile(setOutput,'utf8')).toBe(saved);
      expect(await readFile(cardOutput,'utf8')).toBe(savedCards);
    }
  });
  it('validates set files with their source path and watches only authored set paths',async()=>{
    const root=await fixture();await card(root,'runeguard');await importCardAssets(root,{});
    const path=join(root,'assets/sets/foundations.json'),output=join(root,'packages/content/src/sets.json');
    const saved=await readFile(output,'utf8');
    await writeFile(path,JSON.stringify({id:'foundations',name:'Broken'}));
    await expect(readSetAssets(join(root,'assets'),await readFactionAssets(join(root,'assets')))).rejects.toThrow(path);
    await expect(importCardAssets(root,{})).rejects.toThrow(path);expect(await readFile(output,'utf8')).toBe(saved);
    expect(isCardAssetPath(root,path)).toBe(true);
    expect(isCardAssetPath(root,join(root,'assets/cards/runeguard/data.de.json'))).toBe(true);
    expect(isCardAssetPath(root,join(root,'assets/cards/runeguard/notes.de.json'))).toBe(false);
    expect(isCardAssetPath(root,output)).toBe(false);
    expect(isCardAssetPath(root,join(root,'assets/sets/foundations.png'))).toBe(false);
    expect(isCardAssetPath(root,join(root,'../assets/sets/foundations.json'))).toBe(false);
  });
  it('preserves optional lore and rejects non-text lore with its source path',async()=>{
    const root=await fixture();
    const path=await card(root,'runeguard','runeguard',{lore:'An ancient oath.\nAn unbroken watch.'});
    await card(root,'recruit','crown-recruit',{lore:undefined});
    const imported=(await readCardAssets(join(root,'assets'))).cards;
    expect(imported.find(c=>c.id==='runeguard')?.lore).toBe('An ancient oath.\nAn unbroken watch.');
    expect(imported.find(c=>c.id==='crown-recruit')?.lore).toBeUndefined();
    await card(root,'runeguard','runeguard',{lore:42});
    await expect(readCardAssets(join(root,'assets'))).rejects.toThrow(`${path}/data.json`);
  });
  it('reads translated name and lore from data.<language>.json and keeps them out of data.json',async()=>{
    const root=await fixture(),path=await card(root,'runeguard');
    const german=registry.cards.runeguard.translations!.de!;
    expect((await readCardAssets(join(root,'assets'))).cards[0].translations).toEqual({de:german});
    await writeFile(join(path,'data.de.json'),JSON.stringify({$schema:'../../schemas/card-translation.schema.json',name:'Runenwache'}));
    expect((await readCardAssets(join(root,'assets'))).cards[0].translations).toEqual({de:{name:'Runenwache'}});
    await rm(join(path,'data.de.json'));
    expect((await readCardAssets(join(root,'assets'))).cards[0].translations).toBeUndefined();
    await card(root,'runeguard','runeguard',{translations:{de:{name:'Alt'}}});
    await expect(readCardAssets(join(root,'assets'))).rejects.toThrow(/data\.json: remove "translations".*data\.de\.json/);
  });
  it.each([
    ['an unsupported language','data.fr.json',{name:'Garde'},'unsupported language'],
    ['an empty name','data.de.json',{name:' '},'data.de.json'],
    ['a missing name','data.de.json',{lore:'Nur Text'},'data.de.json'],
    ['per-card subtypes','data.de.json',{name:'Runenwache',subtypes:['Kreatur']},'data.de.json'],
  ])('rejects %s in a translation file with its path',async(_label,file,content,expected)=>{
    const root=await fixture(),path=await card(root,'runeguard');
    await writeFile(join(path,file),JSON.stringify(content));
    if(file==='data.fr.json')await rm(join(path,'data.de.json'));
    await expect(readCardAssets(join(root,'assets'))).rejects.toThrow(expected);
    await expect(readCardAssets(join(root,'assets'))).rejects.toThrow(join(path,file));
  });
  it('keeps IDs and Crown/neutral factions in definitions and derives safe media URLs',async()=>{
    const root=await fixture();await card(root,'a-new-name');await card(root,'lantern','crown-recruit',{factions:[],stats:{attack:1,defense:2,energyOutputs:[{neutral:1}]},art:'../../outside.png',animation:'/old-video.mp4'});
    const catalogue=await readCardAssets(join(root,'assets'));
    expect(catalogue.cards.map(c=>c.id)).toEqual(['crown-recruit','runeguard']);
    expect(catalogue.cards[1].factions).toEqual(['crownlands']);expect(catalogue.cards[0].factions).toEqual([]);
    expect(catalogue.cards[1].art).toMatch(/^\/cards\/a-new-name\/data\.png\?v=[a-f0-9]{16}$/);
    expect(catalogue.cards.every(c=>c.animation===undefined)).toBe(true);
  });
  it('adds optional WebM animation and fingerprints same-name media replacements',async()=>{
    const root=await fixture(),path=await card(root,'runeguard');
    await writeFile(join(path,'data.webm'),webmHeader);
    const before=(await readCardAssets(join(root,'assets'))).cards[0];expect(before.animation).toMatch(/data\.webm\?v=/);
    await writeFile(join(path,'data.png'),Buffer.concat([png,Buffer.from('changed')]));
    const after=(await readCardAssets(join(root,'assets'))).cards[0];expect(after.art).not.toBe(before.art);expect(after.animation).toBe(before.animation);
    await rm(join(path,'data.webm'));expect((await readCardAssets(join(root,'assets'))).cards[0].animation).toBeUndefined();
  });
  it('names both source folders when stable card IDs collide',async()=>{
    const root=await fixture();await card(root,'one');await card(root,'two');
    await expect(readCardAssets(join(root,'assets'))).rejects.toThrow(/two.*data\.json.*duplicate card ID 'runeguard'.*one/);
  });
  it.each(['data.json','data.png'])('rejects missing %s with its source path',async(file)=>{
    const root=await fixture(),path=await card(root,'runeguard');await rm(join(path,file));
    await expect(readCardAssets(join(root,'assets'))).rejects.toThrow(`${path}/${file}`);
  });
  it('rejects corrupt definitions, unknown abilities, invalid artwork and mislabeled videos',async()=>{
    const root=await fixture(),path=await card(root,'runeguard');
    await writeFile(join(path,'data.json'),'{');await expect(readCardAssets(join(root,'assets'))).rejects.toThrow('data.json');
    await card(root,'runeguard','runeguard',{abilities:[{id:'unknown-hook',params:{}}]});await expect(readCardAssets(join(root,'assets'))).rejects.toThrow('Unknown ability');
    await card(root,'runeguard');await writeFile(join(path,'data.png'),'not a PNG');await expect(readCardAssets(join(root,'assets'))).rejects.toThrow('expected a PNG');
    await card(root,'runeguard');await writeFile(join(path,'data.webm'),'MP4 renamed to WebM');await expect(readCardAssets(join(root,'assets'))).rejects.toThrow('expected a WebM');
  });
  it('leaves the last good output intact on failure and removes stale generated media on success',async()=>{
    const root=await fixture(),path=await card(root,'one');await card(root,'two','crown-recruit');
    expect((await importCardAssets(root,{})).count).toBe(2);
    const output=join(root,'packages/content/src/cards.json'),saved=await readFile(output,'utf8');
    await writeFile(join(path,'data.json'),'broken');await expect(importCardAssets(root,{})).rejects.toThrow('data.json');
    expect(await readFile(output,'utf8')).toBe(saved);expect(await readFile(join(root,'public/cards/two/data.png'))).toEqual(png);
    await card(root,'one');await rm(join(root,'assets/cards/two'),{recursive:true});
    expect((await importCardAssets(root,{})).count).toBe(1);await expect(readFile(join(root,'public/cards/two/data.png'))).rejects.toThrow();
    expect((await importCardAssets(root,{})).changed).toBe(false);
  });
  it('imports unfinished starter drafts without relaxing game deck limits',async()=>{
    const root=await fixture();await card(root,'recruit','crown-recruit');
    expect((await importCardAssets(root,{crown:['crown-recruit']})).count).toBe(1);
  });
  it('rejects imports that would break a starter deck before writing any output',async()=>{
    const root=await fixture();await faction(root,{...crownlands,starter:{id:'crown',name:'Crown',cards:{runeguard:5}}});await card(root,'runeguard');await expect(importCardAssets(root)).rejects.toThrow('Starter deck');
    await expect(readFile(join(root,'packages/content/src/cards.json'))).rejects.toThrow();
  });
  it('reads factions from assets/factions and generates factions.json with the catalogue',async()=>{
    const root=await fixture();await card(root,'recruit','crown-recruit');
    await faction(root,{id:'ashen-reach',name:'The Ashen Reach',short:'Ash',color:'#c06a48'});
    expect((await readFactionAssets(join(root,'assets'))).map(f=>f.id)).toEqual(['ashen-reach','crownlands','neutral']);
    const result=await importCardAssets(root,{});expect(result.factions).toBe(3);
    expect(JSON.parse(await readFile(join(root,'packages/content/src/factions.json'),'utf8')).map((f:{id:string})=>f.id)).toEqual(['ashen-reach','crownlands','neutral']);
    expect((await importCardAssets(root,{})).changed).toBe(false);
  });
  it('lets cards use a faction defined in assets/factions and rejects unknown ones',async()=>{
    const root=await fixture();await faction(root,{id:'ashen-reach',name:'The Ashen Reach',short:'Ash',color:'#c06a48'});
    const ash={factions:['ashen-reach'],stats:{attack:1,defense:1,energyOutputs:[{'ashen-reach':1}]}};
    await card(root,'ash','crown-recruit',ash);
    expect((await readCardAssets(join(root,'assets'))).cards[0].factions).toEqual(['ashen-reach']);
    await rm(join(root,'assets/factions/ashen-reach.json'));
    await expect(readCardAssets(join(root,'assets'))).rejects.toThrow('ash/data.json');
  });
  it.each([
    ['a file name that differs from the ID',{...crownlands,id:'crownlands'},'other.json','file name must match'],
    ['a malformed color',{...crownlands,color:'gold'},undefined,'color'],
    ['unknown keys',{...crownlands,colour:'#fff'},undefined,'colour'],
    ['an empty name',{...crownlands,name:' '},undefined,'name'],
  ])('rejects %s with its source path',async(_label,definition,file,expected)=>{
    const root=await fixture();await rm(join(root,'assets/factions/crownlands.json'));await faction(root,definition,file);
    await card(root,'recruit','crown-recruit');
    await expect(readFactionAssets(join(root,'assets'))).rejects.toThrow(expected);
    await expect(readFactionAssets(join(root,'assets'))).rejects.toThrow(join(root,'assets/factions'));
  });
  it('rejects duplicate pack IDs across factions',async()=>{
    const root=await fixture();await faction(root,{id:'twin',name:'Twin',short:'Twin',color:'#336699',pack:{id:'crown',name:'Twin pack',blurb:'Twin.'}});
    await expect(readFactionAssets(join(root,'assets'))).rejects.toThrow(/booster pack ID/);
  });
  it('requires at least one faction file and the built-in neutral faction',async()=>{
    const root=await fixture();await rm(join(root,'assets/factions/crownlands.json'));await rm(join(root,'assets/factions/neutral.json'));
    await expect(readFactionAssets(join(root,'assets'))).rejects.toThrow('no faction files');
    await faction(root);await expect(readFactionAssets(join(root,'assets'))).rejects.toThrow("Missing the built-in 'neutral' faction");
  });
  it('keeps neutral a presentation-only faction: it costs generic energy and is not a named faction',()=>{
    expect(factionInfo.neutral.name).toBe('Neutral');expect(Object.keys(factionInfo).at(-1)).toBe('neutral');
    expect(factions).toEqual(['black-host','bright-marches','conclave','crownlands','ember-fields','horde','mountain-clans','winter-league']);
  });
  it('reads starter decks from the faction file, and validates them against the cards',async()=>{
    const root=await fixture();await card(root,'recruit','crown-recruit');
    await faction(root,{...crownlands,starter:{id:'crown',name:'Crown',cards:{'crown-recruit':3}}});
    expect((await importCardAssets(root)).changed).toBe(true);
    await faction(root,{...crownlands,starter:{id:'crown',name:'Crown',cards:{'not-a-card':3}}});
    await expect(importCardAssets(root)).rejects.toThrow("Starter deck 'crown'");
  });
  it('rejects duplicate starter IDs, several defaults and empty starters',async()=>{
    const root=await fixture(),starter=(id:string,extra={})=>({id,name:id,cards:{'crown-recruit':3},...extra});
    await faction(root,{...crownlands,starter:starter('same')});await faction(root,{id:'twin',name:'Twin',short:'Twin',color:'#336699',starter:starter('same')});
    await expect(readFactionAssets(join(root,'assets'))).rejects.toThrow(/starter deck ID 'same'/);
    await faction(root,{...crownlands,starter:starter('one',{default:true})});await faction(root,{id:'twin',name:'Twin',short:'Twin',color:'#336699',starter:starter('two',{default:true})});
    await expect(readFactionAssets(join(root,'assets'))).rejects.toThrow('Only one faction');
    await faction(root,{...crownlands,starter:{id:'one',name:'One',cards:{}}});await rm(join(root,'assets/factions/twin.json'));
    await expect(readFactionAssets(join(root,'assets'))).rejects.toThrow('starter');
  });
  it('builds the game starter decks from the faction file',()=>{
    expect(starterDefinitions.map(deck=>deck.id)).toEqual(['hearth-and-stone','crown']);expect(defaultDeckId).toBe('crown');
    expect(starterDecks.crown).toHaveLength(30);expect(starterDecks.crown.slice(0,3)).toEqual(['goldfield-farmer','goldfield-farmer','goldfield-farmer']);
  });
  it('offers only the general pack and Foundations, preserving the faction catalogue',()=>{
    expect(factionDefinitions.map(f=>f.id)).toEqual(['black-host','bright-marches','conclave','crownlands','ember-fields','horde','mountain-clans','neutral','winter-league']);
    expect(boosterPacks.map(pack=>[pack.id,pack.faction])).toEqual([['bounty',null],['foundations',null]]);
    const cards=Object.values(registry.cards),pool=(id:string)=>packCards(cards,boosterPacks.find(pack=>pack.id===id)!);
    expect(factionDefinitions.every(faction=>!faction.pack)).toBe(true);
    expect(pool('foundations')).toHaveLength(cards.length);expect(pool('bounty')).toHaveLength(cards.length);
  });
});


describe('faction signature imports', () => {
  it('accepts registered signatures and rejects misspelled IDs without replacing the previous catalogue', async () => {
    const root = await fixture(); await card(root, 'runeguard');
    await faction(root, {...crownlands, signatureAbility: 'fealty'});
    await importCardAssets(root, {});
    const output = join(root, 'packages/content/src/factions.json'), before = await readFile(output, 'utf8');
    expect(JSON.parse(before).find((f: {id: string}) => f.id === 'crownlands').signatureAbility).toBe('fealty');
    for (const signatureAbility of ['adjacent-banner','accord']) {
      await faction(root, {...crownlands, signatureAbility});
      await expect(importCardAssets(root, {})).rejects.toThrow("must belong exclusively to 'crownlands'");
      expect(await readFile(output, 'utf8')).toBe(before);
    }
    await faction(root, {...crownlands, signatureAbility: 'formation-typo'});
    await expect(importCardAssets(root, {})).rejects.toThrow("unknown signature ability 'formation-typo'");
    expect(await readFile(output, 'utf8')).toBe(before);
  });
});
