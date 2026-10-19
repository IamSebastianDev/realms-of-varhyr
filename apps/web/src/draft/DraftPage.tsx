import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Layers, Play, Swords, UserPlus, X } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { CardDetail } from '../../../../packages/ui/src/CardDetail';
import { ArtCard } from '../../../../packages/ui/src/CardPresentation';
import { defaultDeckId, factionInfo, registry } from '../../../../packages/content/src';
import { boosterPacks } from '../../../../packages/content/src/boosters';
import type { CardDefinition } from '../../../../packages/contracts/src';
import { bestPossible, botNamesFor, dropRun, isFreeProducer, isRunComplete, nextMatch, payoutFor, playedOf, poolOf, presetById, setDeck, startRun, takePick, winsOf, draftRules, type DraftPreset, type DraftRun } from '../../../../packages/draft/src';
import { BuilderDialog } from '../BuilderDialog';
import { CrownAmount } from '../Crowns';
import { updateCollection, useCollection } from '../collectionStore';
import { getProfile } from '../profile';
import { randomSeed, startMatch, type MatchSetup } from '../session';
import type { CustomDeck } from '../decks';
import { DraftDeckBuilder } from './DraftDeckBuilder';
import { DraftPicker } from './DraftPicker';
import { DraftBackdrop, DraftLadder, DraftPacks } from './DraftHubArt';
import { FactionIcon } from '../../../../packages/renderer/src/FactionIcon';
import { CrownIcon } from '../Crowns';
import { activeDraft, saveDraftRun, useDraftRun } from './draftStore';
import { enterDraft, settleDraft, type DraftSettlement } from './rewards';
import './draft.css';

type Props = { reduced: boolean; /** Back to the main menu; the run stays saved. */ leave: () => void; /** A draft match is open in the background and can be returned to. */ liveMatch: boolean; resume: () => void; beginFight: (setup: MatchSetup) => void };
type View = 'overview' | 'pick' | 'build';

export function DraftPage(props: Props) {
  const preset = presetById(activeDraft() ?? '');
  useEffect(() => { if (!preset) props.leave(); }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps
  return preset ? <DraftHub key={preset.id} preset={preset} {...props}/> : null;
}

/** Reads cards in a dialog, as the collection does. */
function Inspector({ card, reduced, close }: { card: CardDefinition; reduced: boolean; close: () => void }) {
  return <div className="modal-backdrop collection-modal" onClick={close}>
    <section className="collection-card-detail" role="dialog" aria-modal="true" aria-label={msg("{v0} details", { v0: card.name })} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === msg("Escape")) { event.stopPropagation(); close(); } }}>
      <button className="collection-close" aria-label={msg("Close card details")} onClick={close} autoFocus><X size={20}/></button>
      <CardDetail card={card} animated reduced={reduced}/>
    </section>
  </div>;
}

const tierText = (tier: { crowns: number; boosters: number }) => tier.boosters === 1 ? msg("{v0} crowns + 1 booster", { v0: tier.crowns }) : msg("{v0} crowns + {v1} boosters", { v0: tier.crowns, v1: tier.boosters });

