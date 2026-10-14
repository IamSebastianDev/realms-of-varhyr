import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { ArrowRight, ChevronDown, Swords, Users, X } from 'lucide-react';
import { BurnEmbers } from './BurnEmbers';
import { useEffect, useRef } from 'react';
import { registry } from '../../../packages/content/src';
import { deckRules } from '../../../packages/contracts/src';
import { validateDeck } from '../../../packages/core/src';
import { missingDeckCopies } from './collection';
import { MultiplayerLobby } from './multiplayer/MultiplayerLobby';
import type { MatchSession } from './match/MatchSession';

export type SetupMode = 'practice' | 'hotseat' | 'online';
type Props = {
  mode: SetupMode; setMode: (mode: SetupMode) => void; close: () => void;
  options: { id: string; name: string; cards: string[] }[];
  selected: string; setSelected: (id: string) => void;
  ownedCopies: Record<string, number>; opponentId: string; setOpponentId: (id: string) => void;
  start: (skirmish: boolean) => void; startSession: (session: MatchSession) => void;
};

export function GameSetup(props: Props) {
  useLanguage();
  const pane = useRef<HTMLElement>(null);
  const chosen = props.options.find(deck => deck.id === props.selected);
  const missing = chosen ? missingDeckCopies(chosen.cards, props.ownedCopies) : [];
  const issues = chosen ? validateDeck(chosen.cards, registry) : [msg("Choose a deck.")];
  const playable = !!chosen && !issues.length && !missing.length;
  const friend = props.mode !== 'practice';
  useEffect(() => {
    pane.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === msg("Escape")) { event.stopPropagation(); props.close(); }
    if (event.key !== msg("Tab")) return;
    const elements = Array.from(pane.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? [])
      .filter(element => element.getClientRects().length > 0);
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className="setup-backdrop" onClick={props.close}>
    <section ref={pane} className="game-setup-pane" role="dialog" aria-modal="true" aria-labelledby="game-setup-title" onClick={event => event.stopPropagation()} onKeyDown={onKeyDown}>
      <header className="setup-heading"><h2 id="game-setup-title">{msg("Play")}</h2><button className="setup-close" aria-label={msg("Close game setup")} onClick={props.close}><X size={20}/></button></header>
      <div className="setup-scroll">
        <div className="setup-modes" aria-label={msg("Game mode")}><button aria-pressed={!friend} onClick={() => props.setMode('practice')}><Swords size={16}/>{msg("Practice")}</button><button aria-pressed={friend} onClick={() => props.setMode('online')}><Users size={16}/>{msg("Play a friend")}</button></div>
        {friend && <div className="setup-friend-modes" aria-label={msg("Friend connection")}><button aria-pressed={props.mode === 'online'} onClick={() => props.setMode('online')}>{msg("Online room")}</button><button aria-pressed={props.mode === 'hotseat'} onClick={() => props.setMode('hotseat')}>{msg("Same device")}</button></div>}
        {props.mode === 'online' ? <MultiplayerLobby compact decks={props.options} selected={props.selected} onSelectDeck={props.setSelected} onStart={props.startSession}/> : <div className="local-game-setup">
          <label>{msg("Your deck")}<select value={props.selected} onChange={event => props.setSelected(event.target.value)}>{props.options.map(deck => <option key={deck.id} value={deck.id}>{msg(deck.name)}{validateDeck(deck.cards, registry).length ? msg(" · unfinished") : missingDeckCopies(deck.cards, props.ownedCopies).length ? msg(" · missing copies") : ''}</option>)}</select></label>
          <div className="setup-deck-summary"><span>{chosen?.cards.length ?? 0} {msg("cards")}</span></div>
          {!playable && <p className="deck-warning" role="status">{missing.length ? msg("You need {v0} more owned copies. Open boosters or edit this deck.", {v0: missing.reduce((sum, card) => sum + card.missing, 0)}) : chosen && chosen.cards.length < deckRules.minimumCards ? msg("Add at least {v0} cards to play.", {v0: deckRules.minimumCards}) : issues[0]}</p>}
          <details className="setup-advanced"><summary>{msg("Advanced")}<ChevronDown size={14}/></summary><div>
            <label>{friend ? msg("Second player’s deck") : msg("Opponent deck")}<select value={props.opponentId} onChange={event => props.setOpponentId(event.target.value)}><option value="auto">{msg("Automatic")}</option>{props.options.map(deck => <option key={deck.id} value={deck.id} disabled={!!validateDeck(deck.cards, registry).length}>{msg(deck.name)}</option>)}</select></label>
            <button className="setup-skirmish" disabled={!playable} onClick={() => props.start(true)}>{msg("Jump into a skirmish")}<ArrowRight size={14}/></button>
          </div></details>
          <button className="gold-button start-play setup-start" disabled={!playable} onClick={() => props.start(false)}><BurnEmbers/><span>{msg("Start game")}</span><Swords size={23}/></button>
        </div>}
      </div>
    </section>
  </div>;
}
