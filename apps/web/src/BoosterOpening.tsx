import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Crown, X } from 'lucide-react';
import { registry } from '../../../packages/content/src';
import type { CardDefinition } from '../../../packages/contracts/src';
import type { BoosterCardReward } from './boosterRewards';
import { ArtCard } from './CardPresentation';
import { CardDetail } from './CardDetail';

export type OpenBooster = { id: string; cards: BoosterCardReward[]; saved: boolean };

export function BoosterOpening({ pack, reduced, suspended, close, openAnother, inspect, browse }: {
  pack: OpenBooster; reduced: boolean; suspended: boolean; close: () => void; openAnother: () => void;
  inspect: (card: CardDefinition) => void; browse: () => void;
}) {
  const [opened, setOpened] = useState(reduced);
  const [revealed, setRevealed] = useState(reduced ? pack.cards.length : 0);
  const [skip, setSkip] = useState(false);
  const [hover, setHover] = useState<{ card: CardDefinition; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<number>(0);
  const showHover = (card: CardDefinition, rect: DOMRect) => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setHover({ card, rect }), 300); };
  const hideHover = () => { window.clearTimeout(hoverTimer.current); setHover(null); };
  useEffect(() => { if (suspended) hideHover(); }, [suspended]);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const complete = revealed === pack.cards.length;

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    if (complete && !suspended && document.activeElement === document.body) closeRef.current?.focus();
  }, [complete, suspended]);
  useEffect(() => {
    if (skip || reduced) { setOpened(true); setRevealed(pack.cards.length); return; }
    const timers = [window.setTimeout(() => setOpened(true), 850)];
    pack.cards.forEach((_, index) => timers.push(window.setTimeout(() => setRevealed(index + 1), 1250 + index * 320)));
    return () => timers.forEach(window.clearTimeout);
  }, [pack.cards, reduced, skip]);

  function trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab' || suspended) return;
    const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return <div className={`modal-backdrop booster-backdrop ${reduced ? 'reduced-motion' : ''}`} aria-hidden={suspended || undefined} inert={suspended}>
    <section ref={dialogRef} className="booster-dialog" role="dialog" aria-modal={!suspended || undefined}
      aria-label="Booster rewards" onKeyDown={trapFocus}>
      <button ref={closeRef} className="booster-close" aria-label="Close booster" onClick={close}><X size={22}/></button>
      <header className="booster-heading"><span className="eyebrow">A GIFT FROM THE REALM</span>
        <h2>{complete ? 'Your five cards.' : 'A little fortune awaits.'}</h2>
        <p role="status" aria-live="polite">{complete ? 'Five cards added to your rewards. Select a card to inspect it.' : opened ? `Revealing cards · ${revealed} / 5` : 'Breaking the seal…'}</p>
      </header>
      {!opened ? <div className="booster-pack-stage" aria-hidden="true">
        <div className="booster-pack-glow"/><div className="booster-pack"><span>REALMS OF VARHYR</span><Crown size={55}/><strong>THE REALM’S<br/>BOUNTY</strong><small>FIVE CARDS</small></div>
        <div className="booster-sparks">{Array.from({length:12}, (_,index)=><i key={index} style={{'--spark-angle':`${index*30}deg`} as React.CSSProperties}/>)}</div>
      </div> : <div className="booster-grid">
        {pack.cards.map((reward, index) => {
          const card = registry.cards[reward.id], visible = index < revealed;
          return <div className={`booster-slot ${visible ? 'revealed' : ''} rarity-${card.rarity}`} key={index}>
            <div className="booster-flip">
              <div className="booster-card-back" aria-hidden="true"><Crown size={32}/><span>V</span></div>
              <div className="booster-card-front" aria-hidden={!visible} inert={!visible}>
                <ArtCard card={card} reduced={reduced} onClick={()=>{hideHover();inspect(card);}} className="booster-card" interaction={{onPointerEnter:e=>{if(e.pointerType!=='touch')showHover(card,e.currentTarget.getBoundingClientRect());},onPointerLeave:hideHover,onFocus:e=>showHover(card,e.currentTarget.getBoundingClientRect()),onBlur:hideHover}}/>
              </div>
            </div>
            <div className={`booster-card-caption ${visible ? '' : 'unrevealed'}`} aria-hidden={!visible}>
              <span>{card.rarity}</span>
              <small>{reward.isNew ? 'New to your rewards' : `+1 copy · ${reward.copies} earned`}</small>
            </div>
          </div>;
        })}
      </div>}
      {!pack.saved && <p className="booster-storage-error" role="alert">These rewards are available for this session, but browser storage could not save them.</p>}
      <footer className="booster-actions">
        {!complete ? <button className="outline-button" onClick={()=>{setSkip(true);closeRef.current?.focus();}}>Reveal all</button> : <>
          <button className="outline-button" onClick={browse}>View cards</button>
          <button className="gold-button" onClick={openAnother}>Open another<ArrowRight size={16}/></button>
        </>}
        <small>Free test booster · duplicates possible</small>
      </footer>
    </section>
    {hover && !suspended && createPortal(<>
      <div className="preview-anchor" aria-hidden style={{ left: hover.rect.left, top: hover.rect.top, width: hover.rect.width, height: hover.rect.height }}/>
      <aside className="hover-preview booster-hover-preview" role="tooltip" aria-label={`${hover.card.name} preview`}
        style={{ ['--px' as string]: `${Math.max(12, Math.min(window.innerWidth - 612, hover.rect.right + 14))}px`, ['--py' as string]: `${Math.max(12, Math.min(window.innerHeight - 340, hover.rect.top - 40))}px`, width: Math.min(600, window.innerWidth - 24) }}>
        <CardDetail card={hover.card} animated reduced={reduced}/>
      </aside>
    </>, document.body)}
  </div>;
}
