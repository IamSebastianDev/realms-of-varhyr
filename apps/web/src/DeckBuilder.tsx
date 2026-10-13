import { Checkbox } from './Checkbox';
import { FactionSelect } from './FactionSelect';
import { t as msg, useLanguage, formatNumber } from './i18n';
import { ChartNoAxesColumn, Check, Copy, Download, Filter, Layers, Minus, MoreHorizontal, Plus, RotateCcw, Search, Trash2, Upload, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CardDefinition } from '../../../packages/contracts/src';
import { deckRules } from '../../../packages/contracts/src';
import { factionInfo, registry, setDefinitions } from '../../../packages/content/src';
import { validateDeck } from '../../../packages/core/src';
import { ArtCard, CardHoverButton } from './CardPresentation';
import { BuilderDialog } from './BuilderDialog';
import { OwnershipPips } from './OwnershipPips';
import { deckCardAvailability, starterOptions, type CustomDeck } from './decks';
import { missingDeckCopies, type OwnedCopies } from './collection';
import { builderCards, cardCost, exportDeck, importDeck, initialBuilderFilters, summarizeDeck, type BuilderFilters, type CardSort } from './deckTools';

type Props = {
  draft: CustomDeck; decks: CustomDeck[]; ownedCopies: OwnedCopies; message: string; canUndo: boolean; reduced: boolean;
  change: (deck: CustomDeck) => void; add: (id: string) => void; remove: (id: string) => void;
  load: (id: string) => void; removeDeck: () => void; save: () => void; undo: () => void; inspect: (card: CardDefinition) => void;
};
const newDeck = (): CustomDeck => ({ id: `custom-${crypto.randomUUID()}`, name: msg("New deck"), cards: [] });
const groups = [{ type: 'creature', name: 'Creatures' }, { type: 'bastion', name: 'Bastions' }, { type: 'spell', name: 'Spells' }] as const;
const signature = (deck: CustomDeck) => JSON.stringify([deck.name, [...deck.cards].sort()]);

