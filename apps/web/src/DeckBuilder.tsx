import { CardBackPicker } from './CardBackFace';
import { Workshop } from './layout/Workshop';
import { Checkbox } from './Checkbox';
import { FactionSelect } from './FactionSelect';
import { t as msg, useLanguage, formatNumber } from '../../../packages/ui/src/i18n';
import { ArrowLeft, ChartNoAxesColumn, Check, Copy, Download, Filter, Layers, Minus, MoreHorizontal, Plus, RotateCcw, Search, ShoppingBag, Trash2, Upload, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CardDefinition } from '../../../packages/contracts/src';
import { deckRules } from '../../../packages/contracts/src';
import { factionInfo, registry, setDefinitions } from '../../../packages/content/src';
import { validateDeck } from '../../../packages/core/src';
import { ArtCard, CardHoverButton } from '../../../packages/ui/src/CardPresentation';
import { BuilderDialog } from './BuilderDialog';
import { DeckShelf } from './DeckShelf';
import { byOwnership, CardFilterBar, defaultOwnership, type Ownership } from './CardFilters';
import { OwnershipPips } from './OwnershipPips';
import { deckCardAvailability, starterOptions, type CustomDeck } from './decks';
import { missingDeckCopies, missingDeckPurchase, type OwnedCopies } from './collection';
import { CrownAmount } from './Crowns';
import { builderCards, cardCost, compareCards, exportDeck, importDeck, initialBuilderFilters, summarizeDeck, type BuilderFilters, type CardSort } from './deckTools';

type Props = {
  draft: CustomDeck; decks: CustomDeck[]; ownedCopies: OwnedCopies; crowns: number; message: string; canUndo: boolean; reduced: boolean;
  change: (deck: CustomDeck) => void; add: (id: string) => void; remove: (id: string) => void;
  load: (id: string) => void; renameDeck: (id: string, name: string) => string | null; deleteSaved: (id: string) => string | null; removeDeck: () => void; save: () => void; undo: () => void; buyMissing: () => void; inspect: (card: CardDefinition) => void; openCollection: () => void;
};
const newDeck = (): CustomDeck => ({ id: `custom-${crypto.randomUUID()}`, name: msg("New deck"), cards: [] });
const groups = [{ type: 'creature', name: 'Creatures' }, { type: 'holding', name: 'Holdings' }, { type: 'spell', name: 'Spells' }] as const;
const signature = (deck: CustomDeck) => JSON.stringify([deck.name, [...deck.cards].sort(), deck.back ?? '']);

