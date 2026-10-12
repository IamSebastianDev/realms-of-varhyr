import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { getPreferences, usePreferences, type Language } from '../preferences';
import german from './de.json';
import { registry } from '../../../../packages/content/src';
import type { CardDefinition, AbilityBinding, AbilityExtension } from '../../../../packages/contracts/src';
import { describeAbility } from '../../../../packages/extensions/src/describeAbility';
import { eventMessages } from './messages';
const languageContext = createContext<Language>('en');
export const useLanguage = () => useContext(languageContext);
const dictionary: Record<string, string> = german;
/** Source messages stay in English. Content IDs and commands never pass through this function. Card references use authored translations. */
const cardText: Record<string,string> = {};
for (const card of Object.values(registry.cards)) {
  if (card.translations?.de?.name) cardText[card.name] = card.translations.de.name;
  if (card.lore && card.translations?.de?.lore !== undefined) cardText[card.lore] = card.translations.de.lore;
}
const escape = (text:string) => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const names = Object.keys(cardText).sort((a,b)=>b.length-a.length);
const contentPattern = new RegExp(names.length ? names.map(escape).join('|') : '(?!)','g');
export function localizedCard(card: CardDefinition, language = getPreferences().language): CardDefinition {
  const text = card.translations?.[language];
  return text ? { ...card, name: text.name ?? card.name, lore: text.lore ?? card.lore, subtypes: text.subtypes ?? card.subtypes } : card;
}
export function localizedAbility(binding: AbilityBinding, extension: AbilityExtension, language = getPreferences().language) {
  const text = extension.translations?.[language];
  const params = Object.fromEntries(Object.entries(binding.params).map(([key,value])=>[key,typeof value==='string'?translate(value,language):value]));
  return describeAbility({ ...binding, params },text?{ ...extension, ...text }:extension);
}
const abilityPatterns = Object.values(registry.abilities).flatMap(extension=>{
  const de=extension.translations?.de;if(!de)return [];
  return (['name','description'] as const).map(field=>{
    const keys:string[]=[];
    const pattern=extension[field].split(/(\{\w+\})/).map(part=>{if(/^\{\w+\}$/.test(part)){keys.push(part.slice(1,-1));return '(.+?)';}return escape(part);}).join('');
    return { expression:new RegExp('^'+pattern+'$'),keys,template:de[field] };
  });
});
export function translate(message: string, language: Language, params: Record<string, string | number | undefined> = {}): string {
  let template = language === 'de' ? dictionary[message] ?? cardText[message] ?? message : message;
  if (language === 'de' && template === message) {
    const pattern = eventMessages.find(([expression])=>expression.test(message));
    if (pattern) template = message.replace(pattern[0],pattern[1]);
    else { const ability=abilityPatterns.find(pattern=>pattern.expression.test(message));if(ability){const values=message.match(ability.expression)!;template=ability.template.replace(/\{(\w+)\}/g,(_placeholder,key)=>{const value=values[ability.keys.indexOf(key)+1];return dictionary[value]??value;});} }
  }
  const translated = template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!Object.hasOwn(params,key)) return match;
    const value = String(params[key] ?? '');
    return language === 'de' ? dictionary[value] ?? cardText[value] ?? value : value;
  });
  if(language!=='de')return translated;
  let output=translated.replace(contentPattern,name=>cardText[name]);
  for(const extension of Object.values(registry.abilities)){const de=extension.translations?.de;if(!de)continue;const keys:string[]=[];const pattern=extension.name.split(/(\{\w+\})/).map(part=>{if(/^\{\w+\}$/.test(part)){keys.push(part.slice(1,-1));return '(\\d+|Left Flank|Left Wing|Center|Right Wing|Right Flank)';}return escape(part);}).join('');output=output.replace(new RegExp(pattern,'g'),(...args)=>de.name.replace(/\{(\w+)\}/g,(_placeholder,key)=>{const value=args[keys.indexOf(key)+1];return dictionary[value]??value;}));}
  return output.replace(/(linke|rechte)?(Left Flank|Left Wing|Center|Right Wing|Right Flank)/g,(_match,_prefix,name)=>dictionary[name]??name);
}
export function t(message: string, params: Record<string, string | number | undefined> = {}) { return translate(message, getPreferences().language, params); }
export const formatNumber = (number: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(getPreferences().language === 'de' ? 'de-DE' : 'en-GB', options).format(number);
export function ApplicationPreferences({ children }: { children: ReactNode }) {
  const preferences = usePreferences();
  useEffect(() => {
    document.documentElement.lang = preferences.language;
    document.documentElement.classList.toggle('reduce-motion', preferences.reduced);
    document.documentElement.dataset.motion = preferences.reduced ? 'reduced' : 'full';
  }, [preferences.language, preferences.reduced]);
  return <languageContext.Provider value={preferences.language}>{children}</languageContext.Provider>;
}
