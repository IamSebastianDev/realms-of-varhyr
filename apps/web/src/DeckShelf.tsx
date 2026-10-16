import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BookOpen, Check, Copy, Pencil, Plus, Star, TextCursorInput, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { localizedCard, t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { avatarDefinitions, factionInfo, registry } from '../../../packages/content/src';
import { validateDeck } from '../../../packages/core/src';
import { FactionIcon } from '../../../packages/renderer/src/FactionIcon';
import { missingDeckCopies, type OwnedCopies } from './collection';
import { readFavoriteDecks, starterOptions, writeFavoriteDecks, type CustomDeck } from './decks';
import { summarizeDeck } from './deckTools';
import './deck-shelf.css';

type Props = { decks: CustomDeck[]; draft: CustomDeck; ownedCopies: OwnedCopies; open: (id: string | null) => void; create: () => void; importDeck: () => void; openCollection: () => void; rename: (id: string, name: string) => string | null; remove: (id: string) => string | null };
type Entry = { id: string; deck: CustomDeck; unsaved: boolean; starter: boolean; missing: number };
const sameCards = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const missingLabel = (n: number) => n === 1 ? msg("1 card missing") : msg("{v0} cards missing", { v0: n });

/** The factions a deck leans on, strongest first. Neutral cards add nothing. */
function leanings(cards: string[]): string[] {
  const weight = new Map<string, number>();
  for (const id of cards) for (const faction of registry.cards[id]?.factions ?? []) weight.set(faction, (weight.get(faction) ?? 0) + 1);
  return [...weight].sort((a, b) => b[1] - a[1]).map(([faction]) => faction);
}

const rarityRank = { legendary: 3, rare: 2, common: 1 } as const;
/** The three rarest different cards in a deck; ties go to the dearer card. */
export function rarest(cards: string[]) {
  const total = (id: string) => { const cost = registry.cards[id]?.cost; return cost ? cost.generic + Object.values(cost.factions).reduce((sum, amount) => sum + (amount ?? 0), 0) : 0; };
  return [...new Set(cards)].filter(id => registry.cards[id]).sort((a, b) => rarityRank[registry.cards[b].rarity] - rarityRank[registry.cards[a].rarity] || total(b) - total(a) || registry.cards[a].name.localeCompare(registry.cards[b].name)).slice(0, 3).map(id => registry.cards[id]);
}

function look(deck: CustomDeck) {
  const [main] = leanings(deck.cards);
  return { main: main ?? 'neutral', colour: factionInfo[main]?.color ?? '#b9a574', hero: avatarDefinitions.find(avatar => avatar.faction === main) };
}

/** Entry to the deck builder: a list of deck banners and a preview of the chosen deck. */
export function DeckShelf({ decks, draft, ownedCopies, open, create, importDeck, openCollection, rename, remove }: Props) {
  useLanguage();
  const [favorites, setFavorites] = useState(readFavoriteDecks);
  const toggleFavorite = (id: string) => setFavorites(list => { const next = list.includes(id) ? list.filter(item => item !== id) : [...list, id]; writeFavoriteDecks(next); return next; });
  const entries: Entry[] = useMemo(() => {
    const missingOf = (deck: CustomDeck) => missingDeckCopies(deck.cards, ownedCopies).reduce((sum, card) => sum + card.missing, 0);
    const mine = [
      ...(draft.cards.length > 0 && !decks.some(deck => deck.id === draft.id) ? [{ id: draft.id, deck: draft, unsaved: true, starter: false, missing: missingOf(draft) }] : []),
      ...decks.map(deck => ({ id: deck.id, deck, unsaved: false, starter: false, missing: missingOf(deck) })),
    ];
    const rank = (entry: Entry) => favorites.includes(entry.id) ? 0 : 1;
    const sorted = [...mine].sort((a, b) => rank(a) - rank(b));
    // A starter the player already owns as a saved deck is not offered twice.
    const starters = starterOptions
      .filter(starter => !decks.some(deck => deck.name === msg(starter.name) || deck.name === starter.name || sameCards(deck.cards, starter.cards)))
      .map(starter => { const deck = { id: starter.id, name: msg(starter.name), cards: starter.cards }; return { id: starter.id, deck, unsaved: false, starter: true, missing: missingOf(deck) }; });
    return [...sorted, ...starters];
  }, [decks, draft, favorites, ownedCopies]);
  const [chosen, setChosen] = useState<string | null>(entries[0]?.id ?? null);
  useEffect(() => { if (!entries.some(entry => entry.id === chosen)) setChosen(entries[0]?.id ?? null); }, [entries, chosen]);
  const current = entries.find(entry => entry.id === chosen);
  const [renaming, setRenaming] = useState<string | null>(null), [confirming, setConfirming] = useState(false), [problem, setProblem] = useState('');
  useEffect(() => { setRenaming(null); setConfirming(false); setProblem(''); }, [chosen]);
  const commitRename = () => {
    const name = (renaming ?? '').trim();
    if (!current || !name) { setRenaming(null); return; }
    const error = rename(current.id, name.slice(0, 60)); setProblem(error ?? ''); if (!error) setRenaming(null);
  };
  const go = (entry: Entry) => open(entry.unsaved ? null : entry.id);
  const info = current && (() => {
    const { deck, missing } = current;
    const ready = !validateDeck(deck.cards, registry).length && !missing;
    return { ...look(deck), ready, summary: summarizeDeck(deck.cards, registry), showcase: rarest(deck.cards) };
  })();
  const curveMax = Math.max(1, ...(info?.summary.curve ?? [1]));
  return <main className="collection-page deck-shelf" aria-label={msg("Your decks")}>
    <div className="deck-shelf-body">
      <section className="deck-list" aria-label={msg("Your decks")}>
        <button className="deck-strip deck-strip-new" onClick={create}><span className="deck-sigil"><Plus size={20}/></span><strong>{msg("New deck")}</strong></button>
        {entries.map(entry => {
          const { colour, main, hero } = look(entry.deck), selected = entry.id === chosen, favorite = favorites.includes(entry.id);
          return <div key={entry.id} className="deck-row">
            <button className={`deck-strip ${selected ? 'selected' : ''} ${entry.starter && entry.missing ? 'locked' : ''}`} aria-pressed={selected}
              style={{ '--box': colour, '--art': hero ? `url("${hero.art}")` : 'none' } as CSSProperties}
              onClick={() => setChosen(entry.id)} onDoubleClick={() => go(entry)} onKeyDown={event => { if (event.key === 'Enter' && selected) { event.preventDefault(); go(entry); } }}>
              <span className="deck-sigil"><FactionIcon faction={main}/></span>
              <span className="deck-strip-text"><strong>{entry.deck.name.trim() || msg("Untitled deck")}</strong>
                {entry.missing > 0 ? <small className="deck-strip-missing">{missingLabel(entry.missing)}</small> : <small>{entry.starter ? msg("Starter deck") : hero ? msg(hero.name) : ''}</small>}</span>
            </button>
            {!entry.starter && !entry.unsaved && <button className={`deck-star ${favorite ? 'on' : ''}`} aria-pressed={favorite} aria-label={favorite ? msg("Remove from favorites") : msg("Add to favorites")} title={favorite ? msg("Remove from favorites") : msg("Add to favorites")} onClick={() => toggleFavorite(entry.id)}><Star size={17}/></button>}
          </div>;
        })}
        <div className="deck-list-foot">
          <button className="outline-button" onClick={openCollection}><BookOpen size={15}/>{msg("Collection")}</button>
          <button className="outline-button" onClick={importDeck}><Upload size={15}/>{msg("Import deck")}</button>
        </div>
      </section>
      {current && info && <section className="deck-preview" style={{ '--box': info.colour } as CSSProperties} aria-label={msg("Selected deck")}>
        <div className="deck-preview-art" aria-hidden="true">{info.showcase.map(card => <img key={card.id} src={card.art} alt="" draggable={false}/>)}</div>
        <div className="deck-preview-info">
          <div className="deck-preview-head">
            {renaming === null ? <h2>{current.deck.name.trim() || msg("Untitled deck")}</h2>
              : <input className="deck-rename" autoFocus aria-label={msg("Deck name")} maxLength={60} value={renaming} onChange={event => setRenaming(event.target.value)} onBlur={commitRename} onKeyDown={event => { if (event.key === 'Enter') commitRename(); else if (event.key === 'Escape') setRenaming(null); }}/>}
            <p className="deck-preview-faction"><FactionIcon faction={info.main}/>{msg(factionInfo[info.main]?.name ?? info.main)}</p>
            <p className={`deck-preview-state ${info.ready ? 'ok' : 'warn'}`}>{info.ready ? <Check size={16}/> : <TriangleAlert size={16}/>}{current.unsaved ? msg("Unsaved draft") : current.missing > 0 ? missingLabel(current.missing) : current.starter ? msg("Starter deck") : info.ready ? msg("Ready to play") : msg("Needs attention")}<span>{current.deck.cards.length} {msg("cards")}</span></p>
          </div>
          <div className="deck-preview-bottom">
          <div className="deck-preview-curve" aria-hidden="true">{info.summary.curve.map((count, cost) => <div key={cost}><i style={{ height: `${Math.max(3, count / curveMax * 100)}%` }}/><small>{cost === 6 ? '6+' : cost}</small></div>)}</div>
          {problem && <p className="deck-problem" role="alert">{msg(problem)}</p>}
          <div className="deck-preview-actions">
            {confirming ? <>
              <span className="deck-confirm">{msg("Delete this deck?")}</span>
              <button className="outline-button danger" onClick={() => { const error = remove(current.id); setConfirming(false); setProblem(error ?? ''); }}><Trash2 size={15}/>{msg("Delete")}</button>
              <button className="outline-button" onClick={() => setConfirming(false)}>{msg("Cancel")}</button>
            </> : <>
              <button className="gold-button" onClick={() => go(current)}>{current.starter ? <Copy size={15}/> : <Pencil size={15}/>}{current.starter ? msg("Copy & edit") : msg("Edit deck")}</button>
              {!current.unsaved && !current.starter && <button className="outline-button" aria-pressed={favorites.includes(current.id)} onClick={() => toggleFavorite(current.id)}><Star size={15} fill={favorites.includes(current.id) ? 'currentColor' : 'none'}/>{favorites.includes(current.id) ? msg("Favorite") : msg("Add to favorites")}</button>}
              {!current.unsaved && !current.starter && <button className="outline-button" onClick={() => setRenaming(current.deck.name)}><TextCursorInput size={15}/>{msg("Rename")}</button>}
              {!current.unsaved && !current.starter && <button className="outline-button" onClick={() => setConfirming(true)}><Trash2 size={15}/>{msg("Delete")}</button>}
            </>}
          </div>
          </div>
        </div>
      </section>}
    </div>
  </main>;
}
