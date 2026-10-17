import { useEffect, useState } from 'react';
import { Heart, Layers, LogOut, Map as MapIcon, Play, Skull, X } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { defaultDeckId } from '../../../../packages/content/src';
import {
  abandon, act as engineAct, expire, finishFight, leave as engineLeave, payout, questRules, skipOffer, takeCard, timeLeft, travel,
  type Action, type MapNode, type RunState,
} from '../../../../packages/quest/src';
import { updateCollection } from '../collectionStore';
import { CrownIcon } from '../Crowns';
import { Avatar } from '../Avatar';
import { useProfile } from '../profile';
import { CardBackFace } from '../CardBackFace';
import { useStandardBack } from '../cardBackStore';
import { getProfile } from '../profile';
import { startMatch, type MatchSetup } from '../session';
import type { CustomDeck } from '../decks';
import { MapView } from './MapView';
import { DeckList, DeckView, DraftPage, Hearts, LocationDialog, OfferView, roleInfo } from './Dialogs';
import { loadMap, markPaid, paidToday, questContent, readRun, saveRun, takeFightReport, useQuestRun, type LoadedMap } from './questStore';
import './quest.css';

type Props = { reduced: boolean; /** Back to the main menu; the run stays saved. */ leave: () => void; /** A match is open in the background and can be returned to. */ liveMatch: boolean; resume: () => void; beginFight: (setup: MatchSetup) => void };

const placeName = (map: LoadedMap, id: string) => { const node = map.nodes.find(entry => entry.id === id); return node?.name || (node?.site ? roleInfo[node.site].name : 'the stronghold'); };
const hoursLeft = (ms: number) => { const minutes = Math.ceil(ms / 60000); return minutes >= 60 ? msg("{v0} h {v1} min left", { v0: Math.floor(minutes / 60), v1: minutes % 60 }) : msg("{v0} min left", { v0: minutes }); };

