import type { CardDefinition } from '../../../packages/contracts/src';
import { ownedCopyCount, ownershipLimit, type OwnedCopies } from './collection';
import { t as msg, useLanguage } from './i18n';

/** Filled gems are owned copies; empty rings show the remaining collection capacity.
 * In the deck builder, `inDeck` rings the gems for the copies currently in the deck. */
export function OwnershipPips({ card, owned, inDeck }: { card: CardDefinition; owned: OwnedCopies; inDeck?: number }) {
  useLanguage();
  const limit=ownershipLimit(card),count=Math.min(limit,ownedCopyCount(owned,card.id)),used=inDeck===undefined?0:Math.min(limit,inDeck);
  const label=inDeck===undefined?msg('{v0} of {v1} copies owned',{v0:count,v1:limit}):msg('{v0} of {v1} copies owned, {v2} in deck',{v0:count,v1:limit,v2:used});
  return <span className="ownership-pips" data-rarity={card.legendary?'legendary':card.rarity} role="img" aria-label={label} title={label}>
    {Array.from({length:limit},(_,index)=><span key={index} className={`ownership-pip${index<count?' owned':''}${index<used?' in-deck':''}`} aria-hidden="true"/>)}
  </span>;
}
