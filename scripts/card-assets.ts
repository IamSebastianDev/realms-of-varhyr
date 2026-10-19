import { writeCardJsonSchema } from './card-schema';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CardDefinition } from '../packages/contracts/src';
import { compileContent, parseCardTranslation, unknownCardReferences } from '../packages/content/src/compiler';
import { abilities } from '../packages/extensions/src';
import { parseFactionDefinition, validateFactionSet, type FactionDefinition } from '../packages/content/src/factionDefinition';
import { parseSetDefinition, validateSetDefinitions, type SetDefinition } from '../packages/content/src/setDefinition';
import { validateDeck } from '../packages/core/src';

type Media={path:string;data:Buffer};
export type AssetCatalogue={cards:CardDefinition[];factions:FactionDefinition[];sets:SetDefinition[];media:Media[]};
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
const webmSignature=Buffer.from([26,69,223,163]);
const digest=(data:Buffer)=>createHash('sha256').update(data).digest('hex').slice(0,16);
const message=(error:unknown)=>error instanceof Error?error.message:String(error);

async function mediaFile(path:string,optional=false):Promise<Buffer|undefined>{
  try{return await readFile(path);}catch(error){if(optional&&(error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new Error(`${path}: ${message(error)}`);}
}

const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** assets/factions/<id>.json, one file per faction. The file name must match the faction ID. */
export async function readFactionAssets(assetsDirectory:string):Promise<FactionDefinition[]>{
  const directory=join(assetsDirectory,'factions');
  let entries;
  try{entries=(await readdir(directory,{withFileTypes:true})).filter(entry=>entry.isFile()&&!entry.name.startsWith('.')).sort((a,b)=>a.name<b.name?-1:1);}
  catch(error){throw new Error(`${directory}: ${message(error)}`);}
  const factions:FactionDefinition[]=[];
  for(const entry of entries){
    const path=join(directory,entry.name);
    if(!entry.name.endsWith('.json'))throw new Error(`${path}: faction files must be named <faction-id>.json.`);
    try{
      const faction=parseFactionDefinition(JSON.parse(await readFile(path,'utf8')));
      if(entry.name!==`${faction.id}.json`)throw new Error(`file name must match the faction ID ('${faction.id}.json').`);
      factions.push(faction);
    }catch(error){throw new Error(`${path}: ${message(error)}`);}
  }
  if(!factions.length)throw new Error(`${directory}: no faction files found.`);
  try{return validateFactionSet(factions);}catch(error){throw new Error(`${directory}: ${message(error)}`);}
}

/** Set IDs are independent of factions, card IDs and artwork folders. */
export async function readSetAssets(assetsDirectory:string,factions:FactionDefinition[]):Promise<SetDefinition[]>{
  const directory=join(assetsDirectory,'sets');
  let entries;
  try{entries=(await readdir(directory,{withFileTypes:true})).filter(entry=>entry.isFile()&&!entry.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name));}
  catch(error){throw new Error(`${directory}: ${message(error)}`);}
  const sets:SetDefinition[]=[];
  for(const entry of entries){
    const path=join(directory,entry.name);
    try{
      if(!entry.name.endsWith('.json'))throw new Error('set files must be named <set-id>.json.');
      const set=parseSetDefinition(JSON.parse(await readFile(path,'utf8')));
      if(entry.name!==`${set.id}.json`)throw new Error(`file name must match the set ID ('${set.id}.json').`);
      sets.push(set);
    }catch(error){throw new Error(`${path}: ${message(error)}`);}
  }
  if(!sets.length)throw new Error(`${directory}: no set files found.`);
  try{return validateSetDefinitions(sets,factions);}catch(error){throw new Error(`${directory}: ${message(error)}`);}
}

/** Languages with a data.<language>.json next to the English card. English is the source language and has no file. */
const translationLanguages=['de'] as const;

/** Reads the optional translated fields of one card: assets/cards/<card>/data.<language>.json holds only name and lore. */
async function readCardTranslations(directory:string):Promise<Record<string,{name:string;lore?:string}>>{
  const translations:Record<string,{name:string;lore?:string}>={};
  for(const entry of (await readdir(directory,{withFileTypes:true})).filter(entry=>entry.isFile())){
    const match=/^data\.([a-z]{2})\.json$/.exec(entry.name);
    if(!match)continue;
    const path=join(directory,entry.name),language=match[1];
    if(!(translationLanguages as readonly string[]).includes(language))throw new Error(`${path}: unsupported language '${language}'. Supported: ${translationLanguages.join(', ')}.`);
    try{translations[language]=parseCardTranslation(JSON.parse(await readFile(path,'utf8')));}catch(error){throw new Error(`${path}: ${message(error)}`);}
  }
  return translations;
}

/** Filesystem authoring stays outside the browser/server-neutral content compiler. Cards live in assets/cards, factions in assets/factions, sets in assets/sets. */
export async function readCardAssets(assetsDirectory:string):Promise<AssetCatalogue>{
  const factions=await readFactionAssets(assetsDirectory),factionIds=factions.map(faction=>faction.id).filter(id=>id!=='neutral');
  const sets=await readSetAssets(assetsDirectory,factions),setIds=new Set(sets.map(set=>set.id));
  const cardsDirectory=join(assetsDirectory,'cards');
  const cards:CardDefinition[]=[],media:Media[]=[],owners=new Map<string,string>();
  const folders=(await readdir(cardsDirectory,{withFileTypes:true})).filter(entry=>entry.isDirectory()&&!entry.name.startsWith('.')).sort((a,b)=>a.name<b.name?-1:1);
  for(const folder of folders){
    const directory=join(cardsDirectory,folder.name),definitionPath=join(directory,'data.json');
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folder.name))throw new Error(`${directory}: use a lowercase card-name folder with hyphens.`);
    let definition:Record<string,unknown>;
    try{definition=JSON.parse(await readFile(definitionPath,'utf8'));if(!definition||typeof definition!=='object'||Array.isArray(definition))throw new Error('Expected a card definition object.');}
    catch(error){throw new Error(`${definitionPath}: ${message(error)}`);}
    if('translations' in definition)throw new Error(`${definitionPath}: remove "translations" and put the translated name and lore in ${join(directory,'data.de.json')}.`);
    if(typeof definition.set!=='string'||!setIds.has(definition.set))throw new Error(`${definitionPath}: set must name a defined set in assets/sets/ (received '${String(definition.set)}').`);
    const png=await mediaFile(join(directory,'data.png'));
    if(!png||png.length<24||!png.subarray(0,8).equals(pngSignature)||png.toString('ascii',12,16)!=='IHDR'||png.readUInt32BE(16)===0||png.readUInt32BE(20)===0)throw new Error(`${directory}/data.png: expected a PNG image.`);
    const webm=await mediaFile(join(directory,'data.webm'),true);
    if(webm&&(!webm.subarray(0,4).equals(webmSignature)||!webm.subarray(0,1024).includes(Buffer.from('webm'))))throw new Error(`${directory}/data.webm: expected a WebM video (do not rename MP4 files).`);
    const translations=await readCardTranslations(directory);
    // Media paths come from this folder, never from arbitrary paths in JSON.
    const {art:_art,animation:_animation,...data}=definition;
    const base=`/cards/${folder.name}`;
    const imported={...data,...(Object.keys(translations).length?{translations}:{}),art:`${base}/data.png?v=${digest(png)}`,...(webm?{animation:`${base}/data.webm?v=${digest(webm)}`}:{})};
    let card:CardDefinition;
    try{card=Object.values(compileContent([imported],undefined,undefined,factionIds).cards)[0];}catch(error){throw new Error(`${definitionPath}: ${message(error)}`);}
    const previous=owners.get(card.id);if(previous)throw new Error(`${definitionPath}: duplicate card ID '${card.id}' also defined in ${previous}.`);
    owners.set(card.id,definitionPath);cards.push(card);media.push({path:join(folder.name,'data.png'),data:png});
    if(webm)media.push({path:join(folder.name,'data.webm'),data:webm});
  }
  if(!cards.length)throw new Error(`${cardsDirectory}: no card folders found.`);
  const unknown=unknownCardReferences(cards)[0];
  if(unknown)throw new Error(`${owners.get(unknown.cardId)}: ${unknown.message}`);
  cards.sort((a,b)=>a.id<b.id?-1:1);
  return {cards,factions,sets,media};
}