/** The quest board, the draft, the map, and the end of the run: one screen that follows the saved run. */
export function QuestPage(props: Props) {
  useLanguage();
  const run = useQuestRun();
  const [map, setMap] = useState<LoadedMap | null | undefined>(undefined);
  useEffect(() => { void loadMap().then(setMap); }, []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);

  // Housekeeping when a run is loaded: apply a reported fight, forfeit a walked-away fight, and run out the 24 hours.
  useEffect(() => {
    if (!map) return;
    let current = readRun();
    if (!current || current.stage === 'over') return;
    const report = current.fight ? takeFightReport(current) : null;
    if (report && current.fight && report.node === current.fight.node) current = finishFight(current, questContent, map, { won: report.won, life: report.life });
    else if (current.fight && !props.liveMatch) current = { ...current, stage: 'over', result: 'dead', fight: null, encounter: null, offer: null, life: 0 };
    current = expire(current, now);
    if (current !== readRun()) saveRun(current);
  }, [map, now, props.liveMatch, run?.fight]);

  // A won quest pays out once per kind and day, and at most three times a day. The outcome is kept on the run.
  useEffect(() => {
    if (!run || run.stage !== 'over' || run.result !== 'won' || run.reward || readRun()?.reward) return;
    const pay = payout(run), paid = paidToday(run.day);
    if (!pay) return;
    if (paid.includes(run.pack) || paid.length >= questRules.dailyCap) { saveRun({ ...run, reward: 'claimed' }); return; }
    const packs = Object.values(pay.packs).reduce((sum, count) => sum + count, 0);
    markPaid(run.day, run.pack);
    updateCollection(current => ({ ...current, crowns: current.crowns + pay.crowns, packs: { ...current.packs, ...Object.fromEntries(Object.entries(pay.packs).map(([id, count]) => [id, (current.packs[id] ?? 0) + count])) } }));
    saveRun({ ...run, reward: { crowns: pay.crowns, packs } });
  }, [run?.stage, run?.result, run?.id, run?.reward]); // eslint-disable-line react-hooks/exhaustive-deps

  const [deck, setDeck] = useState(false), [confirmQuit, setConfirmQuit] = useState(false);
  const active = !!map && !!run && run.stage !== 'over';
  const body = map === undefined ? <main className="quest-page quest-message"><p>{msg("Loading the map…")}</p></main>
    : !map ? <main className="quest-page quest-message"><div><h1>{msg("Quests")}</h1><p>{msg("The quest map has not been made yet. Place the nodes in the card studio's Map tab, save, and restart the dev server.")}</p></div></main>
    : !run ? <Leave leave={props.leave}/>
    : run.stage === 'over' ? <RunOver run={run} map={map} reward={run.reward ?? null} reduced={props.reduced} leave={props.leave}/>
    : <RunScreen {...props} run={run} map={map} now={now} openDeck={() => setDeck(true)}/>;
  const objective = run && map ? (run.offer?.kind === 'pick' && run.offer.source === 'draft' ? msg("Draft your deck") : run.targetFound ? msg("{v0} is at {v1}", { v0: run.quest.bossName, v1: msg(placeName(map, run.quest.target)) }) : msg("{v0} is somewhere in the marked area", { v0: run.quest.bossName })) : '';
  const profile = useProfile(), sleeve = useStandardBack();
  const drafting = !!run && run.stage === 'draft' || run?.offer?.kind === 'pick' && run.offer.source === 'draft';
  const [menu, setMenu] = useState(false);
  const overlays = <>
    {deck && run && <DeckView run={run} reduced={props.reduced} close={() => setDeck(false)}/>}
    {menu && run && <div className="modal-backdrop" onClick={() => setMenu(false)}><section className="choice-dialog match-menu-dialog" role="dialog" aria-modal="true" aria-label={msg("Menu")} onClick={event => event.stopPropagation()}><h2>{msg("Menu")}</h2>
      <div className="match-menu">
        <button className="outline-button full" onClick={() => { setMenu(false); setDeck(true); }}><Layers size={15}/>{msg("Your deck")}</button>
        <button className="outline-button full" onClick={props.leave}><LogOut size={15}/>{msg("Main menu")}</button>
        <button className="outline-button full danger" onClick={() => { setMenu(false); setConfirmQuit(true); }}><X size={15}/>{msg("Give up this run")}</button>
      </div></section></div>}
    {confirmQuit && run && <div className="modal-backdrop" onClick={() => setConfirmQuit(false)}><section className="choice-dialog" role="alertdialog" aria-label={msg("Give up this run")} onClick={event => event.stopPropagation()}><h2>{msg("Give up this run?")}</h2><p>{msg("You pay again to set out. Nothing from the road comes with you.")}</p>
      <div className="quest-actions"><button className="outline-button danger" onClick={() => { setConfirmQuit(false); saveRun(abandon(run)); }}>{msg("Give up")}</button><button className="outline-button" onClick={() => setConfirmQuit(false)}>{msg("Keep going")}</button></div></section></div>}
  </>;

  // The map is the whole screen. The quest log sits top left, you bottom left, the menu top right.
  if (active && run && map && !drafting) {
    const rumors = Object.entries(run.bounties).map(([id, bounty]) => ({ id, bounty, done: run.visited.includes(id), name: map.nodes.find(node => node.id === id)?.name }));
    const reward = (bounty: RunState['bounties'][string]) => 'gold' in bounty ? msg("{v0} crowns", { v0: bounty.gold }) : 'card' in bounty ? questContent.cards[bounty.card]?.name ?? msg("a card") : msg("a card to pick");
    return <div className={`quest-app quest-map-mode ${props.reduced ? 'reduce-motion' : ''} ${run.offer && !run.fight ? 'has-offer' : ''}`}>
      <div className="quest-stage">{body}</div>
      <section className="quest-info quest-log" aria-label={msg("Quest log")}>
        <small>{msg("Quest log")}</small>
        <div className="quest-log-item"><strong>{msg("Defeat {v0}", { v0: run.quest.bossName })}</strong><span>{objective}</span><span className="quest-timer">{hoursLeft(timeLeft(run, now))}</span></div>
        {rumors.map(rumor => <div key={rumor.id} className={`quest-log-item ${rumor.done ? 'done' : ''}`}><strong>{msg("Rumor")}</strong><span>{rumor.name ? msg("A fight at {v0}", { v0: rumor.name }) : msg("A fight marked on the map")} · {reward(rumor.bounty)}</span></div>)}
      </section>
      <section className="quest-me" aria-label={msg("You")}><div className="quest-info quest-id">
        <div className="portrait"><div className="avatar has-art"><Avatar id={profile.avatar}/></div><div className="life-counter"><Heart size={11} aria-hidden="true"/><strong>{run.life}</strong><small>{msg("LIFE")}</small></div></div>
        <div className="player-name"><h2>{profile.name}</h2></div>
        
      </div>
        <div className="quest-info quest-pile">
          <button className="quest-deck" onClick={() => setDeck(true)} title={msg("Your deck")} aria-label={msg("Your deck")}><CardBackFace id={sleeve}/><strong>{run.deck.length}</strong></button>
          <span className="quest-crowns" title={msg("Crowns carried on this run")}><CrownIcon tilt/><b>{run.gold}</b></span>
        </div>
      </section>
      <button className="outline-button quest-menu-button" onClick={() => setMenu(true)}>{msg("Menu")}</button>
      {overlays}
    </div>;
  }

  return <div className={`app quest-app ${props.reduced ? 'reduce-motion' : ''}`}>
    <div className="world-bg"/><div className="world-vignette"/>
    <aside className="quest-side">
      <button className="brand" aria-label={msg("Back to the menu")} title={msg("Back to the menu. Your run is saved.")} onClick={props.leave}><span className="brand-mark">V<span/></span><span><small>REALMS OF</small><strong>VARHYR</strong></span></button>
      {run && map && <section className="quest-info"><strong>{msg("Defeat {v0}", { v0: run.quest.bossName })}</strong><span>{objective}</span>{run.stage !== 'over' && <span className="quest-timer">{hoursLeft(timeLeft(run, now))}</span>}</section>}
      {active && run && <section className="quest-info quest-vitals"><Hearts life={run.life}/><span className="quest-purse" title={msg("Crowns carried on this run")}><CrownIcon/><b>{run.gold}</b></span></section>}
      <div className="quest-actions-column">
        {active && run && <button className="outline-button" onClick={() => setDeck(true)}><Layers size={15}/>{msg("Deck")} · {run.deck.length}</button>}
        <button className="outline-button" onClick={props.leave} title={msg("Back to the menu. Your run is saved.")}><LogOut size={15}/>{msg("Menu")}</button>
        {active && run && <button className="outline-button danger" onClick={() => setConfirmQuit(true)}><X size={15}/>{msg("Give up")}</button>}
      </div>
    </aside>
    <div className="quest-stage">
      {body}
    </div>
    {overlays}
  </div>;
}

