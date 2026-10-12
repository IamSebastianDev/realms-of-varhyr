import { ChartNoAxesColumn, Check, Copy, Download, Filter, Layers, Minus, MoreHorizontal, Plus, RotateCcw, Search, Upload, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CardDefinition } from '../../../packages/contracts/src';
import { deckRules } from '../../../packages/contracts/src';
import { factionInfo, registry } from '../../../packages/content/src';
import { validateDeck } from '../../../packages/core/src';
import { ArtCard, CardHoverButton } from './CardPresentation';
import { BuilderDialog } from './BuilderDialog';
import { deckCardAvailability, starterOptions, type CustomDeck } from './decks';
import { missingDeckCopies, type OwnedCopies } from './collection';
import { builderCards, cardCost, exportDeck, importDeck, initialBuilderFilters, summarizeDeck, type BuilderFilters, type CardSort } from './deckTools';

type Props = {
  draft: CustomDeck; decks: CustomDeck[]; ownedCopies: OwnedCopies; message: string; canUndo: boolean; reduced: boolean;
  change: (deck: CustomDeck) => void; add: (id: string) => void; remove: (id: string) => void;
  load: (id: string) => void; save: () => void; undo: () => void; inspect: (card: CardDefinition) => void;
};
const newDeck = (): CustomDeck => ({ id: `custom-${crypto.randomUUID()}`, name: 'New deck', cards: [] });
const groups = [{ type: 'creature', name: 'Creatures' }, { type: 'bastion', name: 'Bastions' }, { type: 'spell', name: 'Spells' }] as const;
const signature = (deck: CustomDeck) => JSON.stringify([deck.name, [...deck.cards].sort()]);

