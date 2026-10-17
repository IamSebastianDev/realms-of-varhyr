import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { Check, Lock } from 'lucide-react';
import { useRef, useState } from 'react';
import { achievements } from './goals';
import { cardBackArt, cardBackById, cardBacks, isBackUnlocked, type CardBackDef } from './cardBacks';
import { useBoughtBacks, useCardBack } from './cardBackStore';
import { BuilderDialog } from './BuilderDialog';
import { useGoals } from './goalsStore';
import './card-backs.css';

/** The face-down side of a card. It fills whatever box it is placed in. */
export function CardBackFace({ id, className = '' }: { id?: string; className?: string }) {
  const back = cardBackById(id);
  return <div className={`card-back-face cb-${back.id} ${className}`} style={{ backgroundImage: `url(${cardBackArt(back.id)})` }} aria-hidden="true"/>;
}

export function unlockText(back: CardBackDef) {
  if (back.source === 'shop') return msg("Buy in the Store");
  const def = back.unlock && achievements.find(entry => entry.id === back.unlock!.achievement);
  return def ? msg("Reach {v0} in {v1}", { v0: msg(['Bronze', 'Silver', 'Gold'][back.unlock!.tier - 1]), v1: msg(def.title) }) : '';
}

/** The deck builder's sleeve button: shows the deck's current back and opens a dialog with every back, locked ones included. */
export function CardBackPicker({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  useLanguage();
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null), goals = useGoals(), bought = useBoughtBacks(), current = useCardBack(value);
  return <>
    <button ref={trigger} className="back-picker-button" aria-haspopup="dialog" aria-label={msg("Card back")} title={msg("Card back")} onClick={() => setOpen(true)}><CardBackFace id={current}/></button>
    {open && <BuilderDialog title={msg("Card back")} origin={trigger.current} close={() => setOpen(false)}>
      <div className="back-grid" role="listbox" aria-label={msg("Card back")}>
        {cardBacks.map(back => {
          const unlocked = isBackUnlocked(back, goals, bought);
          return <button key={back.id} role="option" aria-selected={back.id === current} disabled={!unlocked} data-autofocus={back.id === current ? '' : undefined} className={back.id === current ? 'on' : ''} onClick={() => { onChange(back.id); setOpen(false); }}>
            <CardBackFace id={back.id}/>
            <b>{msg(back.name)}</b>
            <small>{back.id === current ? msg("In use") : unlocked ? msg("Unlocked") : unlockText(back)}</small>
            {back.id === current ? <Check size={15}/> : !unlocked && <Lock size={14}/>}
          </button>;
        })}
      </div>
    </BuilderDialog>}
  </>;
}
