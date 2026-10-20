import { heldDrag, holdDrag, releaseDrag } from './dragPayload';
import { useMemo, useState } from 'react';
import { ArrowLeft, Check, RotateCcw, Sparkles } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { registry } from '../../../../packages/content/src';
import { deckRules, type CardDefinition } from '../../../../packages/contracts/src';
import { ArtCard } from '../../../../packages/ui/src/CardPresentation';
import { buildBotDeck, deckProblems, isFreeProducer, poolOf, type DraftPreset, type DraftRun } from '../../../../packages/draft/src';
import { compareCards } from '../deckTools';
import { DraftBackdrop } from './DraftHubArt';
import { DraftPane } from './DraftPane';
import { Workshop } from '../layout/Workshop';

type Filter = 'all' | 'producers' | 'creature' | 'spell' | 'holding';
const filters: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'producers', label: 'Producers' }, { id: 'creature', label: 'Creatures' }, { id: 'spell', label: 'Spells' }, { id: 'holding', label: 'Holdings' }];
const count = (cards: string[], id: string) => cards.filter(card => card === id).length;

/**
 * The deckbuilder of a draft: your picks are the only collection. Any number of copies, one per legendary, 30 cards at least.
 * It opens with a suggested deck, so doing nothing still plays.
 */
export function DraftDeckBuilder({ run, preset, reduced, save, back, inspect }: { run: DraftRun; preset: DraftPreset; reduced: boolean; save: (deck: string[]) => void; back: () => void; inspect: (card: CardDefinition) => void }) {
  useLanguage();
  const pool = poolOf(run);
  const [deck, setDeck] = useState<string[]>(() => run.deck.length ? run.deck : buildBotDeck(pool, registry));
  const [filter, setFilter] = useState<Filter>('all');
  const unique = useMemo(() => [...new Set(pool)].map(id => registry.cards[id]!).sort(compareCards), [pool]);
  const shown = unique.filter(card => filter === 'all' || (filter === 'producers' ? isFreeProducer(card, registry) : card.type === filter));
  const problems = deckProblems(deck, pool, registry);
  const canAdd = (card: CardDefinition) => count(deck, card.id) < count(pool, card.id) && !(card.legendary && deck.some(id => registry.cards[id]!.deckLimitKey === card.deckLimitKey));
  const add = (card: CardDefinition) => { if (canAdd(card)) setDeck(current => [...current, card.id]); };
  const remove = (id: string) => setDeck(current => { const at = current.indexOf(id); return at < 0 ? current : [...current.slice(0, at), ...current.slice(at + 1)]; });
  const [over, setOver] = useState(false);
  return <Workshop label={msg("Draft deck builder")} className="draft-workshop" backdrop={<DraftBackdrop preset={preset}/>} panelLabel={msg("Your picks")}
    panel={{ className: over ? 'drop-over' : '',
      onDragOver: event => { if (heldDrag('row') !== null || event.dataTransfer.types.includes('application/x-deck-row')) { event.preventDefault(); setOver(true); } }, onDragLeave: () => setOver(false),
      onDrop: event => { const id = heldDrag('row') ?? event.dataTransfer.getData('application/x-deck-row'); releaseDrag(); setOver(false); if (id) { event.preventDefault(); remove(id); } } }}
    title={msg("Your picks")} subtitle={<>{pool.length} {msg("cards")}</>}
    actions={
        <div className="draft-filters" role="group" aria-label={msg("Filter your picks")}>{filters.map(entry => <button key={entry.id} className="builder-small-button" aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>{msg(entry.label)}</button>)}</div>
    }
    pane={
      <DraftPane cards={deck} target={deckRules.minimumCards} unit={msg("cards")} problem={problems[0] ? msg(problems[0]) : undefined} inspect={inspect}
      edit={{ add, remove, canAdd }} footer={problems[0] ? msg(problems[0]) : msg("Ready to play.")}
      drop={{ over: false, onDragOver: event => { event.preventDefault(); }, onDragLeave: () => undefined, onDrop: event => { const id = heldDrag('card') ?? event.dataTransfer.getData('text/plain'); releaseDrag(); if (id && registry.cards[id]) { event.preventDefault(); add(registry.cards[id]!); } } }}
      head={<>
        <button className="builder-icon-button" aria-label={msg("Back to the draft overview")} title={msg("Back to the draft overview")} onClick={back}><ArrowLeft size={16}/></button>
        <strong className="draft-pane-title">{msg("Build your deck")}</strong>
        <div className="builder-deck-actions">
          <button className="builder-icon-button" title={msg("Suggest a deck")} aria-label={msg("Suggest a deck")} onClick={() => setDeck(buildBotDeck(pool, registry))}><Sparkles size={15}/></button>
          <button className="builder-icon-button" title={msg("Clear")} aria-label={msg("Clear")} disabled={!deck.length} onClick={() => setDeck([])}><RotateCcw size={15}/></button>
          <button className="gold-button builder-save" disabled={!!problems.length} onClick={() => save(deck)}>{msg("Save deck")}<Check size={14}/></button>
        </div>
      </>}/>
    }>
      <div className="builder-collection-gallery" aria-label={msg("Browse collection cards")}>{shown.map(card => {
        const have = count(pool, card.id), used = count(deck, card.id), open = canAdd(card);
        return <article key={card.id} draggable={open} onDragStart={event => holdDrag(event, 'card', card.id)} onDragEnd={releaseDrag}
          className={`builder-card-tile ${used ? 'has-copies' : ''} ${open ? '' : 'unavailable'}`}>
          <ArtCard card={card} reduced={reduced} disabled={!open} onClick={() => add(card)}
            interaction={{ 'aria-label': msg("Add {v0} to deck", { v0: card.name }), 'aria-disabled': !open || undefined, title: msg("{v0} in deck · {v1} drafted · right-click to inspect", { v0: used, v1: have }), onContextMenu: event => { event.preventDefault(); inspect(card); } }}/>
          <span className="draft-pool-count" title={msg("{v0} in deck of {v1} drafted", { v0: used, v1: have })}><b>{used}</b> / {have}</span>
        </article>;
      })}</div>
  </Workshop>;
}
