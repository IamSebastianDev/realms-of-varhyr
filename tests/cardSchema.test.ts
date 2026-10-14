import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { buildCardJsonSchema, buildCardTranslationJsonSchema } from '../scripts/card-schema';
import { readFactionAssets, readSetAssets } from '../scripts/card-assets';
import { compileContent, factionDefinitions, registry, setDefinitions } from '../packages/content/src';

const schema=buildCardJsonSchema(factionDefinitions,setDefinitions);
const ajv=new Ajv({strict:false,allErrors:true}),validate=ajv.compile(schema);
const card=(id='crown-recruit')=>{
  const {art:_art,animation:_animation,translations:_translations,...source}=structuredClone(registry.cards[id]);
  return source as Record<string,unknown>;
};

describe('card authoring JSON Schema',()=>{
  it('validates every actual card and keeps the committed schema synchronized with source metadata',async()=>{
    expect(ajv.validateSchema(schema)).toBe(true);
    const directory=join(process.cwd(),'assets'),factions=await readFactionAssets(directory),sets=await readSetAssets(directory,factions);
    expect(JSON.parse(await readFile(join(directory,'schemas/card.schema.json'),'utf8'))).toEqual(buildCardJsonSchema(factions,sets));
    for(const entry of await readdir(join(directory,'cards'),{withFileTypes:true}))if(entry.isDirectory()&&!entry.name.startsWith('.')){
      const definition=JSON.parse(await readFile(join(directory,'cards',entry.name,'data.json'),'utf8'));
      expect(validate(definition),`${entry.name}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(definition.$schema).toBe('../../schemas/card.schema.json');
    }
  });
  it('includes newly authored factions and sets without hardcoded enums, while rejecting unknown IDs and energy keys',()=>{
    const expanded=buildCardJsonSchema([...factionDefinitions,{id:'test-realm',name:'Test Realm',short:'Test',color:'#abc123'}],[...setDefinitions,{id:'test-set',name:'Test set',code:'TST',description:'Test',color:'#abc123',symbol:'T',factions:[],introduces:[]}]);
    const expandedValidate=ajv.compile({...expanded,$id:'urn:realms-of-varhyr:test-card'});
    const source={...card(),factions:['test-realm'],set:'test-set',cost:{generic:0,factions:{'test-realm':1}},stats:{attack:0,defense:1,energyOutputs:[{'test-realm':1},{neutral:1}]}};
    expect(expandedValidate(source)).toBe(true);expect(validate(source)).toBe(false);
    for(const energy of ['generic','primal','winter-leauge','unknown']){
      expect(validate({...card(),stats:{attack:1,defense:1,energyOutputs:[{[energy]:1}]}})).toBe(false);
    }
    expect(validate({...card(),cost:{generic:1,factions:{neutral:1}}})).toBe(false);
  });
  it('enforces neutral affiliation, valid enums, whole nonnegative amounts and meaningful stats',()=>{
    for(const factions of [[],['neutral'],['crownlands','winter-league']])expect(validate({...card(),factions})).toBe(true);
    for(const factions of [['neutral','crownlands'],['crownlands','crownlands'],['unknown']])expect(validate({...card(),factions})).toBe(false);
    for(const type of ['monster','static'])expect(validate({...card(),type})).toBe(false);
    expect(validate({...card(),rarity:'epic'})).toBe(false);
    for(const generic of [-1,1.5])expect(validate({...card(),cost:{generic,factions:{}}})).toBe(false);
    expect(validate({...card(),stats:{attack:0,defense:0,energyOutputs:[]}})).toBe(false);
    expect(validate({...card(),stats:{attack:0,defense:1,energyOutputs:[]}})).toBe(true);
  });
  it('uses the registered ability parameter schemas, including position enums and faction-exclusive keywords',()=>{
    const withAbility=(id:string,params:Record<string,unknown>)=>({...card(),abilities:[{id,params}]});
    expect(validate(withAbility('charge',{amount:4,position:'Center'}))).toBe(true);
    for(const params of [{amount:4},{amount:0,position:'Center'},{amount:4,position:'Middle'}])expect(validate(withAbility('charge',params))).toBe(false);
    expect(validate(withAbility('armor',{amount:2}))).toBe(true);
    for(const params of [{},{amount:1.5},{ammount:2}])expect(validate(withAbility('armor',params))).toBe(false);
    expect(validate(withAbility('missing-ability',{}))).toBe(false);
    expect(validate(withAbility('primal',{amount:1}))).toBe(false);
    expect(validate(withAbility('accord',{}))).toBe(false);
    expect(validate({...withAbility('accord',{}),factions:['crownlands','winter-league']})).toBe(true);
    expect(validate({...withAbility('wayfarer',{}),factions:['neutral']})).toBe(true);
    expect(validate(withAbility('wayfarer',{}))).toBe(false);
  });
  it('checks type-specific fields and spell operations without coupling rarity to legendary status',()=>{
    expect(validate(card('ancient-unicorn'))).toBe(true);
    expect(validate({...card('crown-holding'),stats:{attack:1,defense:4,energyOutputs:[{crownlands:1}]}})).toBe(false);
    expect(validate({...card('crown-holding'),abilities:[{id:'primal',params:{}}]})).toBe(false);
    expect(validate({...card(),timing:['play']})).toBe(false);
    const spell=card('cleansing-light');expect(validate(spell)).toBe(true);
    expect(validate({...spell,stats:{attack:0,defense:1}})).toBe(false);
    expect(validate({...spell,cast:[]})).toBe(false);
    expect(validate({...spell,cast:[{id:'armor',params:{amount:1}}]})).toBe(false);
    expect(validate({...spell,abilities:[{id:'primal',params:{}}]})).toBe(false);
    expect(validate({...spell,timing:['combat']})).toBe(false);
  });
  it('validates optional lore, flags unknown fields and rejects translations in data.json, leaving the gameplay hash unchanged',()=>{
    expect(validate({...card(),lore:''})).toBe(true);
    expect(validate({...card(),translations:{de:{name:'Neue Karte'}}})).toBe(false);
    expect(validate({...card(),text:'Old rules field'})).toBe(false);
    expect(validate({...card(),cost:{generic:0,faction:{crownlands:1}}})).toBe(false);
    const source=registry.cards['ancient-unicorn'];
    expect(compileContent([{...source,$schema:'../../schemas/card.schema.json'}]).version).toBe(compileContent([source]).version);
  });
  it('has a separate schema for data.<language>.json with only the translated fields',()=>{
    const translation=ajv.compile(buildCardTranslationJsonSchema());
    expect(translation({$schema:'../../schemas/card-translation.schema.json',name:'Rekrut',lore:'Ein Schwur.'})).toBe(true);
    expect(translation({name:'Rekrut'})).toBe(true);
    for(const bad of [{},{name:' '},{name:'Rekrut',subtypes:['Kreatur']},{name:'Rekrut',type:'Kreatur'},{name:'Rekrut',lore:3}])expect(translation(bad),JSON.stringify(bad)).toBe(false);
    expect(JSON.parse(readFileSync(join(process.cwd(),'assets/schemas/card-translation.schema.json'),'utf8'))).toEqual(buildCardTranslationJsonSchema());
    for(const entry of readdirSync(join(process.cwd(),'assets/cards'),{withFileTypes:true}))if(entry.isDirectory()){
      const file=join(process.cwd(),'assets/cards',entry.name,'data.de.json');
      if(existsSync(file)){const data=JSON.parse(readFileSync(file,'utf8'));expect(translation(data),`${entry.name}: ${JSON.stringify(translation.errors)}`).toBe(true);expect(data.$schema).toBe('../../schemas/card-translation.schema.json');}
    }
  });
});
