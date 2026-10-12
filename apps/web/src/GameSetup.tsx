import { ArrowRight, ChevronDown, Swords, Users, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { registry } from '../../../packages/content/src';
import { deckRules } from '../../../packages/contracts/src';
import { validateDeck } from '../../../packages/core/src';
import { missingDeckCopies } from './collection';
import { MultiplayerLobby } from './multiplayer/MultiplayerLobby';
import type { RtcRoom } from './multiplayer/RtcRoom';

export type SetupMode = 'practice' | 'hotseat' | 'online';
type Props = {
  mode: SetupMode; setMode: (mode: SetupMode) => void; close: () => void;
  options: { id: string; name: string; cards: string[] }[];
  selected: string; setSelected: (id: string) => void;
  ownedCopies: Record<string, number>; opponentId: string; setOpponentId: (id: string) => void;
  seed: string; setSeed: (seed: string) => void;
  start: (skirmish: boolean) => void; startOnline: (room: RtcRoom) => void;
};

export function GameSetup(props: Props) {
  const pane = useRef<HTMLElement>(null);
  const chosen = props.options.find(deck => deck.id === props.selected);
  const missing = chosen ? missingDeckCopies(chosen.cards, props.ownedCopies) : [];
  const issues = chosen ? validateDeck(chosen.cards, registry) : ['Choose a deck.'];
  const playable = !!chosen && !issues.length && !missing.length;
  const friend = props.mode !== 'practice';
  useEffect(() => {
    pane.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.stopPropagation(); props.close(); }
    if (event.key !== 'Tab') return;
    const elements = Array.from(pane.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? [])
      .filter(element => element.getClientRects().length > 0);
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className="setup-backdrop" onClick={props.close}>
    <section ref={pane} className="game-setup-pane" role="dialog" aria-modal="true" aria-labelledby="game-setup-title" onClick={event => event.stopPropagation()} onKeyDown={onKeyDown}>
      <header className="setup-heading"><h2 id="game-setup-title">Play</h2><button className="setup-close" aria-label="Close game setup" onClick={props.close}><X size={20}/></button></header>
      <div className="setup-scroll">
        <div className="setup-modes" aria-label="Game mode"><button aria-pressed={!friend} onClick={() => props.setMode('practice')}><Swords size={16}/>Practice</button><button aria-pressed={friend} onClick={() => props.setMode('online')}><Users size={16}/>Play a friend</button></div>
        {friend && <div className="setup-friend-modes" aria-label="Friend connection"><button aria-pressed={props.mode === 'online'} onClick={() => props.setMode('online')}>Online room</button><button aria-pressed={props.mode === 'hotseat'} onClick={() => props.setMode('hotseat')}>Same device</button></div>}
        {props.mode === 'online' ? <MultiplayerLobby compact decks={props.options} selected={props.selected} onSelectDeck={props.setSelected} onStart={props.startOnline}/> : <div className="local-game-setup">
          <label>Your deck<select value={props.selected} onChange={event => props.setSelected(event.target.value)}>{props.options.map(deck => <option key={deck.id} value={deck.id}>{deck.name}{validateDeck(deck.cards, registry).length ? ' · unfinished' : missingDeckCopies(deck.cards, props.ownedCopies).length ? ' · missing copies' : ''}</option>)}</select></label>
          <div className="setup-deck-summary"><span>{chosen?.cards.length ?? 0} cards</span></div>
          {!playable && <p className="deck-warning" role="status">{missing.length ? `You need ${missing.reduce((sum, card) => sum + card.missing, 0)} more owned copies. Open boosters or edit this deck.` : chosen && chosen.cards.length < deckRules.minimumCards ? `Add at least ${deckRules.minimumCards} cards to play.` : issues[0]}</p>}
          <details className="setup-advanced"><summary>Advanced<ChevronDown size={14}/></summary><div>
            <label>{friend ? 'Second player’s deck' : 'Opponent deck'}<select value={props.opponentId} onChange={event => props.setOpponentId(event.target.value)}><option value="auto">Automatic</option>{props.options.map(deck => <option key={deck.id} value={deck.id} disabled={!!validateDeck(deck.cards, registry).length}>{deck.name}</option>)}</select></label>
            <label>Match seed<input type="number" value={props.seed} onChange={event => props.setSeed(event.target.value)}/></label>
            <button className="setup-skirmish" disabled={!playable} onClick={() => props.start(true)}>Jump into a skirmish<ArrowRight size={14}/></button>
          </div></details>
          <button className="gold-button start-play setup-start" disabled={!playable} onClick={() => props.start(false)}><span>Start game</span><Swords size={23}/></button>
        </div>}
      </div>
    </section>
  </div>;
}