/** There is no quest overview page: with no run, the quest screen has nothing to show and returns to the menu. */
function Leave({ leave }: { leave: () => void }) { useEffect(() => { leave(); }, []); return null; } // eslint-disable-line react-hooks/exhaustive-deps

function RunOver({ run, map, reward, leave }: { leave: () => void; run: RunState; map: LoadedMap; reward: { crowns: number; packs: number } | 'claimed' | null; reduced: boolean }) {
  useLanguage();
  const won = run.result === 'won';
  const title = won ? msg("Quest complete") : run.result === 'expired' ? msg("The day has run out") : run.result === 'abandoned' ? msg("You turned back") : msg("You have fallen");
  const text = won ? msg("{v0} is defeated at {v1}.", { v0: run.quest.bossName, v1: msg(placeName(map, run.quest.target)) }) : run.result === 'expired' ? msg("No reward for this quest.") : msg("The road ends here. Come back tomorrow, or set out again.");
  return <main className="quest-page quest-draft quest-over" aria-label={title}>
    <section className="quest-draft-picks">
      <header><h1>{title}</h1><p>{text}</p></header>
      {won && reward && <p className={reward === 'claimed' ? 'quest-sub' : 'quest-reward'}>{reward === 'claimed' ? msg("Today's reward for this quest was already claimed.") : msg("Rewards: {v0} crowns and {v1} boosters.", { v0: reward.crowns, v1: reward.packs })}</p>}
      <dl className="quest-stats"><div><dt>{msg("Fights won")}</dt><dd>{run.stats.fights}</dd></div><div><dt>{msg("Crowns earned")}</dt><dd>{run.stats.goldEarned}</dd></div><div><dt>{msg("Crowns left")}</dt><dd>{run.gold}</dd></div><div><dt>{msg("Cards")}</dt><dd>{run.deck.length}</dd></div></dl>
      <button className="gold-button" onClick={() => { saveRun(null); leave(); }}>{msg("Back to the menu")}</button>
    </section>
    <aside className="builder-deck quest-draft-deck" aria-label={msg("Your deck")}>
      <div className="dk-progress valid"><span><b>{run.deck.length}</b> {msg("cards in your deck")}</span></div>
      <DeckList run={run}/>
    </aside>
  </main>;
}

