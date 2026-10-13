import { t as msg, useLanguage, localizedCard } from './i18n';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { factionInfo, setInfo } from '../../../packages/content/src';
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
  useLanguage();
  card=localizedCard(card);
  const factions = card.factions.map(f => msg(factionInfo[f].name)).join(' / ') || msg("Neutral");
  const set=card.set ? setInfo[card.set] : undefined;
  return <div className="card-detail">
    <ArtCard card={card} animated={animated} reduced={reduced} className="card-detail-art" stats={stats} detail={false} />
    <div className="card-detail-body">
      <span className="eyebrow">{factions} · {card.legendary ? msg("Legendary ") : ''}{cardClassification(card)}</span>
      <h2>{card.name}</h2>
      {set && <p className="card-detail-set" title={msg(set.description)}><span aria-hidden="true">{set.symbol}</span><span>{msg(set.name)}</span><small>{set.code}</small></p>}
      <Cost card={card} />
      <CardLore card={card} />
      <CardFacts card={card} stats={stats} />
      {card.timing && <p className="detail-timing">{msg("Play during")}{' '}{card.timing.map(t => t === 'death' ? msg("the death-energy window") : msg("your play phase")).join(msg(" or "))}.</p>}
      {state && <p className="card-detail-state">{state}</p>}
      {children}
    </div>
  </div>;
}

/**
 * The detail panel shown while hovering a card anywhere in the app. It sits next to the card through CSS anchor
 * positioning (see card-detail.css) and falls back to a computed position where that is unsupported.
 */
export function CardHoverDetail({ card, rect, reduced = false }: { card: CardDefinition; rect: DOMRect; reduced?: boolean }) {
  useLanguage();
  const width = Math.min(600, window.innerWidth - 24);
  const x = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right + 14 + width < window.innerWidth ? rect.right + 14 : rect.left - width - 14));
  const y = Math.max(12, Math.min(window.innerHeight - 340, rect.top - 40));
  return createPortal(<>
    <div className="preview-anchor" aria-hidden style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
    <aside className="hover-preview" role="tooltip" aria-label={msg("{v0} preview", {v0: card.name})}
      style={{ ['--px' as string]: `${x}px`, ['--py' as string]: `${y}px`, width }}>
      <CardDetail card={card} animated reduced={reduced} />
    </aside>
  </>, document.body);
}
