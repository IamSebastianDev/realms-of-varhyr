import { t as msg, useLanguage, localizedCard, localizedAbility } from './i18n';
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { CardHoverDetail } from './CardDetail';
import { useSingleLineName } from './useSingleLineName';
import { CardArtwork } from '../../../packages/renderer/src/CardArtwork';
import { HolographicFoil } from '../../../packages/renderer/src/HolographicFoil';
import { Castle, Shield, Swords } from 'lucide-react';
import type { CardDefinition, EnergyType, Pool } from '../../../packages/contracts/src';
import { factionInfo, registry } from '../../../packages/content/src';
import { usePreferences } from './preferences';
export function cardAbilityDescriptions(card: CardDefinition) {
  return [...card.abilities, ...(card.cast ?? [])].map(binding =>
    localizedAbility(binding, registry.abilities[binding.id]),
  );
}
export function CardLore({card,className=''}:{card:CardDefinition;className?:string}) {
  useLanguage();
  card=localizedCard(card);
  return card.lore?.trim() ? <blockquote className={`card-lore ${className}`} aria-label={msg("Lore")}>{card.lore}</blockquote> : null;
}
export function cardClassification(card:CardDefinition) {
  const subtypes=card.subtypes.map(subtype=>subtype.trim()).filter(Boolean);
  if(card.type==='creature'&&subtypes.length) {
    return subtypes.map(subtype=>subtype.replace(/\b[a-z]/g,letter=>letter.toUpperCase())).map(subtype=>msg(subtype)).join(' · ');
  }
  return msg(card.type.charAt(0).toUpperCase()+card.type.slice(1));
}
export function cardIdentity(card:CardDefinition) {
  const faction=card.factions.map(f=>msg(factionInfo[f].short)).join(' / ')||msg("Neutral");
  return msg("{v0} · {v1}", {v0: faction, v1: cardClassification(card)});
}
function hasEnergyCost(card:CardDefinition) {
  return card.cost.generic>0||Object.values(card.cost.factions).some(amount=>amount>0);
}
export function Cost({card}:{card:CardDefinition}) {
  useLanguage();
  if(!hasEnergyCost(card))return null;
  return <span className="cost-bundle">{card.cost.generic>0&&<span className="cost-generic" title={msg("Generic: any energy")}>{card.cost.generic}◇</span>}{Object.entries(card.cost.factions).filter(([,amount])=>amount>0).map(([color,amount])=><span key={color} style={{color:factionInfo[color as EnergyType].color}} title={msg(factionInfo[color as EnergyType].name)}>{amount}{factionInfo[color as EnergyType].symbol}</span>)}</span>;
}
export function Energy({pool}:{pool:Pool}) {
  useLanguage();
  const entries=Object.entries(pool).filter(([,v])=>v!>0);
  return <span className="energy-bundle">{entries.length?entries.map(([c,n])=>{const faction=factionInfo[c as EnergyType];return <span className="energy-token" key={c} title={msg("{v0} {v1} energy", {v0: n, v1: c==='crownlands'?msg('Crownlands'):msg(faction.name)})} aria-label={msg("{v0} {v1} energy", {v0: n, v1: c==='crownlands'?msg('Crownlands'):msg(faction.name)})}><span className="energy-symbol" style={{color:faction.color}} aria-hidden="true">{faction.symbol}</span><b>{n}</b></span>;}):<span className="energy-empty">—</span>}</span>;
}
export function EnergyOutput({outputs}:{outputs:Pool[]}) {
  useLanguage();
  return <span className="energy-output" aria-label={msg("Energy produced")}>{outputs.map((pool,i)=><span className="output-option" key={i}>{i>0&&<small className="output-or">{msg("or")}</small>}<Energy pool={pool}/></span>)}</span>;
}
export function LegendaryMark() {
  useLanguage();
  return <span className="legendary-mark" title={msg("Legendary · one copy per deck")}>{msg("Legendary")}<span className="sr-only"> {msg("· one copy per deck")}</span></span>;
}
/** The printed face of a card (shade, cost, name, stats, energy). ArtCard puts it over the artwork; the board puts it over the 3D art. */
export function CardFace({card,stats,showCost=true}:{card:CardDefinition;stats?:{attack:number;defense:number};showCost?:boolean}) {
  useLanguage();
  card=localizedCard(card);
  const nameRef=useSingleLineName<HTMLHeadingElement>(card.name);
  return <>
    <div className="card-shade"/>
    {showCost&&hasEnergyCost(card)&&<span className="card-cost"><Cost card={card}/></span>}
    <div className="card-information">
    <div className="card-header">
      <h3 ref={nameRef}>{card.name}</h3>
      <div className="card-identity"><span className="card-affiliation">{cardIdentity(card)}</span></div>
    </div>
    {card.type!=='spell'&&<div className="card-title">
      <div className="card-statline">
        <span title={card.type==='bastion'?msg("Defensive damage"):msg("Attack")}><Swords/>{stats?.attack??card.stats!.attack}</span>
        <span title={msg("Defense")}><Shield/>{stats?.defense??card.stats!.defense}</span>
      </div>
      {card.type==='creature'&&<div className="card-energy-output"><EnergyOutput outputs={card.stats!.energyOutputs}/></div>}
    </div>}
    </div>
    <span className="card-corners"/>
  </>;
}
export function ArtCard({card,onClick,selected=false,disabled=false,className='',stats,interaction,animated=false,reduced=false,detail=true}:{card:CardDefinition;/** Show the hover detail panel. On by default for every card; off where the caller supplies its own (hand, board) or the card is already shown in detail. */detail?:boolean;animated?:boolean;reduced?:boolean;interaction?:Pick<ButtonHTMLAttributes<HTMLButtonElement>,'id'|'title'|'aria-label'|'aria-disabled'|'onContextMenu'|'onPointerDown'|'onPointerEnter'|'onPointerLeave'|'onFocus'|'onBlur'>;onClick?:()=>void;selected?:boolean;disabled?:boolean;className?:string;stats?:{attack:number;defense:number}}) {
  useLanguage();
  card=localizedCard(card);
  const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[hoverRect,setHoverRect]=useState<DOMRect|null>(null),hoverTimer=useRef(0);
  const showDetail=(element:HTMLElement)=>{if(!detail)return;window.clearTimeout(hoverTimer.current);hoverTimer.current=window.setTimeout(()=>setHoverRect(element.getBoundingClientRect()),350);};
  const hideDetail=()=>{window.clearTimeout(hoverTimer.current);setHoverRect(null);};
  useEffect(()=>()=>window.clearTimeout(hoverTimer.current),[]);
  const preview=hoverRect&&<CardHoverDetail card={card} rect={hoverRect} reduced={reduced}/>;
  const body=<>
    <CardArtwork art={card.art} animation={card.animation} alt={msg("{v0} illustration", {v0: card.name})} playing={animated||hovered||focused} reduced={reduced}/>
    {card.legendary&&<HolographicFoil playing={animated||hovered||focused} reduced={reduced}/>}
    <CardFace card={card} stats={stats}/>
  </>;
  return onClick?<button {...interaction} onPointerEnter={e=>{if(e.pointerType!=='touch'){setHovered(true);showDetail(e.currentTarget);}interaction?.onPointerEnter?.(e);}} onPointerLeave={e=>{setHovered(false);hideDetail();interaction?.onPointerLeave?.(e);}} onPointerDown={e=>{hideDetail();interaction?.onPointerDown?.(e);}} onFocus={e=>{setFocused(true);if(e.currentTarget.matches(':focus-visible'))showDetail(e.currentTarget);interaction?.onFocus?.(e);}} onBlur={e=>{setFocused(false);hideDetail();interaction?.onBlur?.(e);}} className={`art-card ${card.legendary?'legendary-card':''} ${card.type==='bastion'?'bastion-card':''} ${className} ${selected?'selected':''} ${disabled?'unaffordable':''}`} onClick={()=>{hideDetail();onClick();}} aria-label={interaction?.['aria-label']??msg("{v0}, {v1}{v2}. {v3}", {v0: card.name, v1: card.legendary?msg('legendary')+' ':'', v2: msg(card.type), v3: [card.lore, ...cardAbilityDescriptions(card).map(ability => ability.description)].filter(Boolean).join(' ')})} aria-pressed={interaction?.['aria-label']?undefined:selected}>{body}{preview}</button>:<div className={`art-card ${card.legendary?'legendary-card':''} ${card.type==='bastion'?'bastion-card':''} ${className}`} onPointerEnter={e=>{if(e.pointerType!=='touch')showDetail(e.currentTarget);}} onPointerLeave={hideDetail} onPointerDown={hideDetail}>{body}{preview}</div>;
}
export function CardFacts({card,stats}:{card:CardDefinition;stats?:{attack:number;defense:number}}) {
  useLanguage();
  card=localizedCard(card);
  const abilities = cardAbilityDescriptions(card);
  return <div className="card-facts">
    {card.legendary && <LegendaryMark/>}
    {card.type !== 'spell' && <>
      <div className="fact-stats">
        <span><Swords size={14}/><b>{stats?.attack ?? card.stats!.attack}</b> {card.type==='bastion'?msg("Defensive damage"):msg("Attack")}</span>
        <span><Shield size={14}/><b>{stats?.defense ?? card.stats!.defense}</b> {msg("Defense")}</span>
      </div>
      {card.type==='creature'?<div className="fact-energy"><span>{msg("ENERGY OUTPUT")}</span><EnergyOutput outputs={card.stats!.energyOutputs}/></div>:<p className="bastion-rules"><Castle size={16}/>{msg("Can block · cannot attack or generate energy.")}</p>}
    </>}
    {abilities.length > 0 && <dl className="ability-facts" aria-label={card.type === 'spell' ? msg("Spell effects") : msg("Abilities")}>
      {abilities.map((ability, index) => <div className="ability-fact" key={index}>
        <dt>{ability.name}</dt>
        <dd>{ability.description}</dd>
      </div>)}
    </dl>}
  </div>;
}


