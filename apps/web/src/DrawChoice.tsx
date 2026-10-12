import { Layers, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CardDefinition } from '../../../packages/contracts/src';
import { ArtCard, CardFacts } from './CardPresentation';

export type DrawDestination = 'discard' | 'bottom';
type Props = {
  cards: { id: string; card: CardDefinition }[];
  discardCount: number; discardTop?: CardDefinition; libraryCount: number;
  reduced: boolean; choose: (keep: string, other: DrawDestination) => void;
};
type Ghost = { id: string; x: number; y: number; w: number; h: number; dx: number; dy: number };

/** Draw two, keep one: drag the card you do not want onto the discard pile or under the library. */
export function DrawChoice({ cards, discardCount, discardTop, libraryCount, reduced, choose }: Props) {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [over, setOver] = useState<DrawDestination | null>(null);
  const live = useRef<Ghost | null>(null);
  const zoneAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-draw-zone]') as HTMLElement | null)?.dataset.drawZone as DrawDestination | undefined;
  function reject(id: string, destination: DrawDestination) {
    const keep = cards.find(c => c.id !== id);
    if (keep) choose(keep.id, destination);
  }
  function start(id: string, event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const g = { id, x: event.clientX, y: event.clientY, w: rect.width, h: rect.height, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    live.current = g; setGhost(g);
    event.preventDefault();
  }
  useEffect(() => {
    if (!ghost) return;
    const move = (e: PointerEvent) => {
      if (!live.current) return;
      live.current = { ...live.current, x: e.clientX, y: e.clientY };
      setGhost(live.current); setOver(zoneAt(e.clientX, e.clientY) ?? null);
    };
    const up = (e: PointerEvent) => {
      const g = live.current; live.current = null; setGhost(null); setOver(null);
      const zone = zoneAt(e.clientX, e.clientY);
      if (g && zone) reject(g.id, zone);
    };
    const cancel = () => { live.current = null; setGhost(null); setOver(null); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
  }, [!!ghost]); // eslint-disable-line react-hooks/exhaustive-deps
  const dragged = ghost ? cards.find(c => c.id === ghost.id) : null;
  return <div className="modal-backdrop"><div className="choice-dialog draw-dialog" role="dialog" aria-label="Choose the card to keep">
    <span className="eyebrow">THE PATH AHEAD</span>
    <h2>Keep one. Drag the other away.</h2>
    <p>Drop the card you do not want on the discard pile, or tuck it under your library.</p>
    <div className="draw-board">
      <div className={`draw-zone draw-zone-discard ${over === 'discard' ? 'over' : ''}`} data-draw-zone="discard">
        <span className={`zone-pile ${discardTop ? '' : 'empty'}`}>{discardTop && <img src={discardTop.art} alt="" draggable={false} />}</span>
        <Trash2 size={16} aria-hidden="true" /><b>Discard</b><small>{discardCount} in pile</small>
      </div>
      <div className="draw-cards">{cards.map(({ id, card }) => <div key={id} className={`draw-card ${ghost?.id === id ? 'lifted' : ''}`}>
        <div className="draw-card-art" onPointerDown={e => start(id, e)}><ArtCard card={card} reduced={reduced} /></div>
        <div className="draw-card-text"><CardFacts card={card} /></div>
        <div className="draw-card-fallback"><button onClick={() => reject(id, 'discard')}>Discard this</button><button onClick={() => reject(id, 'bottom')}>Put under library</button></div>
      </div>)}</div>
      <div className={`draw-zone draw-zone-bottom ${over === 'bottom' ? 'over' : ''}`} data-draw-zone="bottom">
        <span className="zone-pile back" /><Layers size={16} aria-hidden="true" /><b>Under the library</b><small>{libraryCount} in library</small>
      </div>
    </div>
    {ghost && dragged && createPortal(<div className="draw-ghost" style={{ left: ghost.x - ghost.dx, top: ghost.y - ghost.dy, width: ghost.w, height: ghost.h }}><ArtCard card={dragged.card} reduced /></div>, document.body)}
  </div></div>;
}
