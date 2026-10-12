import type { CSSProperties } from 'react';
import type { PlayerId } from '../../../packages/contracts/src';

export type EnergyFlight = {
  id: string;
  player: PlayerId;
  from: { x: number; y: number };
  to: { x: number; y: number };
  colors: string[];
};

// Screen-space decoration only: energy is already committed by the rules engine.
export function EnergyFlow({ flights }: { flights: EnergyFlight[] }) {
  return <div className="energy-flows" aria-hidden="true">{flights.map(flight => {
    const { from, to } = flight;
    const path = `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2 + 55} ${Math.min(from.y, to.y) - 85} ${to.x} ${to.y}`;
    return <div className="energy-flight" key={flight.id}>
      <svg><path d={path} stroke={flight.colors[0]} className="energy-stream"/></svg>
      {flight.colors.flatMap((color, i) => [0, 1, 2].map(j => <b key={`${i}-${j}`} className="energy-spark" style={{
        '--spark-color': color, offsetPath: `path("${path}")`, animationDelay: `${(i * 3 + j) * 65}ms`,
      } as CSSProperties}/>))}
    </div>;
  })}</div>;
}
