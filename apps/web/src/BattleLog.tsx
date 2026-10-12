import { t as msg, useLanguage } from './i18n';
import { useEffect, useRef } from 'react';
import { ScrollText, X } from 'lucide-react';
import type { CardInstance, GameEvent, PlayerId } from '../../../packages/contracts/src';
import { battleLog } from './logEntries';

/** Live, auto-scrolling record of what has happened. Your actions are gold, the opponent's are rose. */
export function BattleLog({ events, cards, viewer, onClose }: { events: GameEvent[]; cards: Record<string, CardInstance>; viewer: PlayerId; onClose: () => void }) {
  useLanguage();
  const entries = battleLog(events, cards), end = useRef<HTMLOListElement>(null);
  useEffect(() => { const list = end.current; if (list) list.scrollTop = list.scrollHeight; }, [entries.length]);
  return <aside className="battle-log" aria-label={msg("Battle log")}>
    <div className="battle-log-head"><span className="eyebrow"><ScrollText size={13}/> {msg("BATTLE LOG")}</span><button aria-label={msg("Hide battle log")} onClick={onClose}><X size={14}/></button></div>
    <ol ref={end} className="battle-log-list">{entries.map(entry => <li key={entry.seq} className={`log-${entry.kind} ${entry.player ? (entry.player === viewer ? 'mine' : 'theirs') : ''}`}>{msg(entry.text)}</li>)}</ol>
  </aside>;
}
