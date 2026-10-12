import { useEffect, useState } from 'react';
import { defaultDeckId } from '../../../packages/content/src';
import { Lobby, type Screen } from './Lobby';
import { decksKey, parseDecks, starterOptions, type CustomDeck } from './decks';
import { startMatch, type SavedSession } from './session';

/** Browsing/editing content must work even when no legal match can be created. */
export function AuthoringLobby({ onStart }: { onStart: (session: SavedSession) => void }) {
  const [screen, setScreen] = useState<Exclude<Screen, 'match'>>('menu');
  const [decks, setDecks] = useState(() => {
    try { return parseDecks(localStorage.getItem(decksKey)); } catch { return []; }
  });
  const [selected, setSelected] = useState(defaultDeckId);
  const [mode, setMode] = useState<SavedSession['mode']>('practice');
  const [seed, setSeed] = useState('731');
  const [error, setError] = useState('');
  const options = [...starterOptions, ...decks];
  useEffect(() => { setError(''); }, [selected, screen]);

  function saveDeck(deck: CustomDeck): string | null {
    const next = [...decks.filter(saved => saved.id !== deck.id), structuredClone(deck)];
    try { localStorage.setItem(decksKey, JSON.stringify(next)); }
    catch { return 'Could not save. This browser’s storage is full or unavailable.'; }
    setDecks(next);
    setSelected(deck.id);
    return null;
  }

  function start(skirmish: boolean) {
    const customDeck = decks.find(deck => deck.id === selected);
    const deck = customDeck ? defaultDeckId : selected;
    try {
      const initial = startMatch(Number(seed) || 731, deck, skirmish, customDeck);
      onStart({ initial, commands: [], mode, deck, skirmish, customDeck, started: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This deck cannot start a match.'); }
  }

  return <>
    <Lobby reduced={window.matchMedia('(prefers-reduced-motion: reduce)').matches}
      screen={screen} navigate={next => { if (next !== 'match') setScreen(next); }}
      canResume={false} resumeLabel="" decks={decks} options={options} saveDeck={saveDeck}
      mode={mode} setMode={setMode} selected={selected} setSelected={setSelected}
      seed={seed} setSeed={setSeed} start={start}/>
    {error && <div className="toast" role="alert">{error}</div>}
  </>;
}