/** The payout, in the manner of a card reveal: what the wins paid, then every drafted card going into the collection. */
function PayoutDialog({ settlement, preset, reduced, close, inspect }: { settlement: DraftSettlement; preset: DraftPreset; reduced: boolean; close: () => void; inspect: (card: CardDefinition) => void }) {
  useLanguage();
  const cards = [...settlement.cards].sort((a, b) => Number(b.isNew) - Number(a.isNew) || registry.cards[a.id]!.name.localeCompare(registry.cards[b.id]!.name));
  const kept = settlement.cards.reduce((sum, card) => sum + card.kept, 0);
  return <div className="modal-backdrop draft-payout-backdrop">
    <section className="draft-payout-dialog" role="dialog" aria-modal="true" aria-label={msg("Draft payout")}>
      <h2>{settlement.dropped ? msg("Draft ended early") : msg("Draft complete")}</h2>
      <p className="draft-payout-wins">{msg("{v0} wins from {v1} matches", { v0: settlement.wins, v1: settlement.played })}</p>
      <div className="draft-payout-rewards">
        <span><CrownAmount amount={settlement.crowns}/></span>
        {settlement.boosters.map(entry => <span key={entry.pack} className="draft-payout-booster"><b>{entry.count}×</b> {msg(boosterPacks.find(pack => pack.id === entry.pack)?.name ?? entry.pack)}</span>)}
      </div>
      <p className="draft-payout-kept">{msg("{v0} cards joined your collection.", { v0: kept })}{settlement.dusted ? ` ${msg("Extra copies turned into {v0} crowns.", { v0: settlement.dusted })}` : ''}</p>
      <div className="draft-payout-cards">{cards.map(entry => {
        const card = registry.cards[entry.id]!;
        return <article key={entry.id} className={entry.isNew ? 'is-new' : ''}>
          <ArtCard card={card} reduced={reduced} onClick={() => inspect(card)} interaction={{ 'aria-label': msg("Inspect {v0}", { v0: card.name }) }}/>
          <span className="draft-payout-tag">{entry.isNew && <em>{msg("New")}</em>}{entry.copies > 1 && <b>×{entry.copies}</b>}{entry.dusted > 0 && <small>{msg("+{v0} crowns", { v0: entry.dusted })}</small>}</span>
        </article>;
      })}</div>
      <button className="gold-button start-play" autoFocus onClick={close}><span>{msg("Collect")}</span><Check size={20}/></button>
    </section>
  </div>;
}

