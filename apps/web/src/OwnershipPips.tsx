import type { CardDefinition } from '../../../packages/contracts/src';
import { ownedCopyCount, ownershipLimit, type OwnedCopies } from './collection';
import { t as msg, useLanguage } from './i18n';

/** Filled gems are owned copies; empty rings show the remaining collection capacity. */
export function OwnershipPips({ card, owned }: { card: CardDefinition; owned: OwnedCopies }) {
  useLanguage();
  const limit=ownershipLimit(card),count=Math.min(limit,ownedCopyCount(owned,card.id));
  const label=msg('{v0} of {v1} copies owned',{v0:count,v1:limit});
  return <span className="ownership-pips" data-rarity={card.legendary?'legendary':card.rarity} role="img" aria-label={label} title={label}>
    {Array.from({length:limit},(_,index)=><span key={index} className={`ownership-pip${index<count?' owned':''}`} aria-hidden="true"/>)}
  </span>;
}