async function files(directory:string):Promise<string[]>{
  try{
    const entries=await readdir(directory,{withFileTypes:true});
    return (await Promise.all(entries.map(async entry=>entry.isDirectory()?(await files(join(directory,entry.name))).map(path=>join(entry.name,path)):[entry.name]))).flat().sort();
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
}
async function sameFile(path:string,data:Buffer){try{return (await readFile(path)).equals(data);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}

/** Starter decks come from the faction files unless a caller supplies its own (tests). */
export async function importCardAssets(root:string,override?:Record<string,string[]>){
  const catalogue=await readCardAssets(join(root,'assets')),decks=override??Object.fromEntries(catalogue.factions.flatMap(faction=>faction.starter?[[faction.starter.id,Object.entries(faction.starter.cards).flatMap(([card,copies])=>Array<string>(copies).fill(card))]]:[])),registry=compileContent(catalogue.cards,undefined,undefined,catalogue.factions.map(faction=>faction.id).filter(id=>id!=='neutral'));
  for(const [name,deck] of Object.entries(decks)){
    const errors=validateDeck(deck,registry);const structuralErrors=errors.filter(error=>!error.startsWith('A deck needs'));
    if(structuralErrors.length)throw new Error(`Starter deck '${name}' is invalid after import: ${structuralErrors.join(' ')}`);
  }
  await writeCardJsonSchema(root,catalogue.factions,catalogue.sets);
  const output=join(root,'packages/content/src/cards.json'),factionOutput=join(root,'packages/content/src/factions.json'),setOutput=join(root,'packages/content/src/sets.json'),publicDirectory=join(root,'public'),mediaDirectory=join(publicDirectory,'cards');
  const json=Buffer.from(JSON.stringify(catalogue.cards,null,2)+'\n');
  const factionJson=Buffer.from(JSON.stringify(catalogue.factions,null,2)+'\n');
  const setJson=Buffer.from(JSON.stringify(catalogue.sets,null,2)+'\n');
  const contentChanged=!await sameFile(output,json)||!await sameFile(factionOutput,factionJson)||!await sameFile(setOutput,setJson);
  const expected=catalogue.media.map(file=>file.path).sort();
  const mediaChanged=JSON.stringify(await files(mediaDirectory))!==JSON.stringify(expected)||!(await Promise.all(catalogue.media.map(file=>sameFile(join(mediaDirectory,file.path),file.data)))).every(Boolean);
  if(!contentChanged&&!mediaChanged)return {count:catalogue.cards.length,factions:catalogue.factions.length,sets:catalogue.sets.length,changed:false};
  // Stage every output after validation. A malformed edit leaves the last good import intact.
  await mkdir(publicDirectory,{recursive:true});await mkdir(join(root,'packages/content/src'),{recursive:true});
  const staging=await mkdtemp(join(root,'.card-import-')),stagedJson=join(staging,'catalogue.json'),stagedFactions=join(staging,'factions.json'),stagedSets=join(staging,'sets.json'),stagedMedia=join(staging,'cards'),backup=join(staging,'previous-cards');
  let backedUp=false,installed=false;
  try{
    await mkdir(stagedMedia);
    for(const file of catalogue.media){const target=join(stagedMedia,file.path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,file.data);}
    await writeFile(stagedJson,json);await writeFile(stagedFactions,factionJson);await writeFile(stagedSets,setJson);
    try{await rename(mediaDirectory,backup);backedUp=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    await rename(stagedMedia,mediaDirectory);installed=true;
    if(contentChanged){await rename(stagedSets,setOutput);await rename(stagedFactions,factionOutput);await rename(stagedJson,output);}
  }catch(error){
    if(installed)await rm(mediaDirectory,{recursive:true,force:true});
    if(backedUp)await rename(backup,mediaDirectory);
    throw new Error(`Card import failed: ${message(error)}`);
  }finally{await rm(staging,{recursive:true,force:true});}
  return {count:catalogue.cards.length,factions:catalogue.factions.length,sets:catalogue.sets.length,changed:true};
}

export const isCardAssetPath=(root:string,path:string)=>{
  const local=relative(join(root,'assets'),path);
  return !local.startsWith('..')&&(/^cards[/\\][^/\\]+[/\\]data(?:\.[a-z]{2})?\.(json|png|webm)$/.test(local)||/^(?:factions|sets)[/\\][^/\\]+\.json$/.test(local));
};
