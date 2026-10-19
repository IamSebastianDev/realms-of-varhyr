import type { ReactNode } from 'react';
import { ChevronRight, CircleHelp, Download, Maximize, Minimize, ScrollText, Settings2, X } from 'lucide-react';
import { t as msg } from '../../../../packages/ui/src/i18n';
import { updatePreferences } from '../../../../packages/ui/src/preferences';
import { ArtCard } from '../../../../packages/ui/src/CardPresentation';
import { registry } from '../../../../packages/content/src';
import { other } from '../../../../packages/core/src';
import type { PlayerId, PlayerView } from '../../../../packages/contracts/src';
import { PreferenceControls, VersionLine } from '../SettingsPage';
import type { MatchSession } from './MatchSession';
import type { useFullscreen } from '../useFullscreen';
import { playerName } from './matchText';

export type SidePanelId = 'rules' | 'settings' | 'journal' | 'debug' | 'discard';
export type MatchPanel = SidePanelId | 'menu';

/** The pause menu of a match: connection, fullscreen, settings, rules, leaving and conceding. */
export function MatchMenuDialog({ match, online, local, watching, tutorial, finished, connection, fullscreen, logOpen, skipEmptyWindows, confirmConcede, setConfirmConcede, concede, setPanel, setLogOpen, goSettings, goMenu }: {
  match: MatchSession; online: boolean; local: boolean; watching: boolean; tutorial: boolean; finished: boolean;
  connection?: { message?: string; role?: string; connected?: boolean } | null; fullscreen: ReturnType<typeof useFullscreen>;
  logOpen: boolean; skipEmptyWindows: boolean; confirmConcede: boolean; setConfirmConcede: (value: boolean) => void; concede: () => void;
  setPanel: (panel: MatchPanel | null) => void; setLogOpen: (update: (open: boolean) => boolean) => void; goSettings: () => void; goMenu: () => void;
}) {
  const state = { outcome: finished };
  return <div className="modal-backdrop" onClick={()=>setPanel(null)}><section className="choice-dialog match-menu-dialog" role="dialog" aria-modal="true" aria-label={msg("Menu")} onClick={e=>e.stopPropagation()}><h2>{msg("Menu")}</h2><div className="match-menu">{online&&<><p>{msg(connection?.message??'')}</p>{(connection?.role==='guest'||!connection?.connected)&&<button className="outline-button full" onClick={()=>match.kind==='live'&&match.reconnect()}>{msg("Reconnect")}</button>}</>}{fullscreen.supported?<button className="outline-button full" onClick={()=>void fullscreen.toggle()}>{fullscreen.active?<Minimize size={15}/>:<Maximize size={15}/>}{fullscreen.active?msg("Exit fullscreen"):msg("Fullscreen")}</button>:!fullscreen.installed&&<p className="match-menu-hint">{msg("For fullscreen, add this page to your home screen: Share, then Add to Home Screen.")}</p>}<button className="outline-button full" onClick={()=>!local?setPanel('settings'):goSettings()}><Settings2 size={15}/>{msg("Settings")}</button><button className="outline-button full" onClick={()=>setPanel('rules')}><CircleHelp size={15}/>{msg("How to play")}</button><button className="outline-button full" onClick={()=>setPanel('journal')}><ScrollText size={15}/>{msg("Battle journal")}</button><button className="outline-button full" aria-pressed={logOpen} onClick={()=>{setLogOpen(open=>!open);setPanel(null);}}><ScrollText size={15}/>{logOpen?msg("Hide battle log"):msg("Show battle log")}</button><div className="match-skip"><span>{msg("Skip empty response steps")}</span><button className={`toggle ${skipEmptyWindows?'on':''}`} role="switch" aria-checked={skipEmptyWindows} aria-label={msg("Skip empty response steps")} onClick={()=>updatePreferences({skipEmptyWindows:!skipEmptyWindows})}><span/></button></div><button className="outline-button full" onClick={()=>{setPanel(null);goMenu();}}>{watching?msg("Close replay"):!local?msg("Leave online game"):msg("Main menu")}</button>{!watching&&!tutorial&&!finished&&(confirmConcede?<div className="concede-confirm" role="alertdialog" aria-label={msg("Concede")}><p>{msg("Give up this match? Your opponent wins.")}</p><div><button className="outline-button danger" onClick={concede}>{msg("Concede")}</button><button className="outline-button" onClick={()=>setConfirmConcede(false)}>{msg("Keep playing")}</button></div></div>:<button className="outline-button full danger" onClick={()=>setConfirmConcede(true)}>{msg("Concede")}</button>)}</div></section></div>;
}

