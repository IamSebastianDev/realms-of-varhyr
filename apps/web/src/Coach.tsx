import { t as msg, useLanguage } from './i18n';
import { ArrowRight, GraduationCap, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  title: string; text: string;
  /** Position in the lesson, shown as small pips. */
  progress: { index: number; total: number };
  focus: string[];
  /** Information steps and the opponent's turn use a different tone. */
  tone: 'player' | 'opponent' | 'finish';
  next?: string; onNext?: () => void;
  secondary?: string; onSecondary?: () => void;
  onSkip: () => void;
  /** Bumps whenever the player tries something the current step does not ask for. */
  nudge: number;
};
type Box = { left: number; top: number; width: number; height: number };

/** Rings whatever the step points at. Positions are read from the page itself, so it follows the layout at any size. */
function useRings(selectors: string[]): Box[] {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const key = selectors.join('|');
  useEffect(() => {
    const read = () => {
      const next = selectors.flatMap(selector => {
        const element = document.querySelector(selector);
        if (!element) return [];
        const rect = element.getBoundingClientRect();
        return rect.width && rect.height ? [{ left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }] : [];
      });
      setBoxes(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    read();
    const timer = window.setInterval(read, 120);
    window.addEventListener('resize', read);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', read); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return boxes;
}

const rect = (selector: string) => { const box = document.querySelector(selector)?.getBoundingClientRect(); return box && box.width > 0 && box.height > 0 ? box : null; };
/**
 * Finds a spot that hides nothing that matters. With the side column (wide screens) the panel takes the battle log's slot, or failing
 * that the opponent's energy and pile area, so no life total is ever covered. In stacked layouts it sits in the largest vertical gap
 * between the topbar, banners, board and hand.
 */
function useAnchor(enabled: boolean): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!enabled) { setBox(null); return; }
    const read = () => {
      const opponent = rect('.player-banner.opponent'), own = rect('.player-banner.own'), board = rect('.board-scene');
      if (!opponent || !own || !board) { setBox(null); return; }
      const next = (top: number, bottom: number, left: number, width: number) => ({ left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(bottom - top) });
      if (board.left >= opponent.right - 4) {
        const pill = rect('.match-status'), column = pill && Math.abs(pill.left - opponent.left) < 40 ? pill.bottom : opponent.bottom;
        const slotTop = Math.max(opponent.bottom, column) + 10;
        if (own.top - 10 - slotTop >= 190) { setBox(next(slotTop, own.top - 10, opponent.left, opponent.width)); return; }
        const identity = Math.max(...['.player-banner.opponent .portrait', '.player-banner.opponent .player-name'].map(selector => rect(selector)?.bottom ?? opponent.top)) + 8;
        setBox(own.top - 10 - identity >= 150 ? next(identity, own.top - 10, opponent.left, opponent.width) : null);
        return;
      }
      const dialog = rect('.choice-dialog'), stack = [...(dialog ? [dialog] : ['.topbar', '.player-banner.opponent', '.board-scene', '.player-banner.own'].map(rect))].filter((r): r is DOMRect => !!r);
      const cards = [...document.querySelectorAll('.hand-scroll .hand-card')].map(element => element.getBoundingClientRect()).filter(r => r.width > 0);
      const handTop = cards.length ? Math.min(...cards.map(r => r.top)) : window.innerHeight, handBottom = cards.length ? Math.max(...cards.map(r => r.bottom)) : window.innerHeight;
      const bands = [...stack.map(r => [r.top, r.bottom]), ...(dialog ? [] : [[handTop, handBottom]])].sort((x, y) => x[0] - y[0]);
      let best: { top: number; bottom: number } | null = null, edge = 0;
      for (const [top, bottom] of [...bands, [window.innerHeight, window.innerHeight]]) {
        if (top - edge > (best ? best.bottom - best.top : 0)) best = { top: edge, bottom: top };
        edge = Math.max(edge, bottom);
      }
      const width = Math.min(420, window.innerWidth - 24);
      setBox(best && best.bottom - best.top >= 150 ? next(best.top + 8, best.bottom - 8, (window.innerWidth - width) / 2, width) : null);
    };
    read();
    const timer = window.setInterval(read, 300);
    window.addEventListener('resize', read);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', read); };
  }, [enabled]);
  return box;
}

export function Coach(props: Props) {
  useLanguage();
  const boxes = useRings(props.focus);
  const anchor = useAnchor(props.tone !== 'finish');
  return <>
    {props.tone === 'finish' && <div className="coach-scrim" aria-hidden="true"/>}
    <div className="coach-rings" aria-hidden="true">{boxes.map((box, i) => <i key={i} className={`coach-ring ${props.tone}`} style={{ left: box.left - 7, top: box.top - 7, width: box.width + 14, height: box.height + 14 }}/>)}</div>
    <aside className={`coach ${props.tone} ${anchor ? 'anchored' : ''}`} role="region" aria-label={msg("Tutorial")} aria-live="polite" style={anchor ? { left: anchor.left, top: anchor.top, width: anchor.width, maxHeight: anchor.height } : undefined}>
      <div key={props.nudge} className={props.nudge ? 'coach-body nudged' : 'coach-body'}>
        <header><GraduationCap size={16} aria-hidden="true"/><span>{props.tone === 'opponent' ? msg("Their move") : msg("Tutorial")}</span>
          <ol className="coach-pips" aria-label={msg("Step {v0} of {v1}", {v0: props.progress.index + 1, v1: props.progress.total})}>{Array.from({ length: props.progress.total }, (_, n) => <li key={n} className={n < props.progress.index ? 'done' : n === props.progress.index ? 'now' : ''}/>)}</ol>
          <button className="coach-skip" onClick={props.onSkip} aria-label={msg("Leave the tutorial and play freely")}><X size={14}/></button></header>
        <h2>{msg(props.title)}</h2>
        <p>{msg(props.text)}</p>
        {(props.next || props.secondary) && <footer>
          {props.secondary && <button className="coach-secondary" onClick={props.onSecondary}>{msg(props.secondary!)}</button>}
          {props.next && <button className="gold-button coach-next" onClick={props.onNext} autoFocus>{msg(props.next!)}<ArrowRight size={15}/></button>}
        </footer>}
      </div>
    </aside>
  </>;
}
