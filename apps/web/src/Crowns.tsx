import { t as msg, useLanguage, formatNumber } from '../../../packages/ui/src/i18n';
import { useId } from 'react';

/** A minted gold coin stamped with a crown; scales from a currency glyph to the store's treasure display. */
export function CrownIcon({ className = '' }: { className?: string }) {
  useLanguage();
  const id = useId();
  return <svg className={`crown-icon ${className}`} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-a`} x1="12" y1="8" x2="52" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor="#fff1b8"/><stop offset=".45" stopColor="#e0b44e"/><stop offset="1" stopColor="#9b6a1c"/></linearGradient>
      <linearGradient id={`${id}-b`} x1="20" y1="20" x2="44" y2="46" gradientUnits="userSpaceOnUse"><stop stopColor="#fff6cf"/><stop offset="1" stopColor="#b98424"/></linearGradient>
    </defs>
    <circle cx="32" cy="32" r="27" fill={`url(#${id}-a)`} stroke="#fff0b0" strokeWidth="1.5"/>
    <circle cx="32" cy="32" r="21.5" fill="#7d5314" fillOpacity=".38" stroke="#fbe49a" strokeOpacity=".7" strokeWidth="1" strokeDasharray="2 2.4"/>
    <path d="M18 43 15.5 25l9 8 7.5-14 7.5 14 9-8L46 43H18Z" fill={`url(#${id}-b)`} stroke="#5d3b08" strokeOpacity=".6" strokeWidth="1.1" strokeLinejoin="round"/>
    <path d="M18.5 46.5h27" stroke="#5d3b08" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="15.5" cy="24" r="2" fill="#fff2bd"/><circle cx="32" cy="17.5" r="2" fill="#fff2bd"/><circle cx="48.5" cy="24" r="2" fill="#fff2bd"/>
    <path d="M14 20a24 24 0 0 1 14-10" stroke="#fff" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}
export function CrownAmount({ amount, className = '' }: { amount: number; className?: string }) {
  useLanguage();
  return <span className={`crown-amount ${className}`} aria-label={msg("{v0} {v1}", {v0: formatNumber(amount), v1: amount === 1 ? 'crown' : 'crowns'})}><CrownIcon/><b>{formatNumber(amount)}</b><span>{amount === 1 ? 'crown' : 'crowns'}</span></span>;
}
