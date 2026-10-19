import { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { registry } from '../../../../packages/content/src';
import type { CardDefinition } from '../../../../packages/contracts/src';
import { ArtCard } from '../../../../packages/ui/src/CardPresentation';
import { botNamesFor, isFreeProducer, type DraftPreset, type DraftRun } from '../../../../packages/draft/src';
import { DraftBackdrop } from './DraftHubArt';
import { DraftPane } from './DraftPane';

/** The pick screen: the pack in front of you in an inset panel, your picks in the deckbuilder's pane. Choose a card, or drag it over. */
export function DraftPicker({ run, preset, reduced, pick, back, inspect }: { run: DraftRun; preset: DraftPreset; reduced: boolean; pick: (cardId: string) => void; back: () => void; inspect: (card: CardDefinition) => void }) {
  useLanguage();
  const [chosen, setChosen] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const state = run.draft, pack = state.held[0]!, mine = state.picks[0]!;
  const [next, previous] = botNamesFor(run.seed);
  const total = preset.rounds * preset.packSize;
  const take = (index: number) => { setChosen(null); pick(pack[index]!); };
  return <main className="deck-workshop draft-workshop" aria-label={msg("Draft picks")} style={{ ['--pack-color' as string]: preset.color }}>
    <DraftBackdrop preset={preset}/>
    <section className="builder-collection" aria-label={msg("Cards in your pack")}>
      <div className="builder-collection-bar">
        <button className="builder-icon-button" aria-label={msg("Back to the draft overview")} title={msg("Back to the draft overview")} onClick={back}><ArrowLeft size={16}/></button>
        <h2>{msg("Pick a card")}<span>{msg("Round {v0} of {v1} · {v2} cards in this pack", { v0: state.round + 1, v1: preset.rounds, v2: pack.length })}</span></h2>
      </div>
      <div className="draft-gallery"><div className="draft-gallery-grid">{pack.map((id, index) => {
        const card = registry.cards[id]!;
        return <article key={`${id}-${index}`} className={`builder-card-tile ${chosen === index ? 'has-copies' : ''} ${isFreeProducer(card, registry) ? 'is-producer' : ''}`} draggable
          onDragStart={event => { setChosen(index); event.dataTransfer.setData('text/plain', String(index)); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setOver(false)} onDoubleClick={() => take(index)}>
          <ArtCard card={card} reduced={reduced} detail={false} selected={chosen === index} onClick={() => setChosen(chosen === index ? null : index)}
            interaction={{ 'aria-label': msg("Choose {v0}", { v0: card.name }), title: msg("Click to choose · double-click or drag to take · right-click to inspect"), onContextMenu: event => { event.preventDefault(); inspect(card); } }}/>
        </article>;
      })}</div></div>
      <div className="builder-deck-footer draft-rail">
        <span>{msg("You pass what is left to {v0} and receive a pack from {v1}.", { v0: next, v1: previous })}</span>
        <button className="gold-button builder-save" disabled={chosen === null} onClick={() => chosen !== null && take(chosen)}>{chosen === null ? msg("Choose a card") : msg("Take card")}<Check size={14}/></button>
      </div>
    </section>
    <DraftPane cards={mine} target={total} unit={msg("picked")} inspect={inspect} footer={msg("Drag a card here to take it.")}
      drop={{ over, onDragOver: event => { event.preventDefault(); setOver(true); }, onDragLeave: () => setOver(false),
        onDrop: event => { event.preventDefault(); setOver(false); const index = Number(event.dataTransfer.getData('text/plain')); if (event.dataTransfer.getData('text/plain') !== '' && Number.isInteger(index) && pack[index]) take(index); } }}/>
  </main>;
}