export function DeckBuilder({ draft, decks, ownedCopies, message, canUndo, reduced, change, add, remove, load, save, removeDeck, undo, inspect }: Props) {
  useLanguage();
  const [filters, setFilters] = useState<BuilderFilters>(initialBuilderFilters);
  const [importError, setImportError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const [dialog, setDialogState] = useState<'filters' | 'deck' | 'overview' | 'import' | 'export' | null>(null);
  const setDialog = (next: typeof dialog) => { setConfirmDelete(false); setDialogState(next); };
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
  const errors = [...validateDeck(draft.cards, registry), ...(missing.length ? [msg("Missing {v0} owned copies. Open boosters or edit this deck.", {v0: missing.reduce((sum,card) => sum + card.missing, 0)})] : [])];
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
    try { await navigator.clipboard.writeText(deckCode); setCopyMessage(msg("Deck code copied.")); }
    catch { codeRef.current?.select(); setCopyMessage(msg("Select the code and copy it with your keyboard.")); }
  }
  async function readFile(file: File) {
    try {
      if (file.size > 100_000) throw new Error(msg("This file is too large for a deck export."));
      importCode(await file.text());
    } catch (error) { setImportError(error instanceof Error ? error.message : msg("Could not read this deck.")); }
  }

  function deckRow(card: CardDefinition) {
    const availability = deckCardAvailability(draft.cards, card.id, registry, ownedCopies);
    const count = availability.inDeck;
    const reason = availability.limitReached ? msg("Deck limit reached ({v0})", {v0: availability.limit}) : !availability.owned ? msg("No copies owned") : msg("All owned copies are in this deck");
    return <li key={card.id} className={`dk-row ${card.legendary ? 'is-legendary' : ''} ${drag?.id === card.id && drag.from === 'deck' ? 'dragging' : ''}`} draggable onDragStart={event => startDrag(event, card.id, 'deck')} onDragEnd={endDrag} onContextMenu={event => { event.preventDefault(); inspect(card); }}>
      <span className="dk-art" aria-hidden style={{ backgroundImage: `url("${card.art}")` }}/>
      <span className="dk-cost" title={msg("Energy cost")}>{cardCost(card)}</span>
      <CardHoverButton card={card} className="dk-name" ariaLabel={msg("Inspect {v0}", {v0: card.name})} onClick={() => inspect(card)}>{msg(card.name)}</CardHoverButton>
      <span className="dk-copies">
        <button aria-label={msg("Remove one {v0}", {v0: card.name})} onClick={() => remove(card.id)}><Minus size={13}/></button>
        <b aria-label={msg("{v0} copies", {v0: count})}>{count}</b>
        <button aria-label={msg("Add one {v0}", {v0: card.name})} disabled={availability.remaining === 0} title={availability.remaining === 0 ? reason : undefined} onClick={() => add(card.id)}><Plus size={13}/></button>
      </span>
    </li>;
  }

  function tile(card: CardDefinition, inDeck: boolean, index = 0) {
    const availability = deckCardAvailability(draft.cards, card.id, registry, ownedCopies);
    const count = availability.inDeck;
    const unavailable = availability.remaining === 0;
    const reason = availability.limitReached ? msg("Deck limit reached ({v0})", {v0: availability.limit}) : !availability.owned ? msg("No copies owned") : msg("All owned copies are in this deck");
    const copySummary = msg("{v0} in deck · {v1} owned · deck limit {v2}", {v0: count, v1: availability.owned, v2: availability.limit});
    return <article key={card.id} draggable={!inDeck && !unavailable} onDragStart={event => startDrag(event, card.id, 'collection')} onDragEnd={endDrag} className={`builder-card-tile ${drag?.id === card.id && drag.from === 'collection' ? 'dragging' : ''} ${card.legendary ? 'is-legendary' : ''} ${count ? 'has-copies' : ''} ${inDeck ? 'in-deck' : ''} ${!inDeck && unavailable ? 'unavailable' : ''}`}
      style={inDeck ? { zIndex: deckCards.length - index, ['--deck-stagger' as string]: `${index % 2 ? 10 : 0}px` } : undefined}>
      <div className="builder-tile-art">
        {inDeck && count > 2 && <span className="builder-card-back copy-back-2" aria-hidden style={{ backgroundImage: `url("${card.art}")` }}/>}
        {inDeck && count > 1 && <span className="builder-card-back copy-back-1" aria-hidden style={{ backgroundImage: `url("${card.art}")` }}/>}
        <ArtCard card={card} reduced={reduced} onClick={() => { if (inDeck) remove(card.id); else if (!unavailable) add(card.id); }}
          interaction={{
            'aria-label': inDeck ? msg("Remove {v0} from deck",{v0:card.name}) : msg("Add {v0} to deck",{v0:card.name}),
            'aria-disabled': !inDeck && unavailable || undefined,
            title: inDeck ? msg("Click to remove one copy · right-click to inspect") : msg("{v0} · {v1} · right-click to inspect", {v0: unavailable ? reason : 'Click to add one copy', v1: copySummary}),
            onContextMenu: event => { event.preventDefault(); inspect(card); },
          }}/>
      </div>
      <div className="builder-tile-meta"><OwnershipPips card={card} owned={ownedCopies} inDeck={count}/></div>
    </article>;
  }

  return <main className="collection-page builder-page deck-workshop" aria-label={msg("Deck builder")}>
    <input ref={fileRef} className="deck-file-input" type="file" accept=".json,application/json" aria-label={msg("Import deck file")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readFile(file); }}/>
    <section className={`builder-collection ${drag?.from === 'deck' ? 'drop-ready' : ''} ${over === 'collection' ? 'drop-over' : ''}`} aria-label={msg("All cards")} {...dropZone('collection', 'deck', id => remove(id))}>
      <div className="builder-collection-bar">
        <h2>{msg("Your cards")}<span>{cards.length} {msg("cards")}</span></h2>
        <label className="collection-search"><Search size={15}/><input aria-label={msg("Search cards")} placeholder={msg("Search cards…")} value={filters.query} onChange={event => filter('query', event.target.value)}/></label>
        <button className="builder-small-button filter-trigger" onClick={() => openDialog('filters')} aria-label={msg("Open card filters")}><Filter size={14}/><span>{msg("Filters")}</span>{filterCount > 0 && <b>{filterCount}</b>}</button>
        {(filtered || showUnowned) && <button className="builder-icon-button" aria-label={msg("Clear filters")} title={msg("Clear filters")} onClick={() => { setFilters({ ...initialBuilderFilters, sort: filters.sort }); setShowUnowned(false); }}><X size={15}/></button>}
      </div>
      <div className="builder-collection-gallery" aria-label={msg("Browse collection cards")}>
        {!cards.length ? <div className="collection-empty"><Search size={24}/><p>{allCards.length && !showUnowned ? msg("No owned cards match. Open boosters in the Store, or show cards you don’t own in Filters.") : msg("No cards match these filters.")}</p><button className="outline-button" onClick={() => { setFilters(initialBuilderFilters); setShowUnowned(false); }}>{msg("Reset filters")}</button></div> : cards.map(card => tile(card, false))}
      </div>
    </section>
    <aside className={`builder-deck ${drag?.from === 'collection' ? 'drop-ready' : ''} ${over === 'deck' ? 'drop-over' : ''}`} aria-label={msg("Cards in deck")} {...dropZone('deck', 'collection', id => add(id))}>
      <div className="dk-head">
        <h2 className="sr-only">{msg("Your deck")}{' '}{summary.total} {msg("cards")}</h2>
        <input className="builder-deck-name" aria-label={msg("Deck name")} placeholder={msg("Name your deck")} maxLength={60} value={draft.name} onChange={event => change({ ...draft, name: event.target.value })}/>
        <div className="builder-deck-actions">
          <button className="builder-icon-button" aria-label={msg("Undo deck edit")} disabled={!canUndo} onClick={undo} title={msg("Undo the last edit")}><RotateCcw size={15}/></button>
          <button className="gold-button builder-save" disabled={!draft.name.trim() || !!isSaved} onClick={save}>{isSaved ? msg("Saved") : msg("Save")}<Check size={14}/></button>
          <button className="builder-icon-button" aria-label={msg("Deck actions")} title={msg("Load, new, duplicate, import or export")} onClick={() => openDialog('deck')}><MoreHorizontal size={18}/></button>
        </div>
      </div>
      <div className={`dk-progress ${errors.length ? 'incomplete' : 'valid'}`} title={errors.length ? errors.join(' ') : msg("Ready to play · {v0} unique cards", {v0: summary.unique})}>
        <span>{!errors.length && <Check size={13}/>}<b>{summary.total}</b> / {deckRules.minimumCards} {msg("cards")}</span>
        <i aria-hidden><u style={{ width: `${Math.min(100, summary.total / deckRules.minimumCards * 100)}%` }}/></i>
      </div>
      <div className="builder-deck-grid" ref={deckGalleryRef} tabIndex={0} aria-label={msg("Cards in deck")}>
        {!deckCards.length ? <div className="collection-empty deck-empty"><Layers size={26}/><p>{msg("Your deck starts here.")}</p>
          <div className="deck-empty-starters">{starterOptions.map(deck => <button key={deck.id} className="outline-button" onClick={() => load(deck.id)}>{msg(deck.name)}</button>)}</div></div>
        : !shownDeckCards.length ? <div className="collection-empty">{msg("No cards costing")}{' '}{deckCost === 6 ? '6+' : deckCost} {msg("in this deck.")}</div>
        : groups.map(group => {
            const rows = shownDeckCards.filter(card => card.type === group.type);
            const total = rows.reduce((sum, card) => sum + (counts.get(card.id) ?? 0), 0);
            return rows.length ? <section key={group.type} className="dk-group" aria-label={msg(group.name)}><h3>{msg(group.name)}<span>{total}</span></h3><ul>{rows.map(deckRow)}</ul></section> : null;
          })}
      </div>
      {!!deckCards.length && <div className="dk-curve" role="group" aria-label={msg("Filter deck by energy cost")}>
        {summary.curve.map((count, cost) => <button key={cost} aria-pressed={deckCost === cost} aria-label={msg("{v0} cards costing {v1}", {v0: count, v1: cost === 6 ? '6 or more' : cost})} title={msg("{v0} cards costing {v1} · click to filter", {v0: count, v1: cost === 6 ? '6+' : cost})} disabled={!count} onClick={() => setDeckCost(deckCost === cost ? null : cost)}><span>{count || ''}</span><i style={{ height: `${Math.max(2, count / maxCurve * 30)}px` }}/><small>{cost === 6 ? '6+' : cost}</small></button>)}
      </div>}
      <div className="builder-deck-footer"><span role="status" title={errors.map(issue=>msg(issue)).join(' ')}>{message || (errors.length ? errors[0] : isSaved ? msg("Saved on this device.") : msg("Draft saved automatically."))}</span><button onClick={() => openDialog('overview')} title={msg("Deck overview")}>{summary.freeProducers} {msg("free producers ·")}{' '}{formatNumber(summary.averageCost,{minimumFractionDigits:1,maximumFractionDigits:1})} {msg("avg. cost")}</button></div>
    </aside>
    {dialog === 'filters' && <BuilderDialog title={msg("Card filters")} origin={sharingOrigin.current} close={() => setDialog(null)}>
      <div className="builder-filter-dialog-grid">
        <label>{msg("Set")}<select aria-label={msg("Filter by set")} value={filters.set} onChange={event => filter('set', event.target.value)}><option value="all">{msg("All sets")}</option>{setDefinitions.map(set => <option key={set.id} value={set.id}>{msg(set.name)}</option>)}</select></label>
        <label>{msg("Faction")}<FactionSelect aria-label={msg("Filter by faction")} value={filters.faction} onChange={event => filter('faction', event.target.value)}/></label>
        <label>{msg("Type")}<select aria-label={msg("Filter by card type")} value={filters.kind} onChange={event => filter('kind', event.target.value)}><option value="all">{msg("All types")}</option><option value="creature">{msg("Creatures")}</option><option value="spell">{msg("Spells")}</option><option value="bastion">{msg("Bastions")}</option></select></label>
        <label>{msg("Role")}<select aria-label={msg("Filter by role")} value={filters.role} onChange={event => filter('role', event.target.value as BuilderFilters['role'])}><option value="all">{msg("All roles")}</option><option value="producers">{msg("Energy producers")}</option><option value="free-producers">{msg("Free producers")}</option></select></label>
        <label>{msg("Rarity")}<select aria-label={msg("Filter by rarity")} value={filters.rarity} onChange={event => filter('rarity', event.target.value)}><option value="all">{msg("All rarities")}</option><option value="common">{msg("Common")}</option><option value="rare">{msg("Rare")}</option><option value="legendary">{msg("Legendary")}</option></select></label>
        <label className="builder-filter-sort">{msg("Sort cards")}<select aria-label={msg("Sort cards")} value={filters.sort} onChange={event => filter('sort', event.target.value as CardSort)}><option value="cost">{msg("Cost: low to high")}</option><option value="name">{msg("Name: A–Z")}</option><option value="attack">{msg("Attack: high to low")}</option><option value="defense">{msg("Defense: high to low")}</option></select></label>
      </div>
      <div className="builder-cost-filter" role="group" aria-label={msg("Filter by total energy cost")}><span>{msg("Cost")}</span><button aria-pressed={filters.cost === null} onClick={() => filter('cost', null)}>{msg("All")}</button>{summary.curve.map((_, cost) => <button key={cost} aria-label={msg("Cost {v0}", {v0: cost === 6 ? '6 or more' : cost})} aria-pressed={filters.cost === cost} onClick={() => filter('cost', filters.cost === cost ? null : cost)}>{cost === 6 ? '6+' : cost}</button>)}</div>
      <Checkbox className="builder-limit-filter" checked={showUnowned} onChange={event => setShowUnowned(event.target.checked)}>{msg("Show cards I don’t own")}{hiddenCount > 0 && msg(" ({v0} hidden)", {v0: hiddenCount})}</Checkbox>
      <Checkbox className="builder-limit-filter" checked={filters.addable} onChange={event => filter('addable', event.target.checked)}>{msg("Only cards I can add")}</Checkbox>
      <div className="builder-dialog-actions"><button className="outline-button" onClick={() => { setFilters(initialBuilderFilters); setShowUnowned(false); }}>{msg("Reset filters")}</button><button className="gold-button" onClick={() => setDialog(null)}>{msg("Show")}{' '}{cards.length} {msg("cards")}<Check size={15}/></button></div>
    </BuilderDialog>}
    {dialog === 'deck' && <BuilderDialog title={msg("Deck actions")} origin={sharingOrigin.current} close={() => setDialog(null)}>
      <label>{msg("Load deck")}<select aria-label={msg("Load deck")} value={saved ? draft.id : 'draft'} onChange={event => { load(event.target.value); setDialog(null); }}><option value="draft">{msg("Current draft")}</option><optgroup label={msg("Starter decks")}>{starterOptions.map(deck => <option key={deck.id} value={deck.id}>{msg(deck.name)}</option>)}</optgroup>{decks.length > 0 && <optgroup label={msg("Your decks")}>{decks.map(deck => <option key={deck.id} value={deck.id}>{msg(deck.name)}</option>)}</optgroup>}</select></label>
      <div className="builder-manage-actions"><button className="outline-button" onClick={() => { change(newDeck()); setDialog(null); }}><Plus size={16}/>{msg("New deck")}</button><button className="outline-button" onClick={() => { change({ ...draft, id: newDeck().id, name: msg("{v0} (copy)", {v0: draft.name.slice(0, 53)}) }); setDialog(null); }}><Copy size={16}/>{msg("Duplicate deck")}</button><button className="outline-button" onClick={() => openSharing('import')}><Upload size={16}/>{msg("Import deck")}</button><button className="outline-button" disabled={!draft.cards.length} onClick={() => openSharing('export')}><Download size={16}/>{msg("Export deck")}</button></div>
      {saved && (confirmDelete ? <div className="builder-delete-confirm" role="alertdialog" aria-label={msg("Delete deck")}><p>{msg("Delete “{v0}”? This can’t be undone.", {v0: saved.name})}</p><div className="builder-dialog-actions"><button className="outline-button" onClick={() => setConfirmDelete(false)}>{msg("Keep deck")}</button><button className="gold-button danger" data-autofocus onClick={() => { removeDeck(); setConfirmDelete(false); setDialog(null); }}><Trash2 size={15}/>{msg("Delete deck")}</button></div></div> : <button className="outline-button builder-delete" onClick={() => setConfirmDelete(true)}><Trash2 size={16}/>{msg("Delete deck")}</button>)}
      <p>{deckRules.minimumCards} {msg("cards minimum ·")}{' '}{deckRules.copiesPerCard} {msg("copies per card ·")}{' '}{deckRules.copiesPerLegendary} {msg("per legendary")}</p>
    </BuilderDialog>}
    {dialog === 'overview' && <BuilderDialog title={msg("Deck overview")} origin={sharingOrigin.current} close={() => setDialog(null)}>
      <p>{draft.name || msg("Untitled deck")} · {summary.total} {msg("cards ·")}{' '}{summary.unique} {msg("unique")}</p>
      <div className="deck-metrics"><span><b>{summary.freeProducers}</b>{' '}{msg("Free producers")}</span><span><b>{summary.producers}</b>{' '}{msg("All producers")}</span><span><b>{formatNumber(summary.averageCost,{minimumFractionDigits:1,maximumFractionDigits:1})}</b>{' '}{msg("Average cost")}</span></div>
      <div className="deck-curve-heading">{msg("Energy cost curve")}</div>
      <div className="deck-cost-curve" role="img" aria-label={msg("Energy cost curve: {v0}", {v0: summary.curve.map((count, cost) => `${cost === 6 ? '6+' : cost} cost: ${count} cards`).join(', ')})}>
        {summary.curve.map((count, cost) => <div key={cost} title={msg("{v0} cards costing {v1}", {v0: count, v1: cost === 6 ? '6+' : cost})}><span>{count || ''}</span><i style={{ height: `${Math.max(2, count / maxCurve * 70)}px` }}/><small>{cost === 6 ? '6+' : cost}</small></div>)}
      </div>
      <p role="status">{errors.length ? errors.join(' ') : msg("Ready to play.")}</p>
    </BuilderDialog>}
    {sharing && <BuilderDialog title={sharing === 'export' ? msg("Export deck") : msg("Import deck")} origin={sharingOrigin.current} close={() => setDialog(null)}>
      <p>{sharing === 'export' ? msg("Copy this deck code to share it, or download a file.") : msg("Paste a deck code or choose an exported deck file. It opens as a new draft.")}</p>
      <textarea ref={codeRef} aria-label={msg("Deck code")} readOnly={sharing === 'export'} value={deckCode} onChange={event => { setDeckCode(event.target.value); setImportError(''); }} spellCheck={false}/>
      {importError && <p className="builder-dialog-error" role="alert">{msg(importError)}</p>}{copyMessage && <p role="status">{msg(copyMessage)}</p>}
      <div className="builder-dialog-actions">{sharing === 'export' ? <><button className="outline-button" onClick={download}><Download size={15}/>{msg("Download file")}</button><button className="gold-button" onClick={() => void copyCode()}><Copy size={15}/>{msg("Copy deck code")}</button></> : <><button className="outline-button" onClick={() => fileRef.current?.click()}><Upload size={15}/>{msg("Choose file")}</button><button className="gold-button" disabled={!deckCode.trim()} onClick={() => { try { importCode(deckCode); } catch (error) { setImportError(error instanceof Error ? error.message : msg("Could not read this deck.")); } }}>{msg("Import deck")}<Check size={15}/></button></>}</div>
    </BuilderDialog>}
  </main>;
}
