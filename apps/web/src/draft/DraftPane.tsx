import { holdDrag, releaseDrag } from './dragPayload';
import { useMemo, type DragEvent, type ReactNode } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { registry } from '../../../../packages/content/src';
import type { CardDefinition } from '../../../../packages/contracts/src';
import { CardHoverButton } from '../../../../packages/ui/src/CardPresentation';
import { cardCost, compareCards, summarizeDeck } from '../deckTools';

const groups = [{ type: 'creature', name: 'Creatures' }, { type: 'holding', name: 'Holdings' }, { type: 'spell', name: 'Spells' }] as const;
const countOf = (cards: string[], id: string) => cards.filter(card => card === id).length;

/**
 * The right-hand pane of the draft screens, the same one the deckbuilder has: progress, the cards grouped by type
 * as rows with their art, the energy curve and a footer. With `edit` the rows get plus and minus; without it they only count.
 */
export function DraftPane({ head, cards, target, unit, problem, edit, inspect, footer, className = '', drop }: {
  head?: ReactNode; cards: string[]; target: number; unit: string; problem?: string; inspect: (card: CardDefinition) => void; footer?: ReactNode; className?: string;
  edit?: { add: (card: CardDefinition) => void; remove: (id: string) => void; canAdd: (card: CardDefinition) => boolean };
  drop?: { over: boolean; onDragOver: (event: DragEvent) => void; onDragLeave: () => void; onDrop: (event: DragEvent) => void };
}) {
  useLanguage();
  const summary = useMemo(() => summarizeDeck(cards, registry), [cards]);
  const rows = useMemo(() => [...new Set(cards)].map(id => registry.cards[id]!).sort((a, b) => cardCost(a) - cardCost(b) || compareCards(a, b)), [cards]);
  const max = Math.max(1, ...summary.curve);
  const valid = !problem && summary.total >= target;
  return <aside className={`builder-deck draft-pane ${drop?.over ? 'drop-over' : ''} ${className}`} aria-label={msg("Your picks")}
    onDragOver={drop?.onDragOver} onDragLeave={drop?.onDragLeave} onDrop={drop?.onDrop}>
    {head && <div className="dk-head">{head}</div>}
    <div className={`dk-progress ${valid ? 'valid' : 'incomplete'}`} title={problem}>
      <span>{valid && <Check size={13}/>}<b>{summary.total}</b> / {target} {unit}</span>
      <i aria-hidden><u style={{ width: `${Math.min(100, summary.total / target * 100)}%` }}/></i>
    </div>
    <div className="builder-deck-grid" tabIndex={0} aria-label={msg("Cards in deck")}>
      {!rows.length ? <div className="collection-empty deck-empty"><p>{msg("Cards you take appear here.")}</p></div>
        : groups.map(group => {
          const list = rows.filter(card => card.type === group.type);
          const total = list.reduce((sum, card) => sum + countOf(cards, card.id), 0);
          return list.length ? <section key={group.type} className="dk-group" aria-label={msg(group.name)}><h3>{msg(group.name)}<span>{total}</span></h3><ul>{list.map(card => {
            const count = countOf(cards, card.id);
            return <li key={card.id} className={`dk-row ${card.legendary ? 'is-legendary' : ''}`} draggable={!!edit}
              onDragStart={event => holdDrag(event, 'row', card.id, 'application/x-deck-row')} onDragEnd={releaseDrag}
              onContextMenu={event => { event.preventDefault(); inspect(card); }}>
              <span className="dk-art" aria-hidden style={{ backgroundImage: `url("${card.art}")` }}/>
              <span className="dk-cost" title={msg("Energy cost")}>{cardCost(card)}</span>
              <CardHoverButton card={card} className="dk-name" ariaLabel={msg("Inspect {v0}", { v0: card.name })} onClick={() => inspect(card)}>{msg(card.name)}</CardHoverButton>
              <span className="dk-copies">
                {edit && <button aria-label={msg("Remove one {v0}", { v0: card.name })} onClick={() => edit.remove(card.id)}><Minus size={13}/></button>}
                <b aria-label={msg("{v0} copies", { v0: count })}>{count}</b>
                {edit && <button aria-label={msg("Add one {v0}", { v0: card.name })} disabled={!edit.canAdd(card)} onClick={() => edit.add(card)}><Plus size={13}/></button>}
              </span>
            </li>;
          })}</ul></section> : null;
        })}
    </div>
    <div className="dk-curve" role="img" aria-label={msg("Energy cost curve")}>
      {summary.curve.map((n, cost) => <button key={cost} tabIndex={-1} disabled title={msg("{v0} cards costing {v1}", { v0: n, v1: cost === 6 ? '6+' : cost })}><span>{n || ''}</span><i style={{ height: `${Math.max(2, n / max * 30)}px` }}/><small>{cost === 6 ? '6+' : cost}</small></button>)}
    </div>
    <div className="builder-deck-footer"><span role="status">{footer}</span><span>{summary.freeProducers} {msg("free producers ·")} {summary.averageCost.toFixed(1)} {msg("avg. cost")}</span></div>
  </aside>;
}
