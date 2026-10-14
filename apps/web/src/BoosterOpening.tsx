import { FactionIcon } from '../../../packages/renderer/src/FactionIcon';
import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, Crown, X } from 'lucide-react';
import { factionInfo, registry, setInfo } from '../../../packages/content/src';
import type { BoosterPack } from '../../../packages/content/src/boosters';
import type { CardDefinition } from '../../../packages/contracts/src';
import type { BoosterCardReward } from './boosterRewards';
import { ArtCard } from '../../../packages/ui/src/CardPresentation';
import { CrownAmount } from './Crowns';

export type OpenBooster = { id: string; cards: (BoosterCardReward & { crowns?: number })[]; saved: boolean; pack: BoosterPack };

export const packColor = (pack: BoosterPack) => {
  const color = pack.set ? setInfo[pack.set]?.color : pack.faction ? factionInfo[pack.faction]?.color : undefined;
  return color ? { '--pack-color': color } : undefined;
};
export const packSymbol = (pack: BoosterPack) => pack.set ? setInfo[pack.set]?.symbol : pack.faction && factionInfo[pack.faction] ? <FactionIcon faction={pack.faction}/> : undefined;
/** Breaks a pack name into short lines for the pack face. */
export function packLines(name: string) {
  const lines: string[] = [];
  for (const word of name.toUpperCase().split(' ')) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + word).length <= 12) lines[lines.length - 1] = last + ' ' + word; else lines.push(word);
  }
  return lines.map((line, index) => <span key={index} className="pack-line">{line}</span>);
}
export function BoosterOpening({ pack, reduced, suspended, close, openAnother, canOpenAnother = true, inspect, browse }: {
  pack: OpenBooster; reduced: boolean; suspended: boolean; close: () => void; openAnother: () => void;
  canOpenAnother?: boolean; inspect: (card: CardDefinition) => void; browse: () => void;
}) {
  useLanguage();
  const [opened, setOpened] = useState(reduced);
  const [revealed, setRevealed] = useState(reduced ? pack.cards.length : 0);
  const [skip, setSkip] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const complete = revealed === pack.cards.length;
  const crowns = pack.cards.reduce((sum, card) => sum + (card.crowns ?? 0), 0);
  const kept = pack.cards.filter(card => !card.crowns).length;

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
    if (event.key !== msg("Tab") || suspended) return;
    const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return <div className={`modal-backdrop booster-backdrop ${reduced ? 'reduced-motion' : ''}`} aria-hidden={suspended || undefined} inert={suspended} style={packColor(pack.pack) as React.CSSProperties}>
    <section ref={dialogRef} className="booster-dialog" role="dialog" aria-modal={!suspended || undefined}
      aria-label={msg("Booster rewards")} onKeyDown={trapFocus}>
      <button ref={closeRef} className="booster-close" aria-label={msg("Close booster")} onClick={close}><X size={22}/></button>
      <header className="booster-heading">
        <h2>{msg(pack.pack.name)}</h2>
        <p role="status" aria-live="polite">{complete ? msg("{v0} {v1} added{v2}", {v0: kept, v1: kept===1?'card':'cards', v2: crowns ? ` · ${crowns} crowns from extra copies` : ''}) : opened ? msg("Revealing cards · {v0} / 5", {v0: revealed}) : msg("Breaking the seal…")}</p>
      </header>
      {!opened ? <div className="booster-pack-stage" aria-hidden="true">
        <div className="booster-pack-glow"/><div className="booster-pack"><span>REALMS OF VARHYR</span>{packSymbol(pack.pack) ? <b className="pack-symbol">{packSymbol(pack.pack)}</b> : <Crown size={55}/>}<strong>{packLines(msg(pack.pack.name))}</strong><small>{msg("FIVE CARDS")}</small></div>
        <div className="booster-sparks">{Array.from({length:12}, (_,index)=><i key={index} style={{'--spark-angle':`${index*30}deg`} as React.CSSProperties}/>)}</div>
      </div> : <div className="booster-grid">
        {pack.cards.map((reward, index) => {
          const card = registry.cards[reward.id], visible = index < revealed;
          return <div className={`booster-slot ${visible ? 'revealed' : ''} ${reward.crowns ? 'is-reclaimed' : ''} rarity-${card.rarity}`} key={index}>
            <div className="booster-flip">
              <div className="booster-card-back" aria-hidden="true"><Crown size={32}/><span>V</span></div>
              <div className="booster-card-front" aria-hidden={!visible} inert={!visible}>
                <ArtCard card={card} reduced={reduced} onClick={()=>inspect(card)} className="booster-card"/>
              </div>
            </div>
            <div className={`booster-card-caption ${visible ? '' : 'unrevealed'}`} aria-hidden={!visible}>
              <span>{card.rarity}</span>
              {reward.crowns ? <div className="booster-crown-reward"><CrownAmount amount={reward.crowns}/><small>{msg("Extra copy sold")}</small></div> : <small>{reward.isNew ? msg("New to your collection") : msg("+1 copy · {v0} owned", {v0: reward.copies})}</small>}
            </div>
          </div>;
        })}
      </div>}
      {!pack.saved && <p className="booster-storage-error" role="alert">{msg("These rewards are available for this session, but browser storage could not save them.")}</p>}
      {complete && crowns > 0 && <div className="booster-crown-total">{msg("Earned")}<CrownAmount amount={crowns}/></div>}
      <footer className="booster-actions">
        {!complete ? <button className="outline-button" onClick={()=>{setSkip(true);closeRef.current?.focus();}}>{msg("Reveal all")}</button> : <>
          <button className="outline-button" onClick={browse}>{msg("View cards")}</button>
          <button className="gold-button" disabled={!canOpenAnother} onClick={openAnother}>{msg("Open another")}<ArrowRight size={16}/></button>
        </>}
        <small>{canOpenAnother ? msg("More of these boosters are waiting in your inventory.") : msg("No more of this booster. Crowns can buy another in the store.")}</small>
      </footer>
    </section>
  </div>;
}
