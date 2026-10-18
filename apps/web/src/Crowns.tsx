import type { PointerEvent } from 'react';
import { t as msg, useLanguage, formatNumber } from '../../../packages/ui/src/i18n';

/** A 3D gold coin stamped with a crown, rendered from a model (scripts/render-crown). `tilt` makes it lean toward the pointer, like the booster packs. */
export function CrownIcon({ className = '', tilt = false, coin = 'crown' }: { className?: string; tilt?: boolean; coin?: 'crown' | 'silver' }) {
  const move = (event: PointerEvent<HTMLSpanElement>) => {
    const box = event.currentTarget.getBoundingClientRect(), x = (event.clientX - box.left) / box.width - .5, y = (event.clientY - box.top) / box.height - .5;
    event.currentTarget.style.setProperty('--ry', `${Math.max(-1, Math.min(1, x * 2)) * 24}deg`);
    event.currentTarget.style.setProperty('--rx', `${-Math.max(-1, Math.min(1, y * 2)) * 24}deg`);
  };
  const reset = (event: PointerEvent<HTMLSpanElement>) => { event.currentTarget.style.removeProperty('--ry'); event.currentTarget.style.removeProperty('--rx'); };
  return <span className={`crown-icon ${coin === 'silver' ? 'silver' : ''} ${tilt ? 'tilt' : ''} ${className}`} aria-hidden="true" {...(tilt ? { onPointerMove: move, onPointerLeave: reset } : {})}/>;
}
/** The expedition's own coin: a silver piece stamped with a crescent and a star (scripts/render-crown/silver.js). */
export const SilverIcon = (props: { className?: string; tilt?: boolean }) => <CrownIcon {...props} coin="silver"/>;
export function CrownAmount({ amount, className = '' }: { amount: number; className?: string }) {
  useLanguage();
  return <span className={`crown-amount ${className}`} aria-label={msg("{v0} {v1}", {v0: formatNumber(amount), v1: amount === 1 ? 'crown' : 'crowns'})}><CrownIcon/><b>{formatNumber(amount)}</b><span>{msg(amount === 1 ? 'crown' : 'crowns')}</span></span>;
}