export function DeckBuilder({ draft, decks, ownedCopies, crowns, message, canUndo, reduced, change, add, remove, load, save, renameDeck, deleteSaved, removeDeck, undo, buyMissing, inspect, openCollection }: Props) {
  useLanguage();
  const [filters, setFilters] = useState<BuilderFilters>(initialBuilderFilters);
  // The builder opens on the shelf of saved decks; choosing one (or starting a new one) opens the editor.
  const [editing, setEditing] = useState(false);
  const [importError, setImportError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const deckGalleryRef = useRef<HTMLDivElement>(null);
  const [ownership, setOwnership] = useState<Ownership>(defaultOwnership);
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
  const [dialog, setDialogState] = useState<'deck' | 'overview' | 'import' | 'export' | null>(null);
  const setDialog = (next: typeof dialog) => { setConfirmDelete(false); setDialogState(next); };
  const sharing = dialog === 'import' || dialog === 'export' ? dialog : null;
  const [deckCode, setDeckCode] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const sharingOrigin = useRef<HTMLElement | null>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { deckGalleryRef.current?.scrollTo({ top: 0 }); }, [draft.id]);
  const filter = <K extends keyof BuilderFilters>(key: K, value: BuilderFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const allCards = useMemo(() => builderCards(registry, draft.cards, filters), [draft.cards, filters]);
  const cards = useMemo(() => byOwnership(allCards, ownedCopies, ownership), [allCards, ownedCopies, ownership]);
  const hiddenCount = allCards.length - cards.length;
  const summary = useMemo(() => summarizeDeck(draft.cards, registry), [draft.cards]);
  const counts = new Map<string, number>();
  for (const id of draft.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const deckCards = [...counts.keys()].flatMap(id => registry.cards[id] ? [registry.cards[id]] : []).sort(compareCards);
  const missing = missingDeckCopies(draft.cards, ownedCopies);
  const purchase = missingDeckPurchase(draft.cards, ownedCopies, registry);
  const canBuyMissing = purchase.complete && purchase.copies > 0 && crowns >= purchase.crowns;
  const errors = [...validateDeck(draft.cards, registry), ...(missing.length ? [msg("Missing {v0} owned copies. Buy them or edit this deck.", {v0: missing.reduce((sum,card) => sum + card.missing, 0)})] : [])];
  const saved = decks.find(deck => deck.id === draft.id);
  const isSaved = saved && signature(saved) === signature(draft);
  const maxCurve = Math.max(1, ...summary.curve);
  // Copies beyond what the player owns are listed apart from the owned ones and shown dimmed.
  type DeckEntry = { card: CardDefinition; count: number; unowned: boolean };
  const shownDeckCards = deckCards.filter(card => (deckCost === null || Math.min(6, cardCost(card)) === deckCost));
  const deckEntries: DeckEntry[] = shownDeckCards.flatMap(card => {
    const total = counts.get(card.id) ?? 0, have = Math.min(total, ownedCopies[card.id] ?? 0);
    return [...(have ? [{ card, count: have, unowned: false }] : []), ...(total > have ? [{ card, count: total - have, unowned: true }] : [])];
  });
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

  function deckRow({ card, count, unowned }: { card: CardDefinition; count: number; unowned: boolean }) {
    const availability = deckCardAvailability(draft.cards, card.id, registry);
    const ownedAll = !unowned && count >= (ownedCopies[card.id] ?? 0);
    const reason = availability.limitReached ? msg("Deck limit reached ({v0})", {v0: availability.limit}) : !availability.owned ? msg("No copies owned") : msg("All owned copies are in this deck");
    return <li key={`${card.id}${unowned ? ':unowned' : ''}`} className={`dk-row ${card.legendary ? 'is-legendary' : ''} ${unowned ? 'not-owned' : ''} ${drag?.id === card.id && drag.from === 'deck' ? 'dragging' : ''}`} draggable onDragStart={event => startDrag(event, card.id, 'deck')} onDragEnd={endDrag} onContextMenu={event => { event.preventDefault(); inspect(card); }}>
      <span className="dk-art" aria-hidden style={{ backgroundImage: `url("${card.art}")` }}/>
      <span className="dk-cost" title={msg("Energy cost")}>{cardCost(card)}</span>
      <CardHoverButton card={card} className="dk-name" ariaLabel={msg("Inspect {v0}", {v0: card.name})} onClick={() => inspect(card)}>{msg(card.name)}</CardHoverButton>
      <span className="dk-copies">
        <button aria-label={msg("Remove one {v0}", {v0: card.name})} onClick={() => remove(card.id)}><Minus size={13}/></button>
        <b aria-label={unowned ? msg("{v0} copies you don’t own", {v0: count}) : msg("{v0} copies", {v0: count})}>{count}</b>
        <button aria-label={msg("Add one {v0}", {v0: card.name})} disabled={ownedAll || (unowned ? availability.limitReached : availability.remaining === 0)} title={availability.remaining === 0 || ownedAll ? reason : undefined} onClick={() => add(card.id)}><Plus size={13}/></button>
      </span>
    </li>;
  }

  function tile(card: CardDefinition, inDeck: boolean, index = 0) {
    const availability = deckCardAvailability(draft.cards, card.id, registry);
    const ownership = deckCardAvailability(draft.cards, card.id, registry, ownedCopies);
    const count = availability.inDeck;
    const unavailable = availability.remaining === 0;
    const reason = availability.limitReached ? msg("Deck limit reached ({v0})", {v0: availability.limit}) : !ownership.owned ? msg("No copies owned") : msg("All owned copies are in this deck");
    const copySummary = msg("{v0} in deck · {v1} owned · deck limit {v2}", {v0: count, v1: ownership.owned, v2: availability.limit});
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

  const shelf = !editing && dialog !== 'import';
  const importFromShelf = () => { setEditing(true); openSharing('import'); };
  if (shelf) return <DeckShelf decks={decks} draft={draft} ownedCopies={ownedCopies}
    open={id => { if (id) load(id); setEditing(true); }}
    create={() => { change(newDeck()); setEditing(true); }} importDeck={importFromShelf} openCollection={openCollection} rename={renameDeck} remove={deleteSaved}/>;
  return <Workshop label={msg("Deck builder")} className="collection-page builder-page" panelLabel={msg("All cards")}
    panel={{ className: `${drag?.from === 'deck' ? 'drop-ready' : ''} ${over === 'collection' ? 'drop-over' : ''}`, ...dropZone('collection', 'deck', id => remove(id)) }}
    title={msg("Your cards")} subtitle={<>{cards.length} {msg("cards")}</>}
    actions={
        <CardFilterBar filters={filters} setFilters={setFilters} ownership={ownership} setOwnership={setOwnership} count={cards.length} hidden={hiddenCount} deck/>
    }
    pane={
    <aside className={`builder-deck ${drag?.from === 'collection' ? 'drop-ready' : ''} ${over === 'deck' ? 'drop-over' : ''}`} aria-label={msg("Cards in deck")} {...dropZone('deck', 'collection', id => add(id))}>
      <div className="dk-head">
        <h2 className="sr-only">{msg("Your deck")}{' '}{summary.total} {msg("cards")}</h2>
        <button className="builder-icon-button" aria-label={msg("Back to decks")} title={msg("Back to decks")} onClick={() => setEditing(false)}><ArrowLeft size={16}/></button>
        <input className="builder-deck-name" aria-label={msg("Deck name")} placeholder={msg("Name your deck")} maxLength={60} value={draft.name} onChange={event => change({ ...draft, name: event.target.value })}/>
        <div className="builder-deck-actions">
          <CardBackPicker value={draft.back} onChange={back => change({ ...draft, back })}/>
          <button className="builder-icon-button" aria-label={msg("Undo deck edit")} disabled={!canUndo} onClick={undo} title={msg("Undo the last edit")}><RotateCcw size={15}/></button>
          <button className="gold-button builder-save" disabled={!draft.name.trim() || !!isSaved} onClick={save}>{isSaved ? msg("Saved") : msg("Save")}<Check size={14}/></button>
          <button className="builder-icon-button" aria-label={msg("Deck actions")} title={msg("Load, new, duplicate, import or export")} onClick={() => openDialog('deck')}><MoreHorizontal size={18}/></button>
        </div>
      </div>
      <div className={`dk-progress ${errors.length ? 'incomplete' : 'valid'}`} title={errors.length ? errors.join(' ') : msg("Ready to play · {v0} unique cards", {v0: summary.unique})}>
        <span>{!errors.length && <Check size={13}/>}<b>{summary.total}</b> / {deckRules.minimumCards} {msg("cards")}</span>
        <i aria-hidden><u style={{ width: `${Math.min(100, summary.total / deckRules.minimumCards * 100)}%` }}/></i>
      </div>
      {purchase.copies > 0 && <div className="deck-purchase" role="status">
        <span><b>{purchase.copies}</b> {msg("cards to collect")}<CrownAmount amount={purchase.crowns}/></span>
        <button className="gold-button" disabled={!canBuyMissing} title={!canBuyMissing ? msg("Not enough crowns.") : undefined} onClick={buyMissing}><ShoppingBag size={14}/>{msg("Buy missing cards")}</button>
      </div>}
      <div className="builder-deck-grid" ref={deckGalleryRef} tabIndex={0} aria-label={msg("Cards in deck")}>
        {!deckCards.length ? <div className="collection-empty deck-empty"><Layers size={26}/><p>{msg("Your deck starts here.")}</p>
          <div className="deck-empty-starters">{starterOptions.map(deck => <button key={deck.id} className="outline-button" onClick={() => load(deck.id)}>{msg(deck.name)}</button>)}</div></div>
        : !shownDeckCards.length ? <div className="collection-empty">{msg("No cards costing")}{' '}{deckCost === 6 ? '6+' : deckCost} {msg("in this deck.")}</div>
        : groups.map(group => {
            const rows = deckEntries.filter(entry => entry.card.type === group.type);
            const total = rows.reduce((sum, entry) => sum + entry.count, 0);
            return rows.length ? <section key={group.type} className="dk-group" aria-label={msg(group.name)}><h3>{msg(group.name)}<span>{total}</span></h3><ul>{rows.map(deckRow)}</ul></section> : null;
          })}
      </div>
      {!!deckCards.length && <div className="dk-curve" role="group" aria-label={msg("Filter deck by energy cost")}>
        {summary.curve.map((count, cost) => <button key={cost} aria-pressed={deckCost === cost} aria-label={msg("{v0} cards costing {v1}", {v0: count, v1: cost === 6 ? '6 or more' : cost})} title={msg("{v0} cards costing {v1} · click to filter", {v0: count, v1: cost === 6 ? '6+' : cost})} disabled={!count} onClick={() => setDeckCost(deckCost === cost ? null : cost)}><span>{count || ''}</span><i style={{ height: `${Math.max(2, count / maxCurve * 30)}px` }}/><small>{cost === 6 ? '6+' : cost}</small></button>)}
      </div>}
      <div className="builder-deck-footer"><span role="status" title={errors.map(issue=>msg(issue)).join(' ')}>{message || (errors.length ? errors[0] : isSaved ? msg("Saved on this device.") : msg("Draft saved automatically."))}</span><button onClick={() => openDialog('overview')} title={msg("Deck overview")}>{summary.freeProducers} {msg("free producers ·")}{' '}{formatNumber(summary.averageCost,{minimumFractionDigits:1,maximumFractionDigits:1})} {msg("avg. cost")}</button></div>
    </aside>
    }
    overlays={<>
    {dialog === 'deck' && <BuilderDialog title={msg("Deck actions")} origin={sharingOrigin.current} close={() => setDialog(null)}>
      <label>{msg("Load deck")}<select aria-label={msg("Load deck")} value={saved ? draft.id : 'draft'} onChange={event => { load(event.target.value); setDialog(null); }}><option value="draft">{msg("Current draft")}</option><optgroup label={msg("Starter decks")}>{starterOptions.map(deck => <option key={deck.id} value={deck.id}>{msg(deck.name)}</option>)}</optgroup>{decks.length > 0 && <optgroup label={msg("Your decks")}>{decks.map(deck => <option key={deck.id} value={deck.id}>{msg(deck.name)}</option>)}</optgroup>}</select></label>
      <div className="builder-manage-actions"><button className="outline-button" onClick={() => { change(newDeck()); setDialog(null); }}><Plus size={16}/>{msg("New deck")}</button><button className="outline-button" onClick={() => { change({ ...draft, id: newDeck().id, name: msg("{v0} (copy)", {v0: draft.name.slice(0, 53)}) }); setDialog(null); }}><Copy size={16}/>{msg("Duplicate deck")}</button><button className="outline-button" onClick={() => openSharing('import')}><Upload size={16}/>{msg("Import deck")}</button><button className="outline-button" disabled={!draft.cards.length} onClick={() => openSharing('export')}><Download size={16}/>{msg("Export deck")}</button></div>
      {saved && (confirmDelete ? <div className="builder-delete-confirm" role="alertdialog" aria-label={msg("Delete deck")}><p>{msg("Delete “{v0}”? This can’t be undone.", {v0: saved.name})}</p><div className="builder-dialog-actions"><button className="outline-button" onClick={() => setConfirmDelete(false)}>{msg("Keep deck")}</button><button className="gold-button danger" data-autofocus onClick={() => { removeDeck(); setConfirmDelete(false); setDialog(null); setEditing(false); }}><Trash2 size={15}/>{msg("Delete deck")}</button></div></div> : <button className="outline-button builder-delete" onClick={() => setConfirmDelete(true)}><Trash2 size={16}/>{msg("Delete deck")}</button>)}
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
    </>}>
    <input ref={fileRef} className="deck-file-input" type="file" accept=".json,application/json" aria-label={msg("Import deck file")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readFile(file); }}/>
      <div className="builder-collection-gallery" aria-label={msg("Browse collection cards")}>
        {!cards.length ? <div className="collection-empty"><Search size={24}/><p>{allCards.length && !ownership.unowned ? msg("No owned cards match. Open boosters in the Store, or show cards you don’t own in Filters.") : msg("No cards match these filters.")}</p><button className="outline-button" onClick={() => { setFilters(initialBuilderFilters); setOwnership(defaultOwnership); }}>{msg("Reset filters")}</button></div> : cards.map(card => tile(card, false))}
      </div>
  </Workshop>;
}
