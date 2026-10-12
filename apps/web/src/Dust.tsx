import { useId } from 'react';

/** A faceted crystal and loose glowing motes; scales from a currency glyph to the store's dust vessel. */
export function DustIcon({ className = '' }: { className?: string }) {
  const id = useId();
  return <svg className={`dust-icon ${className}`} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <defs><linearGradient id={`${id}-a`} x1="15" y1="5" x2="45" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor="#f4f2ff"/><stop offset=".45" stopColor="#bb9cfa"/><stop offset="1" stopColor="#6b54bc"/></linearGradient></defs>
    <path d="M31 7 47 25 39 51 24 55 14 29Z" fill={`url(#${id}-a)`} stroke="#ecdfff" strokeWidth="1.2"/>
    <path d="m31 7 2 25-19-3 17-22Zm2 25 14-7-8 26-6-19Z" fill="#f3e4ff" fillOpacity=".58"/>
    <path d="m33 32-9 23-10-26 19 3Z" fill="#795cca"/>
    <path d="m31 7 2 25-9 23m9-23 14-7" stroke="#fff4ff" strokeOpacity=".75" strokeWidth="1"/>
    <path d="m52 7 1.5 4.5L58 13l-4.5 1.5L52 19l-1.5-4.5L46 13l4.5-1.5L52 7Z" fill="#f4eaff"/>
    <circle cx="8" cy="16" r="2" fill="#d2b7ff"/><circle cx="52" cy="44" r="2" fill="#e3cbff"/><circle cx="14" cy="53" r="1.3" fill="#f8edff"/>
  </svg>;
}
export function DustAmount({ amount, className = '' }: { amount: number; className?: string }) {
  return <span className={`dust-amount ${className}`} aria-label={`${amount.toLocaleString()} dust`}><DustIcon/><b>{amount.toLocaleString()}</b><span>dust</span></span>;
}
