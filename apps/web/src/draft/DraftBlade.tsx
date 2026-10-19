import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { factionInfo, registry } from '../../../../packages/content/src';
import { boosterPacks, packCards } from '../../../../packages/content/src/boosters';
import { draftPresets, playedOf, type DraftPreset } from '../../../../packages/draft/src';
import { rarest } from '../DeckShelf';
import '../game-setup.css';
import './draft.css';
import { useDraftRun } from './draftStore';
import { cardArtUrl } from '../cardArtUrl';

/** One named draft as a stripe: art of the booster's best card, its factions, and where the run stands. */
function PresetStripe({ preset, selected, pick }: { preset: DraftPreset; selected: boolean; pick: () => void }) {
  const run = useDraftRun(preset.id);
  const pack = boosterPacks.find(entry => entry.id === preset.packs[0]);
  const art = rarest(packCards(Object.values(registry.cards), pack!).map(card => card.id))[0];
  const status = !run || run.stage === 'finished' ? msg("Entry {v0} crowns", { v0: preset.entryFee })
    : run.stage === 'draft' ? msg("Drafting · pick {v0} of {v1}", { v0: run.draft.picks[0]!.length + 1, v1: preset.rounds * 6 })
    : run.stage === 'build' ? msg("Build your deck")
    : msg("Run in progress · {v0} of {v1} matches", { v0: playedOf(run), v1: run.matches.length });
  return <button role="radio" aria-checked={selected} className="setup-deck draft-stripe" style={{ ['--tint' as string]: preset.color }} onClick={pick}>
    <span className="setup-deck-art" style={art ? { backgroundImage: `url(${cardArtUrl(art.id)})` } : undefined}/>
    <span className="setup-deck-text"><b>{msg(preset.name)}</b>
      <small>{(pack?.factions ?? []).map(faction => msg(factionInfo[faction]?.name ?? faction)).join(' · ')}</small>
      <small className="draft-stripe-status">{status}</small></span>
  </button>;
}

/** The Faction draft blade: choose a named draft, then go on to its overview. */
export function DraftBlade({ open }: { open: (preset: string) => void }) {
  useLanguage();
  const [chosen, setChosen] = useState(draftPresets[0]!.id);
  const run = useDraftRun(chosen);
  const resuming = !!run && run.stage !== 'finished';
  return <div className="draft-blade">
    <p className="quest-goal">{msg("Draft 48 cards with two bots, build a deck from them and play each bot twice. Your wins decide the payout, and you keep every card.")}</p>
    <h3 className="setup-label" id="draft-sets">{msg("Choose a draft")}</h3>
    <div className="quest-stripes" role="radiogroup" aria-labelledby="draft-sets">{draftPresets.map(preset => <PresetStripe key={preset.id} preset={preset} selected={preset.id === chosen} pick={() => setChosen(preset.id)}/>)}</div>
    <button className="gold-button start-play setup-start" onClick={() => open(chosen)}><span>{resuming ? msg("Continue run") : msg("View draft")}</span><ArrowRight size={22}/></button>
  </div>;
}
