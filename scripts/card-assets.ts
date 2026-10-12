import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CardDefinition } from '../packages/contracts/src';
import { compileContent } from '../packages/content/src/compiler';
import { starterDecks } from '../packages/content/src/starters';
import { validateDeck } from '../packages/core/src';

type Media={path:string;data:Buffer};
export type AssetCatalogue={cards:CardDefinition[];media:Media[]};
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
const webmSignature=Buffer.from([26,69,223,163]);
const digest=(data:Buffer)=>createHash('sha256').update(data).digest('hex').slice(0,16);
const message=(error:unknown)=>error instanceof Error?error.message:String(error);

async function mediaFile(path:string,optional=false):Promise<Buffer|undefined>{
  try{return await readFile(path);}catch(error){if(optional&&(error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new Error(`${path}: ${message(error)}`);}
}

/** Filesystem authoring stays outside the browser/server-neutral content compiler. */
export async function readCardAssets(assetsDirectory:string):Promise<AssetCatalogue>{
  const cards:CardDefinition[]=[],media:Media[]=[],owners=new Map<string,string>();
  const folders=(await readdir(assetsDirectory,{withFileTypes:true})).filter(entry=>entry.isDirectory()&&!entry.name.startsWith('.')).sort((a,b)=>a.name<b.name?-1:1);
  for(const folder of folders){
    const directory=join(assetsDirectory,folder.name),definitionPath=join(directory,'data.json');
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folder.name))throw new Error(`${directory}: use a lowercase card-name folder with hyphens.`);
    let definition:Record<string,unknown>;
    try{definition=JSON.parse(await readFile(definitionPath,'utf8'));if(!definition||typeof definition!=='object'||Array.isArray(definition))throw new Error('Expected a card definition object.');}
    catch(error){throw new Error(`${definitionPath}: ${message(error)}`);}
    const png=await mediaFile(join(directory,'data.png'));
    if(!png||png.length<24||!png.subarray(0,8).equals(pngSignature)||png.toString('ascii',12,16)!=='IHDR'||png.readUInt32BE(16)===0||png.readUInt32BE(20)===0)throw new Error(`${directory}/data.png: expected a PNG image.`);
    const webm=await mediaFile(join(directory,'data.webm'),true);
    if(webm&&(!webm.subarray(0,4).equals(webmSignature)||!webm.subarray(0,1024).includes(Buffer.from('webm'))))throw new Error(`${directory}/data.webm: expected a WebM video (do not rename MP4 files).`);
    // Media paths come from this folder, never from arbitrary paths in JSON.
    const {art:_art,animation:_animation,...data}=definition;
    const base=`/cards/${folder.name}`;
    const imported={...data,art:`${base}/data.png?v=${digest(png)}`,...(webm?{animation:`${base}/data.webm?v=${digest(webm)}`}:{})};
    let card:CardDefinition;
    try{card=Object.values(compileContent([imported]).cards)[0];}catch(error){throw new Error(`${definitionPath}: ${message(error)}`);}
    const previous=owners.get(card.id);if(previous)throw new Error(`${definitionPath}: duplicate card ID '${card.id}' also defined in ${previous}.`);
    owners.set(card.id,definitionPath);cards.push(card);media.push({path:join(folder.name,'data.png'),data:png});
    if(webm)media.push({path:join(folder.name,'data.webm'),data:webm});
  }
  if(!cards.length)throw new Error(`${assetsDirectory}: no card folders found.`);
  cards.sort((a,b)=>a.id<b.id?-1:1);
  return {cards,media};
}

async function files(directory:string):Promise<string[]>{
  try{
    const entries=await readdir(directory,{withFileTypes:true});
    return (await Promise.all(entries.map(async entry=>entry.isDirectory()?(await files(join(directory,entry.name))).map(path=>join(entry.name,path)):[entry.name]))).flat().sort();
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
}
async function sameFile(path:string,data:Buffer){try{return (await readFile(path)).equals(data);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}

export async function importCardAssets(root:string,decks:Record<string,string[]>=starterDecks){
  const catalogue=await readCardAssets(join(root,'assets')),registry=compileContent(catalogue.cards);
  for(const [name,deck] of Object.entries(decks)){
    const errors=validateDeck(deck,registry);const structuralErrors=errors.filter(error=>!error.startsWith('A deck needs'));
    if(structuralErrors.length)throw new Error(`Starter deck '${name}' is invalid after import: ${structuralErrors.join(' ')}`);
  }
  const output=join(root,'packages/content/src/cards.json'),publicDirectory=join(root,'public'),mediaDirectory=join(publicDirectory,'cards');
  const json=Buffer.from(JSON.stringify(catalogue.cards,null,2)+'\n');
  const contentChanged=!await sameFile(output,json);
  const expected=catalogue.media.map(file=>file.path).sort();
  const mediaChanged=JSON.stringify(await files(mediaDirectory))!==JSON.stringify(expected)||!(await Promise.all(catalogue.media.map(file=>sameFile(join(mediaDirectory,file.path),file.data)))).every(Boolean);
  if(!contentChanged&&!mediaChanged)return {count:catalogue.cards.length,changed:false};
  // Stage every output after validation. A malformed edit leaves the last good import intact.
  await mkdir(publicDirectory,{recursive:true});await mkdir(join(root,'packages/content/src'),{recursive:true});
  const staging=await mkdtemp(join(root,'.card-import-')),stagedJson=join(staging,'catalogue.json'),stagedMedia=join(staging,'cards'),backup=join(staging,'previous-cards');
  let backedUp=false,installed=false;
  try{
    await mkdir(stagedMedia);
    for(const file of catalogue.media){const target=join(stagedMedia,file.path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,file.data);}
    await writeFile(stagedJson,json);
    try{await rename(mediaDirectory,backup);backedUp=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    await rename(stagedMedia,mediaDirectory);installed=true;
    if(contentChanged)await rename(stagedJson,output);
  }catch(error){
    if(installed)await rm(mediaDirectory,{recursive:true,force:true});
    if(backedUp)await rename(backup,mediaDirectory);
    throw new Error(`Card import failed: ${message(error)}`);
  }finally{await rm(staging,{recursive:true,force:true});}
  return {count:catalogue.cards.length,changed:true};
}

export const isCardAssetPath=(root:string,path:string)=>{
  const local=relative(join(root,'assets'),path);
  return !local.startsWith('..')&&/^[^/\\]+[/\\]data\.(json|png|webm)$/.test(local);
};
