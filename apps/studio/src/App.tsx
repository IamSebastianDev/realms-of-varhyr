import { useCallback, useEffect, useMemo, useState } from 'react';

import { factionInfo } from '../../../packages/content/src';
import { updatePreferences, usePreferences } from '../../../packages/ui/src';
import { CardForm } from './CardForm';
import { Preview } from './Preview';
import * as fs from './fs';
import { draftFromFiles, newDraft, serialize, toJson, validate, type Draft } from './model';

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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [art, setArt] = useState<Blob | null>(null);
  const [artChanged, setArtChanged] = useState(false);
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState('');
  const [query, setQuery] = useState('');

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
  const visible = order.filter(card => card.data.name.toLowerCase().includes(query.toLowerCase().trim()));

  const edit = (card: fs.StoredCard) => { setDraft(draftFromFiles(card.folder, card.data, card.de)); setArt(card.art ?? null); setArtChanged(false); setStatus(''); };
  const create = () => { setDraft(newDraft()); setArt(null); setArtChanged(false); setStatus(''); };
  const duplicate = () => { if (draft) { setDraft({ ...draft, isNew: true, folder: '', id: '', name: `${draft.name} copy`, deckLimitKey: '', revision: 1 }); setStatus(''); } };
  const patch = (change: Partial<Draft>) => { setDraft(current => current && { ...current, ...change }); setStatus(''); };

  const result = draft ? validate(draft, ids, !!art) : { errors: [], warnings: [] };
  const save = () => guard(async () => {
    if (!repo || !draft || result.errors.length) return;
    const next = { ...draft, deckLimitKey: draft.deckLimitKey || draft.id, revision: draft.isNew ? 1 : draft.revision };
    const { data, de } = serialize(next);
    await fs.writeCard(repo, draft.isNew ? draft.id : draft.folder, { data: toJson(data) + '\n', de: de ? toJson(de) + '\n' : null, png: artChanged && art ? await fs.toPng(art) : undefined });
    await load(repo);
    setDraft({ ...next, isNew: false, folder: draft.isNew ? draft.id : draft.folder });
    setArtChanged(false);
    setStatus('Saved. The game picks it up when the dev server re-imports the cards.');
  });

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
      <input placeholder="Search cards…" aria-label="Search cards" value={query} onChange={event => setQuery(event.target.value)}/>
      <button onClick={() => updatePreferences({ language: language === 'en' ? 'de' : 'en' })}>{language === 'en' ? 'English' : 'Deutsch'}</button>
      <button onClick={() => { void fs.forgetRepo(); setRepo(null); setDraft(null); setSandbox(false); }}>Change folder</button>
    </header>
    <div className="studio-body">
      <nav className="studio-list" aria-label="Cards">
        <button className="primary" onClick={create}>New card</button>
        {visible.map(card => <button key={card.folder} className={draft && !draft.isNew && draft.folder === card.folder ? 'on' : ''} onClick={() => edit(card)}>
          <Thumb art={card.art}/><span className="name">{card.data.name}</span><i className="dot" style={{ background: factionInfo[card.data.factions?.find((id: string) => id !== 'neutral') ?? 'neutral']?.color }}/><small>{card.art ? card.data.type : 'no art'}</small></button>)}
        {!visible.length && <p className="studio-hint">{cards.length ? 'No card matches.' : 'This folder has no cards yet.'}</p>}
      </nav>
      {draft ? <>
        <main className="studio-edit"><CardForm draft={draft} patch={patch} hasArt={!!art} folderLocked={false}
          onArt={file => { setArt(file); setArtChanged(true); setStatus(''); }}/></main>
        <aside className="studio-side">
          <Preview draft={draft} art={art}/>
          <ul className="studio-issues">{result.errors.map(message => <li key={message} className="error">{message}</li>)}{result.warnings.map(message => <li key={message}>{message}</li>)}</ul>
          <div className="studio-actions"><button className="primary" disabled={!!result.errors.length} onClick={save}>Save card</button>
            {!draft.isNew && <button onClick={duplicate}>Duplicate</button>}</div>
          {status && <p role="status" className="studio-status">{status}</p>}
          {problem && <p role="alert" className="studio-problem">{problem}</p>}
        </aside></>
      : <main className="studio-empty"><p>Pick a card to edit, or start a new one.</p></main>}
    </div>
  </div>;
}