export function DeckBuilder({ draft, decks, ownedCopies, message, canUndo, reduced, change, add, remove, load, save, undo, inspect }: Props) {
  const [filters, setFilters] = useState<BuilderFilters>(initialBuilderFilters);
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const deckGalleryRef = useRef<HTMLDivElement>(null);
  const [showUnowned, setShowUnowned] = useState(false);
  const [deckCost, setDeckCost] = useState<number | null>(null);
  // Drag and drop: cards go from the collection into the deck, and rows go back out to remove them.
  const [drag, setDrag] = useState<{ id: string; from: 'collection' | 'deck' } | null>(null);
  const [over, setOver] = useState<'deck' | 'collection' | null>(null);
  const startDrag = (event: React.DragEvent, id: string, from: 'collection' | 'deck') => { event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = from === 'deck' ? 'move' : 'copy'; setDrag({ id, from }); };
  const endDrag = () => { setDrag(null); setOver(null); };
  const dropZone = (target: 'deck' | 'collection', accept: 'collection' | 'deck', apply: (id: string) => void) => ({
    onDragOver: (event: React.DragEvent) => { if (drag?.from !== accept) return; event.preventDefault(); event.dataTransfer.dropEffect = accept === 'deck' ? 'move' : 'copy'; if (over !== target) setOver(target); },
    onDragLeave: (event: React.DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); },
    onDrop: (event: React.DragEvent) => { if (drag?.from !== accept) return; event.preventDefault(); apply(drag.id); endDrag(); },
  });
  const [dialog, setDialog] = useState<'filters' | 'deck' | 'overview' | 'import' | 'export' | null>(null);
  const sharing = dialog === 'import' || dialog === 'export' ? dialog : null;
  const [deckCode, setDeckCode] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const sharingOrigin = useRef<HTMLElement | null>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { deckGalleryRef.current?.scrollTo({ top: 0 }); }, [draft.id]);
  const filter = <K extends keyof BuilderFilters>(key: K, value: BuilderFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const allCards = useMemo(() => builderCards(registry, draft.cards, filters, ownedCopies), [draft.cards, filters, ownedCopies]);
  // Cards you don't own are hidden unless the filter says otherwise; when shown they follow the owned ones.
  const cards = useMemo(() => {
    const owned = (card: CardDefinition) => (ownedCopies[card.id] ?? 0) > 0;
    return showUnowned ? [...allCards.filter(owned), ...allCards.filter(card => !owned(card))] : allCards.filter(owned);
  }, [allCards, ownedCopies, showUnowned]);
  const hiddenCount = allCards.length - allCards.filter(card => (ownedCopies[card.id] ?? 0) > 0).length;
  const summary = useMemo(() => summarizeDeck(draft.cards, registry), [draft.cards]);
  const counts = new Map<string, number>();
  for (const id of draft.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const deckCards = [...counts.keys()].flatMap(id => registry.cards[id] ? [registry.cards[id]] : []).sort((a, b) => cardCost(a) - cardCost(b) || a.name.localeCompare(b.name));
  const missing = missingDeckCopies(draft.cards, ownedCopies);
  const errors = [...validateDeck(draft.cards, registry), ...(missing.length ? [`Missing ${missing.reduce((sum,card) => sum + card.missing, 0)} owned copies. Open boosters or edit this deck.`] : [])];
  const saved = decks.find(deck => deck.id === draft.id);
  const isSaved = saved && signature(saved) === signature(draft);
  const maxCurve = Math.max(1, ...summary.curve);
  const filterCount = Object.entries(filters).filter(([key, value]) => value !== initialBuilderFilters[key as keyof BuilderFilters] && key !== 'sort' && key !== 'query').length + (showUnowned ? 1 : 0);
  const filtered = !!filters.query || filterCount > 0;
  const shownDeckCards = deckCards.filter(card => (deckCost === null || Math.min(6, cardCost(card)) === deckCost));
  function download() {
    const url = URL.createObjectURL(new Blob([exportDeck(draft)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${draft.name.trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'deck'}.json`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openDialog(kind: NonNullable<typeof dialog>) {
    if (!dialog) sharingOrigin.current = document.activeElement as HTMLElement;
    setDialog(kind);
  }
  function openSharing(kind: 'import' | 'export') {
    setDeckCode(kind === 'export' ? exportDeck(draft) : ''); setImportError(''); setCopyMessage(''); openDialog(kind);
  }
  function importCode(raw: string) {
    const imported = importDeck(raw, registry);
    change({ ...newDeck(), ...imported }); setImportError(''); setDialog(null);
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(deckCode); setCopyMessage('Deck code copied.'); }
    catch { codeRef.current?.select(); setCopyMessage('Select the code and copy it with your keyboard.'); }
  }
  async function readFile(file: File) {
    try {
      if (file.size > 100_000) throw new Error('This file is too large for a deck export.');
      importCode(await file.text());
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Could not read this deck.'); }
  }

  function deckRow(card: CardDefinition) {
    const availability = deckCardAvailability(draft.cards, card.id, registry, ownedCopies);
    const count = availability.inDeck;
    const reason = availability.limitReached ? `Deck limit reached (${availability.limit})` : !availability.owned ? 'No copies owned' : 'All owned copies are in this deck';
    return <li key={card.id} className={`dk-row ${card.legendary ? 'is-legendary' : ''} ${drag?.id === card.id && drag.from === 'deck' ? 'dragging' : ''}`} draggable onDragStart={event => startDrag(event, card.id, 'deck')} onDragEnd={endDrag} onContextMenu={event => { event.preventDefault(); inspect(card); }}>
      <span className="dk-art" aria-hidden style={{ backgroundImage: `url("${card.art}")` }}/>
      <span className="dk-cost" title="Energy cost">{cardCost(card)}</span>
      <CardHoverButton card={card} className="dk-name" ariaLabel={`Inspect ${card.name}`} onClick={() => inspect(card)}>{card.name}</CardHoverButton>
      <span className="dk-copies">
        <button aria-label={`Remove one ${card.name}`} onClick={() => remove(card.id)}><Minus size={13}/></button>
        <b aria-label={`${count} copies`}>{count}</b>
        <button aria-label={`Add one ${card.name}`} disabled={availability.remaining === 0} title={availability.remaining === 0 ? reason : undefined} onClick={() => add(card.id)}><Plus size={13}/></button>
      </span>
    </li>;
  }

  function tile(card: CardDefinition, inDeck: boolean, index = 0) {
    const availability = deckCardAvailability(draft.cards, card.id, registry, ownedCopies);
    const count = availability.inDeck;
    const unavailable = availability.remaining === 0;
    const reason = availability.limitReached ? `Deck limit reached (${availability.limit})` : !availability.owned ? 'No copies owned' : 'All owned copies are in this deck';
    const copySummary = `${count} in deck · ${availability.owned} owned · deck limit ${availability.limit}`;
    return <article key={card.id} draggable={!inDeck && !unavailable} onDragStart={event => startDrag(event, card.id, 'collection')} onDragEnd={endDrag} className={`builder-card-tile ${drag?.id === card.id && drag.from === 'collection' ? 'dragging' : ''} ${card.legendary ? 'is-legendary' : ''} ${count ? 'has-copies' : ''} ${inDeck ? 'in-deck' : ''} ${!inDeck && unavailable ? 'unavailable' : ''}`}
      style={inDeck ? { zIndex: deckCards.length - index, ['--deck-stagger' as string]: `${index % 2 ? 10 : 0}px` } : undefined}>
      <div className="builder-tile-art">
        {inDeck && count > 2 && <span className="builder-card-back copy-back-2" aria-hidden style={{ backgroundImage: `url("${card.art}")` }}/>}
        {inDeck && count > 1 && <span className="builder-card-back copy-back-1" aria-hidden style={{ backgroundImage: `url("${card.art}")` }}/>}
        <ArtCard card={card} reduced={reduced} onClick={() => { if (inDeck) remove(card.id); else if (!unavailable) add(card.id); }}
          interaction={{
            'aria-label': `${inDeck ? 'Remove' : 'Add'} ${card.name}${inDeck ? ' from deck' : ' to deck'}`,
            'aria-disabled': !inDeck && unavailable || undefined,
            title: inDeck ? 'Click to remove one copy · right-click to inspect' : `${unavailable ? reason : 'Click to add one copy'} · ${copySummary} · right-click to inspect`,
            onContextMenu: event => { event.preventDefault(); inspect(card); },
          }}/>
        <span className="builder-count-badge" title={inDeck ? `${count} copies in deck` : copySummary} aria-label={inDeck ? `${count} copies in deck` : `${count} copies in deck, ${availability.owned} copies owned`}>{inDeck ? `×${count}` : `${count}/${availability.owned}`}</span>
      </div>
    </article>;
  }

  return <main className="collection-page builder-page deck-workshop" aria-label="Deck builder">
    <input ref={fileRef} className="deck-file-input" type="file" accept=".json,application/json" aria-label="Import deck file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readFile(file); }}/>
    <section className={`builder-collection ${drag?.from === 'deck' ? 'drop-ready' : ''} ${over === 'collection' ? 'drop-over' : ''}`} aria-label="All cards" {...dropZone('collection', 'deck', id => remove(id))}>
      <div className="builder-collection-bar">
        <h2>Your cards <span>{cards.length} cards</span></h2>
        <label className="collection-search"><Search size={15}/><input aria-label="Search cards" placeholder="Search cards…" value={filters.query} onChange={event => filter('query', event.target.value)}/></label>
        <button className="builder-small-button filter-trigger" onClick={() => openDialog('filters')} aria-label="Open card filters"><Filter size={14}/><span>Filters</span>{filterCount > 0 && <b>{filterCount}</b>}</button>
        {(filtered || showUnowned) && <button className="builder-icon-button" aria-label="Clear filters" title="Clear filters" onClick={() => { setFilters({ ...initialBuilderFilters, sort: filters.sort }); setShowUnowned(false); }}><X size={15}/></button>}
      </div>
      <div className="builder-collection-gallery" aria-label="Browse collection cards">
        {!cards.length ? <div className="collection-empty"><Search size={24}/><p>{allCards.length && !showUnowned ? 'No owned cards match. Open boosters in the Store, or show cards you don’t own in Filters.' : 'No cards match these filters.'}</p><button className="outline-button" onClick={() => { setFilters(initialBuilderFilters); setShowUnowned(false); }}>Reset filters</button></div> : cards.map(card => tile(card, false))}
      </div>
    </section>
    <aside className={`builder-deck ${drag?.from === 'collection' ? 'drop-ready' : ''} ${over === 'deck' ? 'drop-over' : ''}`} aria-label="Cards in deck" {...dropZone('deck', 'collection', id => add(id))}>
      <div className="dk-head">
        <h2 className="sr-only">Your deck {summary.total} cards</h2>
        <input className="builder-deck-name" aria-label="Deck name" placeholder="Name your deck" maxLength={60} value={draft.name} onChange={event => change({ ...draft, name: event.target.value })}/>
        <div className="builder-deck-actions">
          <button className="builder-icon-button" aria-label="Undo deck edit" disabled={!canUndo} onClick={undo} title="Undo the last edit"><RotateCcw size={15}/></button>
          <button className="gold-button builder-save" disabled={!draft.name.trim() || !!isSaved} onClick={save}>{isSaved ? 'Saved' : 'Save'}<Check size={14}/></button>
          <button className="builder-icon-button" aria-label="Deck actions" title="Load, new, duplicate, import or export" onClick={() => openDialog('deck')}><MoreHorizontal size={18}/></button>
        </div>
      </div>
      <div className={`dk-progress ${errors.length ? 'incomplete' : 'valid'}`} title={errors.length ? errors.join(' ') : `Ready to play · ${summary.unique} unique cards`}>
        <span>{!errors.length && <Check size={13}/>}<b>{summary.total}</b> / {deckRules.minimumCards} cards</span>
        <i aria-hidden><u style={{ width: `${Math.min(100, summary.total / deckRules.minimumCards * 100)}%` }}/></i>
      </div>
      <div className="builder-deck-grid" ref={deckGalleryRef} tabIndex={0} aria-label="Cards in deck">
        {!deckCards.length ? <div className="collection-empty deck-empty"><Layers size={26}/><p>Your deck starts here.</p>
          <div className="deck-empty-starters">{starterOptions.map(deck => <button key={deck.id} className="outline-button" onClick={() => load(deck.id)}>{deck.name}</button>)}</div></div>
        : !shownDeckCards.length ? <div className="collection-empty">No cards costing {deckCost === 6 ? '6+' : deckCost} in this deck.</div>
        : groups.map(group => {
            const rows = shownDeckCards.filter(card => card.type === group.type);
            const total = rows.reduce((sum, card) => sum + (counts.get(card.id) ?? 0), 0);
            return rows.length ? <section key={group.type} className="dk-group" aria-label={group.name}><h3>{group.name}<span>{total}</span></h3><ul>{rows.map(deckRow)}</ul></section> : null;
          })}
      </div>
      {!!deckCards.length && <div className="dk-curve" role="group" aria-label="Filter deck by energy cost">
        {summary.curve.map((count, cost) => <button key={cost} aria-pressed={deckCost === cost} aria-label={`${count} cards costing ${cost === 6 ? '6 or more' : cost}`} title={`${count} cards costing ${cost === 6 ? '6+' : cost} · click to filter`} disabled={!count} onClick={() => setDeckCost(deckCost === cost ? null : cost)}><span>{count || ''}</span><i style={{ height: `${Math.max(2, count / maxCurve * 30)}px` }}/><small>{cost === 6 ? '6+' : cost}</small></button>)}
      </div>}
      <div className="builder-deck-footer"><span role="status" title={errors.join(' ')}>{message || (errors.length ? errors[0] : isSaved ? 'Saved on this device.' : 'Draft saved automatically.')}</span><button onClick={() => openDialog('overview')} title="Deck overview">{summary.freeProducers} free producers · {summary.averageCost.toFixed(1)} avg. cost</button></div>
    </aside>
    {dialog === 'filters' && <BuilderDialog title="Card filters" origin={sharingOrigin.current} close={() => setDialog(null)}>
      <div className="builder-filter-dialog-grid">
        <label>Faction<select aria-label="Filter by faction" value={filters.faction} onChange={event => filter('faction', event.target.value)}><option value="all">All factions</option>{Object.entries(factionInfo).map(([id, faction]) => <option key={id} value={id}>{faction.symbol} {faction.name}</option>)}</select></label>
        <label>Type<select aria-label="Filter by card type" value={filters.kind} onChange={event => filter('kind', event.target.value)}><option value="all">All types</option><option value="creature">Creatures</option><option value="spell">Spells</option><option value="bastion">Bastions</option></select></label>
        <label>Role<select aria-label="Filter by role" value={filters.role} onChange={event => filter('role', event.target.value as BuilderFilters['role'])}><option value="all">All roles</option><option value="producers">Energy producers</option><option value="free-producers">Free producers</option></select></label>
        <label>Rarity<select aria-label="Filter by rarity" value={filters.rarity} onChange={event => filter('rarity', event.target.value)}><option value="all">All rarities</option><option value="common">Common</option><option value="rare">Rare</option><option value="legendary">Legendary</option></select></label>
        <label className="builder-filter-sort">Sort cards<select aria-label="Sort cards" value={filters.sort} onChange={event => filter('sort', event.target.value as CardSort)}><option value="cost">Cost: low to high</option><option value="name">Name: A–Z</option><option value="attack">Attack: high to low</option><option value="defense">Defense: high to low</option></select></label>
      </div>
      <div className="builder-cost-filter" role="group" aria-label="Filter by total energy cost"><span>Cost</span><button aria-pressed={filters.cost === null} onClick={() => filter('cost', null)}>All</button>{summary.curve.map((_, cost) => <button key={cost} aria-label={`Cost ${cost === 6 ? '6 or more' : cost}`} aria-pressed={filters.cost === cost} onClick={() => filter('cost', filters.cost === cost ? null : cost)}>{cost === 6 ? '6+' : cost}</button>)}</div>
      <label className="builder-limit-filter"><input type="checkbox" checked={showUnowned} onChange={event => setShowUnowned(event.target.checked)}/>Show cards I don’t own{hiddenCount > 0 && ` (${hiddenCount} hidden)`}</label>
      <label className="builder-limit-filter"><input type="checkbox" checked={filters.addable} onChange={event => filter('addable', event.target.checked)}/>Only cards I can add</label>
      <div className="builder-dialog-actions"><button className="outline-button" onClick={() => { setFilters(initialBuilderFilters); setShowUnowned(false); }}>Reset filters</button><button className="gold-button" onClick={() => setDialog(null)}>Show {cards.length} cards<Check size={15}/></button></div>
    </BuilderDialog>}
    {dialog === 'deck' && <BuilderDialog title="Deck actions" origin={sharingOrigin.current} close={() => setDialog(null)}>
      <label>Load deck<select aria-label="Load deck" value={saved ? draft.id : 'draft'} onChange={event => { load(event.target.value); setDialog(null); }}><option value="draft">Current draft</option><optgroup label="Starter decks">{starterOptions.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</optgroup>{decks.length > 0 && <optgroup label="Your decks">{decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</optgroup>}</select></label>
      <div className="builder-manage-actions"><button className="outline-button" onClick={() => { change(newDeck()); setDialog(null); }}><Plus size={16}/>New deck</button><button className="outline-button" onClick={() => { change({ ...draft, id: newDeck().id, name: `${draft.name.slice(0, 53)} (copy)` }); setDialog(null); }}><Copy size={16}/>Duplicate deck</button><button className="outline-button" onClick={() => openSharing('import')}><Upload size={16}/>Import deck</button><button className="outline-button" disabled={!draft.cards.length} onClick={() => openSharing('export')}><Download size={16}/>Export deck</button></div>
      <p>{deckRules.minimumCards} cards minimum · {deckRules.copiesPerCard} copies per card · {deckRules.copiesPerLegendary} per legendary</p>
    </BuilderDialog>}
    {dialog === 'overview' && <BuilderDialog title="Deck overview" origin={sharingOrigin.current} close={() => setDialog(null)}>
      <p>{draft.name || 'Untitled deck'} · {summary.total} cards · {summary.unique} unique</p>
      <div className="deck-metrics"><span><b>{summary.freeProducers}</b>Free producers</span><span><b>{summary.producers}</b>All producers</span><span><b>{summary.averageCost.toFixed(1)}</b>Average cost</span></div>
      <div className="deck-curve-heading">Energy cost curve</div>
      <div className="deck-cost-curve" role="img" aria-label={`Energy cost curve: ${summary.curve.map((count, cost) => `${cost === 6 ? '6+' : cost} cost: ${count} cards`).join(', ')}`}>
        {summary.curve.map((count, cost) => <div key={cost} title={`${count} cards costing ${cost === 6 ? '6+' : cost}`}><span>{count || ''}</span><i style={{ height: `${Math.max(2, count / maxCurve * 70)}px` }}/><small>{cost === 6 ? '6+' : cost}</small></div>)}
      </div>
      <p role="status">{errors.length ? errors.join(' ') : 'Ready to play.'}</p>
    </BuilderDialog>}
    {sharing && <BuilderDialog title={sharing === 'export' ? 'Export deck' : 'Import deck'} origin={sharingOrigin.current} close={() => setDialog(null)}>
      <p>{sharing === 'export' ? 'Copy this deck code to share it, or download a file.' : 'Paste a deck code or choose an exported deck file. It opens as a new draft.'}</p>
      <textarea ref={codeRef} aria-label="Deck code" readOnly={sharing === 'export'} value={deckCode} onChange={event => { setDeckCode(event.target.value); setImportError(''); }} spellCheck={false}/>
      {importError && <p className="builder-dialog-error" role="alert">{importError}</p>}{copyMessage && <p role="status">{copyMessage}</p>}
      <div className="builder-dialog-actions">{sharing === 'export' ? <><button className="outline-button" onClick={download}><Download size={15}/>Download file</button><button className="gold-button" onClick={() => void copyCode()}><Copy size={15}/>Copy deck code</button></> : <><button className="outline-button" onClick={() => fileRef.current?.click()}><Upload size={15}/>Choose file</button><button className="gold-button" disabled={!deckCode.trim()} onClick={() => { try { importCode(deckCode); } catch (error) { setImportError(error instanceof Error ? error.message : 'Could not read this deck.'); } }}>Import deck<Check size={15}/></button></>}</div>
    </BuilderDialog>}
  </main>;
}
