import { useState } from 'react';
import { Check } from 'lucide-react';
import type { CardDefinition } from '../../../packages/contracts/src';
import { cardPrice, ownedCopyCount, ownershipLimit, type Collection } from './collection';
import { CrownAmount } from './Crowns';
import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { OwnershipPips } from './OwnershipPips';

/** Ownership and a "Buy a copy" action for the card inspector. `buy` spends crowns and grants one copy. */
export function CardPurchase({ card, collection, buy }: { card: CardDefinition; collection: Collection; buy: () => void }) {
  useLanguage();
  const owned = ownedCopyCount(collection.counts, card.id), limit = ownershipLimit(card), price = cardPrice(card);
  const full = owned >= limit, short = !full && collection.crowns < price;
  const [bought, setBought] = useState(false);
  return <div className="card-purchase">
    <div className="card-purchase-owned"><OwnershipPips card={card} owned={collection.counts}/><span>{msg("{v0} of {v1} copies owned", { v0: Math.min(owned, limit), v1: limit })}</span></div>
    <div className="card-purchase-buy">
      <button className="gold-button" disabled={full || short} aria-label={msg("Buy a copy of {v0} for {v1} crowns", { v0: card.name, v1: price })}
        title={full ? msg("All {v0} copies owned", { v0: limit }) : short ? msg("Not enough crowns. A copy costs {v0}.", { v0: price }) : undefined}
        onClick={() => { buy(); setBought(true); }}>
        {full ? msg("All {v0} copies owned", { v0: limit }) : msg("Buy a copy")}{!full && <CrownAmount amount={price}/>}
      </button>
      {!full && <span className="card-purchase-wallet">{msg("You have")} <CrownAmount amount={collection.crowns}/></span>}
    </div>
    <p className="card-purchase-status" role="status">{bought && owned > 0 ? <><Check size={13}/>{msg("Copy bought. You own {v0} of {v1}.", { v0: Math.min(owned, limit), v1: limit })}</> : ''}</p>
  </div>;
}
