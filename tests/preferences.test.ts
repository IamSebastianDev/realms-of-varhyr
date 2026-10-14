import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let stored: Map<string,string>, windowEvents: Map<string,Function>, mediaEvents: Set<Function>, media: {matches:boolean;addEventListener:Function;removeEventListener:Function};
beforeEach(()=>{
  vi.resetModules();stored=new Map();windowEvents=new Map();mediaEvents=new Set();
  media={matches:false,addEventListener:(_event:string,listener:Function)=>mediaEvents.add(listener),removeEventListener:(_event:string,listener:Function)=>mediaEvents.delete(listener)};
  vi.stubGlobal('localStorage',{getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value)});
  vi.stubGlobal('window',{matchMedia:()=>media,addEventListener:(event:string,listener:Function)=>windowEvents.set(event,listener),removeEventListener:(event:string)=>windowEvents.delete(event)});
});
afterEach(()=>vi.unstubAllGlobals());
describe('application preferences',()=>{
  it('validates unsupported languages and malformed preferences with safe defaults',async()=>{
    const {parsePreferences}=await import('../packages/ui/src/preferences');
    expect(parsePreferences({language:'fr',motion:'random',sound:'true'})).toEqual({language:'en',motion:'system',sound:true,music:true,musicVolume:.35,soundVolume:.65});
    expect(parsePreferences(null)).toEqual({language:'en',motion:'system',sound:true,music:true,musicVolume:.35,soundVolume:.65});
  });
  it('persists language, sound and motion together through reload',async()=>{
    const first=await import('../packages/ui/src/preferences');
    first.updatePreferences({language:'de',sound:true,motion:'reduced'});
    first.updatePreferences({sound:false});
    vi.resetModules();const next=await import('../packages/ui/src/preferences');
    expect(next.getPreferences()).toEqual({language:'de',sound:false,motion:'reduced',reduced:true,music:true,musicVolume:.35,soundVolume:.65});
    expect(JSON.parse(stored.get(next.preferencesKey)!)).toEqual({language:'de',sound:false,motion:'reduced',music:true,musicVolume:.35,soundVolume:.65});
  });
  it('follows OS motion changes only in system mode and removes the exact listener',async()=>{
    const prefs=await import('../packages/ui/src/preferences');let changes=0;
    const stop=prefs.subscribePreferences(()=>changes++);
    expect(prefs.getPreferences().reduced).toBe(false);
    media.matches=true;for(const listener of mediaEvents)listener();
    expect(prefs.getPreferences().reduced).toBe(true);
    prefs.updatePreferences({motion:'full'});
    expect(prefs.getPreferences().reduced).toBe(false);
    const before=changes;for(const listener of mediaEvents)listener();expect(changes).toBe(before);
    stop();expect(mediaEvents.size).toBe(0);expect(windowEvents.size).toBe(0);
  });
  it('refreshes other tabs without requiring a reload',async()=>{
    const prefs=await import('../packages/ui/src/preferences');prefs.subscribePreferences(()=>{});
    const before=prefs.getPreferences();stored.set(prefs.preferencesKey,JSON.stringify({language:'de',motion:'full',sound:true}));
    windowEvents.get('storage')!({key:prefs.preferencesKey});
    expect(prefs.getPreferences()).not.toBe(before);expect(prefs.getPreferences().language).toBe('de');
    expect(prefs.getPreferences()).toBe(prefs.getPreferences());
  });
  it('migrates existing mute choices and validates independent volume settings',async()=>{
    const {parsePreferences}=await import('../packages/ui/src/preferences');
    expect(parsePreferences({sound:false})).toMatchObject({sound:false,music:true,musicVolume:.35,soundVolume:.65});
    expect(parsePreferences({music:false,musicVolume:2,soundVolume:-1})).toMatchObject({music:false,musicVolume:1,soundVolume:0});
    expect(parsePreferences({musicVolume:NaN,soundVolume:'loud'})).toMatchObject({musicVolume:.35,soundVolume:.65});
  });
  it('retains session preferences when storage is unavailable',async()=>{
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}});
    const prefs=await import('../packages/ui/src/preferences');prefs.updatePreferences({language:'de',motion:'reduced'});
    expect(prefs.getPreferences()).toMatchObject({language:'de',reduced:true});
  });
});