export function CardListName({name}:{name:string}) {
  useLanguage();
  const ref=useSingleLineName<HTMLSpanElement>(msg(name));
  return <span ref={ref} className="card-list-name">{msg(name)}</span>;
}

/** Wraps a button that stands for a card (a list row) so it shows the same hover detail as a card tile. */
export function CardHoverButton({card,onClick,className,ariaLabel,children}:{card:CardDefinition;onClick:()=>void;className:string;ariaLabel:string;children:React.ReactNode}) {
  useLanguage();
  const {reduced}=usePreferences();
  const [rect,setRect]=useState<DOMRect|null>(null),timer=useRef(0);
  const show=(element:HTMLElement)=>{window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>setRect(element.getBoundingClientRect()),350);};
  const hide=()=>{window.clearTimeout(timer.current);setRect(null);};
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);
  return <button className={className} aria-label={ariaLabel}
    onPointerEnter={e=>{if(e.pointerType!=='touch')show(e.currentTarget);}} onPointerLeave={hide} onPointerDown={hide}
    onFocus={e=>{if(e.currentTarget.matches(':focus-visible'))show(e.currentTarget);}} onBlur={hide}
    onClick={()=>{hide();onClick();}}>{children}{rect&&<CardHoverDetail card={card} rect={rect} reduced={reduced}/>}</button>;
}
