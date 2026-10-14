import type { CSSProperties } from 'react';

/** Fixed pseudo-random sparks along the top and side edges of a burning button. */
const sparks = Array.from({ length: 22 }, (_, n) => {
  const r = (k: number) => { const x = Math.sin((n + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const side = n % 5 === 0 ? 0 : n % 5 === 1 ? 100 : -1;
  return {
    '--x': side >= 0 ? `${side}%` : `${(4 + r(1) * 92).toFixed(1)}%`,
    '--y': side >= 0 ? `${(10 + r(2) * 80).toFixed(1)}%` : r(3) > .35 ? '0%' : '100%',
    '--s': `${(3 + r(4) * 3.5).toFixed(1)}px`,
    '--dx': `${((r(5) - .5) * 34).toFixed(0)}px`,
    '--fall': `${(34 + r(6) * 56).toFixed(0)}px`,
    '--t': `${(1.5 + r(7) * 1.4).toFixed(2)}s`,
    '--w': `${(-r(8) * 3).toFixed(2)}s`,
  } as CSSProperties;
});

export function BurnEmbers() {
  return <span className="burn-embers" aria-hidden="true">{sparks.map((style, n) => <i key={n} style={style} />)}</span>;
}
