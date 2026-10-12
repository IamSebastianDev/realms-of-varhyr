import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registry } from '../packages/content/src';
import { importCardAssets, readCardAssets } from '../scripts/card-assets';

const roots:string[]=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=','base64');
// Import checks the EBML/DocType header; playback is outside this filesystem test.
const webmHeader=Buffer.from('1a45dfa38b4282847765626d42858102','hex');
async function fixture(){const root=await mkdtemp(join(tmpdir(),'varhir-assets-test-'));roots.push(root);await mkdir(join(root,'assets'));return root;}
async function card(root:string,folder:string,id='runeguard',overrides:Record<string,unknown>={}){
  const path=join(root,'assets',folder);await mkdir(path,{recursive:true});
  const {art:_art,animation:_animation,...definition}=registry.cards[id];
  await writeFile(join(path,'data.json'),JSON.stringify({...definition,...overrides}));await writeFile(join(path,'data.png'),png);return path;
}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

describe('card asset imports',()=>{
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
    await card(root,'one');await rm(join(root,'assets/two'),{recursive:true});
    expect((await importCardAssets(root,{})).count).toBe(1);await expect(readFile(join(root,'public/cards/two/data.png'))).rejects.toThrow();
    expect((await importCardAssets(root,{})).changed).toBe(false);
  });
  it('imports unfinished starter drafts without relaxing game deck limits',async()=>{
    const root=await fixture();await card(root,'recruit','crown-recruit');
    expect((await importCardAssets(root,{crown:['crown-recruit']})).count).toBe(1);
  });
  it('rejects imports that would break a starter deck before writing any output',async()=>{
    const root=await fixture();await card(root,'runeguard');await expect(importCardAssets(root)).rejects.toThrow('Starter deck');
    await expect(readFile(join(root,'packages/content/src/cards.json'))).rejects.toThrow();
  });
});