function RunScreen({ run, map, reduced, leave, liveMatch, resume, beginFight, openDeck }: Props & { run: RunState; map: LoadedMap; now: number; openDeck: () => void }) {
  useLanguage();
  const [walk, setWalk] = useState<{ from: string; to: string; next: RunState } | null>(null);
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [offering, setOffering] = useState(false);
  const node: MapNode | undefined = run.encounter ? map.nodes.find(entry => entry.id === run.encounter!.node) : undefined;
  const commit = (next: RunState, before: RunState = run) => {
    const parts = [next.life !== before.life && msg("{v0} life", { v0: `${next.life > before.life ? '+' : ''}${next.life - before.life}` }), next.gold !== before.gold && msg("{v0} crowns", { v0: `${next.gold > before.gold ? '+' : ''}${next.gold - before.gold}` })].filter(Boolean);
    setNotice(parts.join(' · ')); setError(''); saveRun(next);
  };
  const attempt = (work: () => RunState) => { try { commit(work()); } catch (cause) { setError(cause instanceof Error ? msg(cause.message) : String(cause)); } };

  function launch(next: RunState) {
    const fight = next.fight!;
    const customDeck: CustomDeck = { id: `custom-quest-${next.id}`, name: msg("Quest deck"), cards: next.deck };
    const opponent = { id: `quest-enemy-${fight.node}`, name: msg(fight.enemy.name), cards: fight.enemy.deck };
    const profile = getProfile();
    const initial = startMatch(fight.seed, defaultDeckId, false, customDeck, undefined, opponent, profile.name, profile.avatar);
    initial.players.p1.life = next.life; initial.players.p2.life = fight.enemy.life;
    beginFight({ initial, mode: 'practice', deck: defaultDeckId, skirmish: false, customDeck, opponentDeck: opponent, rewardEligible: false, quest: { run: next.id, node: fight.node } });
  }
  function doAction(action: Action) {
    try {
      const next = engineAct(run, questContent, map, action);
      commit(next);
      if (next.fight) launch(next);
    } catch (cause) { setError(cause instanceof Error ? msg(cause.message) : String(cause)); }
  }
  if (run.offer?.kind === 'pick' && run.offer.source === 'draft' && !run.fight) return <DraftPage run={run} reduced={reduced} take={id => attempt(() => takeCard(run, questContent, map, id))} leave={leave} giveUp={() => saveRun(abandon(run))}/>;
  return <main className="quest-page quest-run" aria-label={msg("Quest map")}>
    <MapView map={map} run={run} focusKey={run.id} reduced={reduced} walk={walk} onArrived={() => { if (walk) { saveRun(walk.next); setWalk(null); } }} onNode={id => {
      if (run.fight || walk) return;
      if (run.encounter?.node === id) return;
      setNotice(''); setError('');
      try { const next = travel(run, map, id); setWalk({ from: run.position, to: id, next }); }
      catch (cause) { if (run.visited.includes(id)) saveRun(engineLeave(run, map)); else setError(cause instanceof Error ? cause.message : ''); }
    }}/>
    {run.fight && <div className="modal-backdrop"><section className="choice-dialog"><h2>{msg("{v0} is waiting", { v0: run.fight.enemy.name })}</h2><p>{liveMatch ? msg("Your fight is still under way.") : msg("The fight has to be finished.")}</p>
      <div className="quest-actions">{liveMatch ? <button className="gold-button" onClick={resume}><Play size={15}/>{msg("Return to the fight")}</button> : <button className="gold-button" onClick={() => launch(run)}><Skull size={15}/>{msg("Start the fight")}</button>}</div></section></div>}
    {!run.fight && node && !run.offer && <LocationDialog run={run} node={node} notice={notice} error={error} act={doAction} leave={() => { setOffering(false); saveRun(engineLeave(run, map)); setNotice(''); }} openOffer={() => {}} offering={offering} setOffering={setOffering}/>}
    {run.offer && !run.fight && !(run.offer.kind === 'pick' && run.offer.source === 'draft') && <OfferView run={run} reduced={reduced} showDeck={openDeck}
      take={id => attempt(() => takeCard(run, questContent, map, id))} skip={() => commit(skipOffer(run))}
      buy={index => attempt(() => engineAct(run, questContent, map, { type: 'buy', index }))} close={() => commit(skipOffer(run))}/>}
    {!run.offer && !node && <p className="quest-hint-line"><MapIcon size={14}/>{msg("Tap a place on the map to travel there.")}</p>}
  </main>;
}
