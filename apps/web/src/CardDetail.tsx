import type { ReactNode } from 'react';
import { factionInfo } from '../../../packages/content/src';
import type { CardDefinition } from '../../../packages/contracts/src';
import { ArtCard, cardClassification, CardFacts, CardLore, Cost } from './CardPresentation';

/**
 * The one way a card is shown in detail: art on the left; type, name, cost, lore, rules and state on the right.
 * Used by the collection inspector, the in-match hover and pinned preview, and anywhere else a card needs reading.
 * Callers provide only the chrome around it (a modal, a floating panel).
 */
export function CardDetail({ card, stats, animated = false, reduced = false, state, children }: {
  card: CardDefinition;
  /** Current attack and remaining defense for a card in play. */
  stats?: { attack: number; defense: number };
  animated?: boolean;
  reduced?: boolean;
  /** One line of situational text, such as where the card is and what it can do. */
  state?: ReactNode;
  /** Actions shown below the card text. */
  children?: ReactNode;
}) {
  const factions = card.factions.map(f => factionInfo[f].name).join(' / ') || 'Neutral';
  return <div className="card-detail">
    <ArtCard card={card} animated={animated} reduced={reduced} className="card-detail-art" stats={stats} />
    <div className="card-detail-body">
      <span className="eyebrow">{factions} · {card.legendary ? 'Legendary ' : ''}{cardClassification(card)}</span>
      <h2>{card.name}</h2>
      <Cost card={card} />
      <CardLore card={card} />
      <CardFacts card={card} stats={stats} />
      {card.timing && <p className="detail-timing">Play during {card.timing.map(t => t === 'death' ? 'the death-energy window' : 'your play phase').join(' or ')}.</p>}
      {state && <p className="card-detail-state">{state}</p>}
      {children}
    </div>
  </div>;
}