export function RulesContent() {
  return <div className="rules-content">{[
        ['01',msg("Draw & choose"),msg("Begin with five cards. Each turn, draw two and keep one; the other goes to your discard pile or under your library, as you choose. The first player skips their first draw.")],
        ['02',msg("Build your economy"),msg("Play zero-cost creatures first. Most enter exhausted. On later turns, exhaust a ready creature to generate its printed energy. Match faction symbols to colored costs; any energy pays generic costs.")],
        ['03',msg("Commit your assault"),msg("Enter combat, select any ready creatures, and attack as a batch. A creature cannot channel and attack in the same readiness cycle. Attackers choose a lane in the next step; unblocked attacks damage the opponent.")],
        ['04',msg("Choose a lane"),msg("Each attacker targets its own lane or an adjacent one, and no two attackers may target the same lane. The creature or holding in that lane blocks automatically, even when exhausted. A Guard next to the targeted lane steps in and blocks instead, even if the lane is empty. An empty lane lets the attack hit the player. Attacker and blocker deal their full Attack simultaneously; excess never hits the player.")],
        ['05',msg("A final bargain"),msg("Whenever a creature with an energy output dies, on any turn and from any cause, its owner gets that energy for response spells. After combat the attacker's window opens first, then the defender's. Choose one output for dual producers. Creatures that die inside a window add to their owner's pool.")],
        ['06',msg("Ready & pass"),msg("At the end of your turn, your surviving field cards ready. Damage clears from all field cards and all energy expires. Drawing the last card in your library immediately loses the game. Discards do not recycle.")]
      ].map(([n,title,copy])=><article key={n}><span>{n}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}<div className="note-box">{msg("Left Flank · Left Wing · Center · Right Wing · Right Flank. Choose a position when deploying. Cards cannot move while on the battlefield. Adjacent means one slot away in the same row; empty slots do not close the gap. Position affects an ability only when its text says so.")}</div><div className="note-box">{msg("Holdings occupy a field slot and deal their printed damage when blocking. They cannot attack or produce energy, including on death. Continuous effects stay active while on the field; activated abilities exhaust a ready field card during its controller’s play phase.")}</div><div className="note-box">{msg("Consume is an ability on specific cards. It sacrifices a friendly creature as a play cost, freeing its slot. There is no free sacrifice action.")}</div></div>;
}

/** Both players' discard piles. */
export function DiscardPanel({ view, viewer }: { view: PlayerView; viewer: PlayerId }) {
  return <div className="discard-content">{[viewer,other(viewer)].map(owner=><section key={owner}><h3>{playerName(view.players[owner].name)} <small>{view.players[owner].discard.length} {msg(view.players[owner].discard.length===1?'card':'cards')}</small></h3>{view.players[owner].discard.length?<div className="codex-grid">{[...view.players[owner].discard].reverse().map(id=><article key={id}><ArtCard reduced card={registry.cards[view.cards[id].definitionId]}/></article>)}</div>:<p className="empty-pile">{msg("Nothing here yet.")}</p>}</section>)}</div>;
}

/** The match so far in words: piles and every event. */
export function JournalPanel({ view }: { view: PlayerView }) {
  return <div className="journal-content"><div className="discard-summary">{(['p1','p2'] as PlayerId[]).map(p=><div key={p}><h3>{playerName(view.players[p].name)}</h3><p className="journal-counts">{view.players[p].handCount} {msg("in hand ·")}{' '}{view.players[p].deckCount} {msg("in deck")}</p><span className="eyebrow">{msg("DISCARD ·")}{' '}{view.players[p].discard.length}</span>{view.players[p].discard.map(id=><p key={id}>{msg(registry.cards[view.cards[id].definitionId].name)}</p>)}</div>)}</div><h3>{msg("Match events")}</h3><ol className="event-list">{[...view.events].reverse().map(e=><li key={e.seq}><span>{String(e.seq).padStart(3,'0')}</span><p>{msg(e.message)}</p></li>)}</ol></div>;
}

/** The match laboratory: step through the match, export a replay, inspect the player projection. */
export function DebugPanel({ view, initial, historyLength, historyIndex, historySteps, local, setHistoryIndex, setSelected, exportReplay }: {
  view: PlayerView; initial: { seed: number | string }; historyLength: number; historyIndex: number | null; historySteps: { who: string; label: string }[]; local: boolean;
  setHistoryIndex: (index: number | null) => void; setSelected: (id: string | null) => void; exportReplay: () => void;
}) {
  return <div className="debug-content"><div className="debug-metrics"><span>{msg("Revision")}<b>{view.revision}</b></span><span>{msg("Steps")}<b>{historyLength}</b></span><span>{msg("Seed")}<b>{initial.seed}</b></span></div><label>{msg("TIME TRAVEL")}<input type="range" min={0} max={historyLength} value={historyIndex??historyLength} onChange={e=>{setHistoryIndex(Number(e.target.value));setSelected(null);}}/></label><div className="debug-actions"><button className="outline-button" onClick={()=>setHistoryIndex(null)}>{msg("Return to live")}</button>{local&&<button className="outline-button" onClick={exportReplay}>{msg("Export replay")}<Download size={14}/></button>}</div><details><summary>{msg("Player projection")}</summary><pre>{JSON.stringify(view,null,2)}</pre></details><h3>{!local?msg("What happened"):msg("Accepted commands")}</h3><ol className="command-list">{historySteps.map((e,i)=><li key={i}><button onClick={()=>setHistoryIndex(i+1)}><span>{i+1}</span><b>{e.who}</b>{msg(e.label)}<ChevronRight size={13}/></button></li>)}</ol></div>;
}

const titles: Record<SidePanelId, () => string> = { rules: () => msg("Rules"), settings: () => msg("Settings"), journal: () => msg("Battle journal"), discard: () => msg("Discard piles"), debug: () => msg("Match laboratory") };

/** The slide-in panel frame: a title, a close button and whichever content the match menu opened. */
export function SidePanel({ panel, close, children }: { panel: SidePanelId; close: () => void; children: ReactNode }) {
  const title = titles[panel]();
  return <div className="panel-backdrop" onClick={close}><section className="side-panel " onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}><div className="panel-header"><div><h2>{title}</h2></div><button aria-label={msg("Close panel")} onClick={close}><X size={20}/></button></div>
    {children}
  </section></div>;
}