function DraftHub({ preset, reduced, leave, liveMatch, resume, beginFight }: Props & { preset: DraftPreset }) {
  useLanguage();
  const run = useDraftRun(preset.id);
  const { collection } = useCollection();
  const [view, setView] = useState<View>('overview');
  const [dialog, setDialog] = useState<'start' | 'drop' | null>(null);
  const [inspected, setInspected] = useState<CardDefinition | null>(null);
  const [payout, setPayout] = useState<DraftSettlement | null>(null);
  const [error, setError] = useState('');
  const origin = useRef<HTMLElement | null>(null);
  const pack = boosterPacks.find(entry => entry.id === preset.packs[0]);
  const open = (next: NonNullable<typeof dialog>) => { origin.current = document.activeElement as HTMLElement; setDialog(next); };
  const fail = (cause: unknown, fallback: string) => setError(cause instanceof Error ? msg(cause.message) : fallback);
  useEffect(() => { setError(''); }, [view, dialog]);

  function start() {
    try {
      updateCollection(current => enterDraft(current, preset), { requireSave: true });
      saveDraftRun(preset.id, startRun(preset, registry, { id: crypto.randomUUID(), seed: randomSeed(), now: Date.now() }));
      setDialog(null); setView('pick');
    } catch (cause) { fail(cause, msg("Could not start the draft.")); }
  }
  function pick(cardId: string) {
    if (!run) return;
    try { const next = takePick(run, preset, registry, cardId); saveDraftRun(preset.id, next); if (next.stage === 'build') setView('build'); }
    catch (cause) { fail(cause, msg("Could not take that card.")); }
  }
  function saveDeck(deck: string[]) {
    if (!run) return;
    try { saveDraftRun(preset.id, setDeck(run, deck, registry)); setView('overview'); } catch (cause) { fail(cause, msg("This deck cannot be saved.")); }
  }
  function playMatch() {
    if (!run) return;
    const index = nextMatch(run), match = run.matches[index], bot = match && run.bots[match.opponent - 1];
    if (!match || !bot || !run.deck.length) return;
    try {
      const customDeck: CustomDeck = { id: `custom-draft-${run.id}`, name: msg("Draft deck"), cards: run.deck };
      const opponentDeck = { id: `draft-bot-${run.id}-${match.opponent}`, name: bot.name, cards: bot.deck };
      const profile = getProfile();
      const initial = startMatch(match.seed, defaultDeckId, false, customDeck, undefined, opponentDeck, profile.name, profile.avatar, true);
      beginFight({ initial, mode: 'practice', deck: defaultDeckId, skirmish: false, customDeck, opponentDeck, rewardEligible: false, draft: { preset: preset.id, run: run.id, match: index } });
    } catch (cause) { fail(cause, msg("This match cannot start.")); }
  }
  function finish() {
    if (!run) return;
    let reward: ReturnType<typeof settleDraft> | undefined;
    try {
      updateCollection(current => { reward = settleDraft(current, run, preset, registry); return reward ? reward.collection : current; }, { requireSave: true });
      saveDraftRun(preset.id, { ...run, stage: 'finished' });
      if (reward) setPayout(reward.settlement); else saveDraftRun(preset.id, null);
    } catch (cause) { fail(cause, msg("Could not pay out this draft.")); }
  }
  const collect = () => { saveDraftRun(preset.id, null); setPayout(null); setView('overview'); };

  const inspector = inspected && <Inspector card={inspected} reduced={reduced} close={() => setInspected(null)}/>;
  if (payout) return <>
    <main className="draft-page" aria-hidden><div className="world-bg"/></main>
    <PayoutDialog settlement={payout} preset={preset} reduced={reduced} close={collect} inspect={setInspected}/>{inspector}
  </>;
  if (run && run.stage === 'draft' && view === 'pick') return <><DraftPicker run={run} preset={preset} reduced={reduced} pick={pick} back={() => setView('overview')} inspect={setInspected}/>{inspector}{error && <div className="toast" role="alert">{error}</div>}</>;
  if (run && (run.stage === 'build' || run.stage === 'matches') && view === 'build') return <><DraftDeckBuilder run={run} preset={preset} reduced={reduced} save={saveDeck} back={() => setView('overview')} inspect={setInspected}/>{inspector}{error && <div className="toast" role="alert">{error}</div>}</>;

  // The overview: one page for the whole run.
  const complete = !!run && isRunComplete(run), finished = run?.stage === 'finished';
  const wins = run ? winsOf(run) : -1, best = run && complete ? wins : run && run.matches.length ? bestPossible(run) : draftRules.matches;
  const picked = run ? run.draft.picks[0]!.length : 0, total = preset.rounds * preset.packSize;
  const next = run ? nextMatch(run) : -1;
  const factions = (pack?.factions ?? []).map(faction => msg(factionInfo[faction]?.name ?? faction)).join(' · ');
  const dropAllowed = !!run && run.stage !== 'draft' && !complete && !finished;

  let primary: { label: string; icon: ReactNode; run: () => void; disabled?: boolean; hint?: string };
  if (!run) primary = { label: msg("Start draft"), icon: <Layers size={18}/>, run: () => open('start') };
  else if (finished) primary = { label: msg("Close run"), icon: <Check size={18}/>, run: () => saveDraftRun(preset.id, null) };
  else if (complete) primary = { label: msg("Finish draft"), icon: <Check size={18}/>, run: finish };
  else if (run.stage === 'draft') primary = { label: msg("Continue draft"), icon: <Layers size={18}/>, run: () => setView('pick') };
  else if (run.stage === 'build') primary = { label: msg("Build deck"), icon: <Layers size={18}/>, run: () => setView('build') };
  else if (liveMatch) primary = { label: msg("Return to match"), icon: <Play size={18}/>, run: resume };
  else primary = { label: msg("Play next match"), icon: <Swords size={18}/>, run: playMatch };

  const hint = !run ? msg("You keep every card you draft.") : finished ? msg("This run is closed.") : complete ? (run.dropped ? msg("Run ended early.") : msg("All matches played.")) : run.stage === 'draft' ? msg("Pick {v0} of {v1}", { v0: picked + 1, v1: total })
    : run.stage === 'build' ? msg("Build a deck from your picks.") : msg("So far: {v0}", { v0: tierText(payoutFor(preset, wins)) });
  const chips = [msg("{v0} boosters", { v0: preset.rounds * draftRules.drafters }), msg("{v0} picks each", { v0: total }), msg("Any number of copies"), msg("A producer in every pack")];

  return <main className="draft-page draft-overview" aria-label={msg("Faction draft")} style={{ ['--pack-color' as string]: preset.color }}>
    <DraftBackdrop preset={preset}/>
    <header className="draft-head">
      <button className="builder-icon-button" aria-label={msg("Back to menu")} title={msg("Back to menu")} onClick={leave}><ArrowLeft size={16}/></button>
      <span className="draft-wallet" role="status">{msg("Your crowns")} <CrownAmount amount={collection.crowns}/></span>
    </header>
    <section className="draft-hero-copy">
      <p className="draft-kicker">{(pack?.factions ?? []).map(faction => <span key={faction}><FactionIcon faction={faction}/>{msg(factionInfo[faction]?.name ?? faction)}</span>)}</p>
      <h1>{msg(preset.name)}</h1>
      <p className="draft-blurb">{msg("Draft 48 cards with two bots, build a deck from them and play each bot twice. Your wins decide the payout, and you keep every card.")}</p>
      <ul className="draft-chips" aria-label={msg("Draft structure")}>{chips.map(chip => <li key={chip}>{chip}</li>)}</ul>
      <DraftPacks preset={preset}/>
    </section>
    <DraftLadder preset={preset} wins={wins} best={best}/>
    <aside className="draft-cta">
      <p className="draft-cta-hint" role="status">{hint}</p>
      <button className="gold-button start-play" disabled={primary.disabled || (!run && collection.crowns < preset.entryFee)} title={!run && collection.crowns < preset.entryFee ? msg("Entering costs {v0} crowns.", { v0: preset.entryFee }) : undefined} onClick={primary.run}><span>{primary.label}</span>{!run ? <b className="draft-fee"><CrownIcon/>{preset.entryFee}</b> : primary.icon}</button>
      <div className="draft-cta-more">
        {run && !complete && (run.stage === 'build' || run.stage === 'matches') && !liveMatch && <button className="outline-button" onClick={() => setView('build')}>{msg("Edit deck")}</button>}
        {dropAllowed && <button className="outline-button" onClick={() => open('drop')}>{msg("End run")}</button>}
        {!run && <button className="outline-button" disabled title={msg("Drafting with friends comes later.")}><UserPlus size={16}/>{msg("Invite to draft")}</button>}
      </div>
    </aside>
    {dialog === 'start' && <BuilderDialog title={msg("Start the draft")} origin={origin.current} close={() => setDialog(null)}>
      <p>{msg("Entering costs {v0} crowns. You have {v1}.", { v0: preset.entryFee, v1: collection.crowns })}</p>
      <p>{msg("You can stop and come back at any time. Whatever happens, you keep the cards.")}</p>
      {error && <p className="builder-dialog-error" role="alert">{error}</p>}
      <div className="builder-dialog-actions"><button className="outline-button" onClick={() => setDialog(null)}>{msg("Cancel")}</button><button className="gold-button" data-autofocus disabled={collection.crowns < preset.entryFee} onClick={start}>{msg("Pay {v0} and draft", { v0: preset.entryFee })}</button></div>
    </BuilderDialog>}
    {dialog === 'drop' && run && <BuilderDialog title={msg("End this run?")} origin={origin.current} close={() => setDialog(null)}>
      <p>{msg("The run ends now. You are paid for your {v0} wins so far ({v1}), unplayed matches pay nothing, and you keep the cards.", { v0: wins, v1: tierText(payoutFor(preset, wins)) })}</p>
      <div className="builder-dialog-actions"><button className="outline-button" data-autofocus onClick={() => setDialog(null)}>{msg("Keep playing")}</button><button className="gold-button" onClick={() => { saveDraftRun(preset.id, dropRun(run)); setDialog(null); }}>{msg("End run")}</button></div>
    </BuilderDialog>}
    {inspector}
    {error && !dialog && <div className="toast" role="alert">{error}</div>}
  </main>;
}
