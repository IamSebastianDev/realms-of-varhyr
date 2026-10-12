import type { CSSProperties } from 'react';
import { avatars } from './profile';

/** A round portrait of the chosen avatar. */
export function Avatar({ id, size, className = '' }: { id: string; size?: number; className?: string }) {
  const choice = avatars.find(a => a.id === id) ?? avatars[0];
  const style = { '--avatar': choice?.accent ?? '#c6ae7c', ...(size ? { width: size, height: size } : {}) } as CSSProperties;
  return <span className={`avatar-art ${size ? '' : 'fill'} ${className}`} style={style} aria-hidden="true">
    {choice && <img src={choice.art} alt="" draggable={false}/>}
  </span>;
}
