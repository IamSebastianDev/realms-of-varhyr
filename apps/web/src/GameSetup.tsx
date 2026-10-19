import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { Check, ChevronDown, Cpu, Globe, Swords, Users, X } from 'lucide-react';
import { BurnEmbers } from './BurnEmbers';
import { useEffect, useRef, useState } from 'react';
import { BuilderDialog } from './BuilderDialog';
import { CardBackFace } from './CardBackFace';
import { useCardBack } from './cardBackStore';
import { registry } from '../../../packages/content/src';
import { deckRules } from '../../../packages/contracts/src';
import { validateDeck } from '../../../packages/core/src';
import { missingDeckCopies } from './collection';
import { rarest } from './DeckShelf';
import './game-setup.css';
import { QuestPicker } from './quest/QuestPicker';
import { DraftBlade } from './draft/DraftBlade';
import { MultiplayerLobby } from './multiplayer/MultiplayerLobby';
import type { MatchSession } from './match/MatchSession';

export type SetupMode = 'practice' | 'hotseat' | 'online' | 'quest' | 'draft';
type Props = {
  mode: SetupMode; setMode: (mode: SetupMode) => void; close: () => void;
  options: { id: string; name: string; cards: string[]; back?: string }[];
  selected: string; setSelected: (id: string) => void;
  ownedCopies: Record<string, number>; opponentId: string; setOpponentId: (id: string) => void;
  start: (skirmish: boolean) => void; startQuest: () => void; openDraft: (preset: string) => void; startSession: (session: MatchSession) => void;
};

/** One deck as a tile: art, name, state and sleeve. Used for the chosen deck and in the deck dialog. */
function DeckTile({ deck, ownedCopies, selected, onPick, disabledWhenUnready = false }: { deck: Props['options'][number]; ownedCopies: Record<string, number>; selected: boolean; onPick: () => void; disabledWhenUnready?: boolean }) {
  const unfinished = validateDeck(deck.cards, registry).length, lacking = missingDeckCopies(deck.cards, ownedCopies).length, art = rarest(deck.cards)[0], back = useCardBack(deck.back);
  return <button role="radio" aria-checked={selected} disabled={disabledWhenUnready && !!(unfinished || lacking) && !selected} className={`setup-deck ${unfinished || lacking ? 'warn' : ''}`} onClick={onPick}>
    <span className="setup-deck-art" style={art ? { backgroundImage: `url(/cards/${art.id}/data.png)` } : undefined}/>
    <span className="setup-deck-text"><b>{msg(deck.name)}</b><small>{deck.cards.length} {msg("cards")}{unfinished ? ` · ${msg("unfinished")}` : lacking ? ` · ${msg("missing copies")}` : ` · ${msg("Ready to play")}`}</small></span>
    <CardBackFace id={back} className="setup-deck-sleeve"/>
    {selected && <Check size={18}/>}
  </button>;
}

export function GameSetup(props: Props) {
  useLanguage();
  const [picking, setPicking] = useState(false), changeButton = useRef<HTMLButtonElement>(null);
  const pane = useRef<HTMLElement>(null);
  const chosen = props.options.find(deck => deck.id === props.selected);
  const missing = chosen ? missingDeckCopies(chosen.cards, props.ownedCopies) : [];
  const issues = chosen ? validateDeck(chosen.cards, registry) : [msg("Choose a deck.")];
  const playable = !!chosen && !issues.length && !missing.length;
  const playing = props.mode !== 'quest' && props.mode !== 'draft';
  const title = props.mode === 'quest' ? msg("Quest") : props.mode === 'draft' ? msg("Faction draft") : msg("Play a match");
  useEffect(() => {
    pane.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);
  // Opening the pane on a deck that cannot be played moves to the first one that can.
  useEffect(() => {
    if (playable) return;
    const ready = props.options.find(deck => !validateDeck(deck.cards, registry).length && !missingDeckCopies(deck.cards, props.ownedCopies).length);
    if (ready) props.setSelected(ready.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <header className="setup-heading"><h2 id="game-setup-title">{title}</h2><button className="setup-close" aria-label={msg("Close game setup")} onClick={props.close}><X size={20}/></button></header>
      <div className="setup-scroll">
        {playing && <div className="setup-modes setup-opponents" role="group" aria-label={msg("Opponent")}>
          <button aria-pressed={props.mode === 'practice'} onClick={() => props.setMode('practice')}><Cpu size={26}/><b>{msg("Computer")}</b><small>{msg("Play against the computer")}</small></button>
          <button aria-pressed={props.mode === 'online'} onClick={() => props.setMode('online')}><Globe size={26}/><b>{msg("Friend online")}</b><small>{msg("Share a room code")}</small></button>
          <button aria-pressed={props.mode === 'hotseat'} onClick={() => props.setMode('hotseat')}><Users size={26}/><b>{msg("Same device")}</b><small>{msg("Take turns on one screen")}</small></button>
        </div>}
        {props.mode === 'quest' ? <QuestPicker onStarted={props.startQuest}/> : props.mode === 'draft' ? <DraftBlade open={props.openDraft}/> : props.mode === 'online' ? <MultiplayerLobby compact decks={props.options} selected={props.selected} onSelectDeck={props.setSelected} onStart={props.startSession}/> : <div className="local-game-setup">
          <h3 className="setup-label" id="setup-decks">{msg("Your deck")}</h3>
          {chosen ? <div className="setup-chosen" aria-labelledby="setup-decks">
            <DeckTile deck={chosen} ownedCopies={props.ownedCopies} selected={false} onPick={() => setPicking(true)}/>
            <button ref={changeButton} className="setup-change" onClick={() => setPicking(true)}>{msg("Change deck")}<ChevronDown size={14}/></button>
          </div> : <button ref={changeButton} className="setup-change" onClick={() => setPicking(true)}>{msg("Choose a deck")}</button>}
          {picking && <BuilderDialog title={msg("Choose a deck")} origin={changeButton.current} close={() => setPicking(false)}>
            <div className="setup-deck-grid" role="radiogroup" aria-label={msg("Your deck")}>{[...props.options].sort((a, b) => Number(!!(validateDeck(a.cards, registry).length || missingDeckCopies(a.cards, props.ownedCopies).length)) - Number(!!(validateDeck(b.cards, registry).length || missingDeckCopies(b.cards, props.ownedCopies).length))).map(deck =>
              <DeckTile key={deck.id} deck={deck} ownedCopies={props.ownedCopies} selected={deck.id === props.selected} disabledWhenUnready onPick={() => { props.setSelected(deck.id); setPicking(false); }}/>)}</div>
          </BuilderDialog>}
          {!playable && <p className="deck-warning" role="status">{missing.length ? msg("You need {v0} more owned copies. Open boosters or edit this deck.", {v0: missing.reduce((sum, card) => sum + card.missing, 0)}) : chosen && chosen.cards.length < deckRules.minimumCards ? msg("Add at least {v0} cards to play.", {v0: deckRules.minimumCards}) : issues[0]}</p>}
          <button className="gold-button start-play setup-start" disabled={!playable} onClick={() => props.start(false)}><BurnEmbers/><span>{msg("Start game")}</span><Swords size={23}/></button>
        </div>}
      </div>
    </section>
  </div>;
}
