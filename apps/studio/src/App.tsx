import { useCallback, useEffect, useMemo, useState } from 'react';

import { factionInfo, setDefinitions } from '../../../packages/content/src';
import { updatePreferences, usePreferences } from '../../../packages/ui/src';
import { CardForm } from './CardForm';
import { Preview } from './Preview';
import * as fs from './fs';
import { SetOverview } from './SetOverview';
import { FactionDots } from './SetOverview';
import { draftFromFiles, groupOf, named, matches, newDraft, noFilters, serialize, toJson, validate, type Draft, type Filters } from './model';

type Entry = { draft: Draft; art: Blob | null; artChanged: boolean; dirty: boolean };
const editKey = (folder: string) => `edit:${folder}`;
const newKey = () => `new:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function Thumb({ art }: { art?: Blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (!art) return; const made = URL.createObjectURL(art); setUrl(made); return () => URL.revokeObjectURL(made); }, [art]);
  return <span className="thumb">{url && <img src={url} alt=""/>}</span>;
}

/** Card Studio: edit assets/cards/* through the browser's file access. Saving writes data.json, data.de.json and data.png. */
export function App() {
  const { language } = usePreferences();
  const [repo, setRepo] = useState<fs.Repo | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [needsPermission, setNeedsPermission] = useState<fs.Repo | null>(null);
  const [cards, setCards] = useState<fs.StoredCard[]>([]);
  // Every card being worked on. A dirty entry is an unsaved draft: it stays when you open another card and survives a reload.
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const entry = currentKey ? entries[currentKey] : undefined;
  const draft = entry?.draft ?? null, art = entry?.art ?? null, artChanged = entry?.artChanged ?? false;
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState('');
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [view, setView] = useState<'cards' | 'sets'>('cards');
  const [activeSet, setActiveSet] = useState('');

  const load = useCallback(async (target: fs.Repo) => { setCards(await fs.readCards(target)); setRepo(target); }, []);
  useEffect(() => { void (async () => {
    const saved = await fs.recallRepo();
    if (!saved) return;
    if (await fs.hasAccess(saved, false)) await load(saved); else setNeedsPermission(saved);
  })(); }, [load]);

  const guard = async (work: () => Promise<void>) => { setProblem(''); try { await work(); } catch (error) { setProblem(error instanceof Error ? error.message : String(error)); } };
  const choose = () => guard(async () => load(await fs.pickRepo()));
  const resume = () => guard(async () => { if (needsPermission && await fs.hasAccess(needsPermission, true)) { await load(needsPermission); setNeedsPermission(null); } });
  const trySandbox = () => guard(async () => { setSandbox(true); await load(await fs.sandboxRepo()); });

  const ids = useMemo(() => new Set(cards.map(card => card.data.id as string)), [cards]);
  const order = useMemo(() => [...cards].sort((a, b) => a.data.name.localeCompare(b.data.name)), [cards]);
  const factionIds = useMemo(() => Object.keys(factionInfo).filter(id => id !== 'neutral'), []);
  const pairs = useMemo(() => [...new Set(cards.map(card => groupOf(card.data, factionIds)).filter(group => group.includes('+')))].sort(), [cards, factionIds]);
  const visible = order.filter(card => matches(card, filters));
  const filtered = JSON.stringify({ ...filters, query: '' }) !== JSON.stringify({ ...noFilters, query: '' });
  const setFilter = (change: Partial<Filters>) => setFilters(current => ({ ...current, ...change }));
  const openCards = (change: Partial<Filters>) => { setFilters({ ...noFilters, ...change }); setView('cards'); };

  /** Switch to a card. Untouched entries are dropped (they can be rebuilt from disk); unsaved drafts stay. */
  const go = (key: string, make?: () => Entry) => {
    setEntries(current => {
      const next: Record<string, Entry> = {};
      for (const [k, value] of Object.entries(current)) if (value.dirty || k === key) next[k] = value;
      if (!next[key] && make) next[key] = make();
      return next;
    });
    setCurrentKey(key); setStatus(''); setProblem(''); setView('cards');
  };
  const edit = (card: fs.StoredCard) => go(editKey(card.folder), () => ({ draft: draftFromFiles(card.folder, card.data, card.de), art: card.art ?? null, artChanged: false, dirty: false }));
  /** A blank card. The set and faction default to whatever the list is filtered to, or to what the caller chose. */
  const create = (where: { set?: string; faction?: string } = {}) =>
    go(newKey(), () => ({ draft: newDraft(where.set || filters.set || activeSet || setDefinitions[0]?.id, where.faction ?? filters.faction), art: null, artChanged: false, dirty: false }));
  const duplicate = () => { if (draft) go(newKey(), () => ({ draft: { ...draft, isNew: true, folder: '', id: '', name: `${draft.name} copy`, deckLimitKey: '', revision: 1 }, art, artChanged: !!art, dirty: true })); };
  const change = (update: (entry: Entry) => Entry) => { if (!currentKey) return; setEntries(current => current[currentKey] ? { ...current, [currentKey]: update(current[currentKey]) } : current); setStatus(''); };
  const patch = (changes: Partial<Draft>) => change(value => ({ ...value, draft: { ...value.draft, ...changes }, dirty: true }));
  /** Throw away unsaved changes: a saved card reopens as it is on disk, an unsaved new card disappears. */
  const discard = () => {
    if (!currentKey || !draft) return;
    const stored = draft.isNew ? undefined : cards.find(card => card.folder === draft.folder);
    setEntries(current => { const next = { ...current }; delete next[currentKey]; return next; });
    if (stored) go(editKey(stored.folder), () => ({ draft: draftFromFiles(stored.folder, stored.data, stored.de), art: stored.art ?? null, artChanged: false, dirty: false }));
    else setCurrentKey(null);
  };
  const drafts = Object.entries(entries).filter(([, value]) => value.dirty);
  const newDrafts = drafts.filter(([key]) => key.startsWith('new:'));
  const hasDraft = (folder: string) => !!entries[editKey(folder)]?.dirty;

  const result = draft ? validate(draft, ids, !!art) : { errors: [], warnings: [] };
  const save = () => guard(async () => {
    if (!repo || !draft || !currentKey || result.errors.length) return;
    const next = { ...draft, deckLimitKey: draft.deckLimitKey || draft.id, revision: draft.isNew ? 1 : draft.revision };
    const folder = draft.isNew ? draft.id : draft.folder;
    const { data, de } = serialize(next);
    await fs.writeCard(repo, folder, { data: toJson(data) + '\n', de: de ? toJson(de) + '\n' : null, png: artChanged && art ? await fs.toPng(art) : undefined });
    await load(repo);
    // The card now exists on disk, so its draft becomes an ordinary open card.
    setEntries(current => { const rest = { ...current }; delete rest[currentKey]; rest[editKey(folder)] = { draft: { ...next, isNew: false, folder }, art, artChanged: false, dirty: false }; return rest; });
    setCurrentKey(editKey(folder));
    setStatus('Saved. The game picks it up when the dev server re-imports the cards.');
  });

  // Drafts come back after a reload, and are kept in step with the browser's storage while you work.
  const scope = sandbox ? 'sandbox' : repo?.name ?? '';
  useEffect(() => {
    if (!repo) return;
    let cancelled = false; setDraftsLoaded(false);
    void fs.loadDrafts(scope).then(saved => {
      if (cancelled) return;
      setEntries(current => ({ ...Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, { draft: value.draft as Draft, art: value.art, artChanged: value.artChanged, dirty: true }])), ...current }));
      setDraftsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [repo, scope]);
  useEffect(() => {
    if (!repo || !draftsLoaded) return;
    const timer = setTimeout(() => void fs.storeDrafts(scope, Object.fromEntries(Object.entries(entries).filter(([, value]) => value.dirty).map(([key, value]) => [key, { draft: value.draft, art: value.art, artChanged: value.artChanged }]))), 400);
    return () => clearTimeout(timer);
  }, [entries, repo, scope, draftsLoaded]);

  if (!repo) return <div className="studio studio-welcome">
    <h1>Varhyr Card Studio</h1>
    {!fs.supported ? <p>This tool needs Chrome or Edge, because it edits your repository folder directly.</p> : <>
      <p>Choose the repository folder (the one containing <code>assets</code> and <code>packages</code>). Your browser asks once to allow editing it.</p>
      {needsPermission ? <button className="primary" onClick={resume}>Reopen last folder</button> : null}
      <button className="primary" onClick={choose}>{needsPermission ? 'Choose a different folder' : 'Choose repository folder'}</button>
      <button onClick={trySandbox}>Try with an empty practice folder</button></>}
    {problem && <p role="alert" className="studio-problem">{problem}</p>}
  </div>;

  return <div className="studio">
    <header className="studio-bar">
      <h1>Varhyr Card Studio{sandbox && <small>practice folder</small>}</h1>
      <div className="views" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === 'cards'} className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Cards</button>
        <button role="tab" aria-selected={view === 'sets'} className={view === 'sets' ? 'on' : ''} onClick={() => setView('sets')}>Sets</button></div>
      {view === 'cards' && <input placeholder="Search cards…" aria-label="Search cards" value={filters.query} onChange={event => setFilter({ query: event.target.value })}/>}
      <button onClick={() => updatePreferences({ language: language === 'en' ? 'de' : 'en' })}>{language === 'en' ? 'English' : 'Deutsch'}</button>
      <button onClick={() => { void fs.forgetRepo(); setRepo(null); setCurrentKey(null); setSandbox(false); }}>Change folder</button>
    </header>
    <div className="studio-body">
      <nav className="studio-list" aria-label="Cards">
        <button className="primary" onClick={() => create()}>New card</button>
        <div className="filters" role="group" aria-label="Filters">
          <select aria-label="Faction" value={filters.faction} onChange={event => setFilter({ faction: event.target.value })}><option value="">All factions</option>
            {[...factionIds, 'neutral'].map(id => <option key={id} value={id}>{(factionInfo[id]?.name ?? id).replace(/^The /, '')}</option>)}
            {pairs.length > 0 && <optgroup label="Hybrid"><option value="hybrid">Any hybrid</option>{pairs.map(pair => <option key={pair} value={pair}>{pair.split('+').map(id => (factionInfo[id]?.name ?? id).replace(/^The /, '')).join(' + ')}</option>)}</optgroup>}</select>
          <select aria-label="Set" value={filters.set} onChange={event => setFilter({ set: event.target.value })}><option value="">All sets</option>
            {setDefinitions.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}</select>
          <select aria-label="Type" value={filters.type} onChange={event => setFilter({ type: event.target.value })}><option value="">All types</option><option value="creature">Creatures</option><option value="spell">Spells</option><option value="holding">Holdings</option></select>
          <select aria-label="Rarity" value={filters.rarity} onChange={event => setFilter({ rarity: event.target.value })}><option value="">All rarities</option><option value="common">Common</option><option value="rare">Rare</option><option value="legendary">Legendary</option></select>
          <select aria-label="Show" value={filters.show} onChange={event => setFilter({ show: event.target.value as Filters['show'] })}><option value="">Any state</option><option value="no-art">Missing art</option><option value="no-german">Missing German text</option></select>
          {filtered && <button className="quiet" onClick={() => setFilters({ ...noFilters, query: filters.query })}>Clear</button>}
        </div>
        <p className="count" aria-live="polite">{visible.length === cards.length ? `${cards.length} cards` : `${visible.length} of ${cards.length} cards`}</p>
        {newDrafts.length > 0 && <div className="draft-list" role="group" aria-label="Unsaved new cards"><p className="count">Unsaved new cards</p>
          {newDrafts.map(([key, value]) => <button key={key} className={`draft ${key === currentKey ? 'on' : ''}`} onClick={() => go(key)}><span className="name">{value.draft.name || 'Untitled card'}</span><small>draft</small></button>)}</div>}
        {visible.map(card => <button key={card.folder} className={draft && !draft.isNew && draft.folder === card.folder ? 'on' : ''} onClick={() => edit(card)}>
          <Thumb art={card.art}/><span className="name">{card.data.name}</span><FactionDots members={named(card.data)}/><small>{hasDraft(card.folder) ? 'unsaved changes' : card.art ? card.data.type : 'no art'}</small></button>)}
        {!visible.length && <p className="studio-hint">{cards.length ? 'No card matches these filters.' : 'This folder has no cards yet.'}</p>}
      </nav>
      {view === 'sets' ? <SetOverview cards={cards} set={activeSet || filters.set} onSet={setActiveSet} onOpen={openCards} onCreate={create}/> : draft ? <>
        <main className="studio-edit"><CardForm draft={draft} patch={patch} hasArt={!!art} folderLocked={false}
          onArt={file => change(value => ({ ...value, art: file, artChanged: true, dirty: true }))}/></main>
        <aside className="studio-side">
          <Preview draft={draft} art={art}/>
          <ul className="studio-issues">{result.errors.map(message => <li key={message} className="error">{message}</li>)}{result.warnings.map(message => <li key={message}>{message}</li>)}</ul>
          <div className="studio-actions"><button className="primary" disabled={!!result.errors.length} onClick={save}>Save card</button>
            {!draft.isNew && <button onClick={duplicate}>Duplicate</button>}</div>
          {entry?.dirty && <p className="studio-draft">Unsaved changes are kept while you look at other cards. <button className="quiet" onClick={discard}>{draft.isNew ? 'Discard this card' : 'Discard changes'}</button></p>}
          {status && <p role="status" className="studio-status">{status}</p>}
          {problem && <p role="alert" className="studio-problem">{problem}</p>}
        </aside></>
      : <main className="studio-empty"><p>Pick a card to edit, or start a new one.</p></main>}
    </div>
  </div>;
}
