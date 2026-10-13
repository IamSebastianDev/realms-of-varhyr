import type { CSSProperties } from 'react';
import { factionIconPaths } from './factionIcons';

/** One consistent SVG family at every size. The parent controls color; decorative by default. */
export function FactionIcon({faction,className='',label,style}:{faction:string;className?:string;label?:string;style?:CSSProperties}) {
  const id=factionIconPaths[faction]?faction:'neutral';
  return <svg className={`faction-icon ${className}`} data-faction-icon={id} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" focusable="false" aria-hidden={label?undefined:true} role={label?'img':undefined} aria-label={label} style={style}>
    {factionIconPaths[id].map((path,index)=><path key={index} d={path}/>)}
  </svg>;
}
export function GenericEnergyIcon({className='',style}:{className?:string;style?:CSSProperties}={}){return <svg className={`faction-icon generic-energy-icon ${className}`} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 3l8 9-8 9-8-9 8-9Z"/></svg>;}
