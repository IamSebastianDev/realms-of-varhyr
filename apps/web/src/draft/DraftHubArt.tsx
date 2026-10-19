import { lazy, Suspense, type CSSProperties } from 'react';
import { carouselPack, hasWebGL, SceneBoundary } from '../packScene';
import { Check, Minus, Package, Swords, X } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { registry } from '../../../../packages/content/src';
import { boosterPacks, packCards } from '../../../../packages/content/src/boosters';
import { FactionIcon } from '../../../../packages/renderer/src/FactionIcon';
import type { DraftMatch, DraftPreset } from '../../../../packages/draft/src';
import { packColor, packLines } from '../BoosterOpening';
import { CrownIcon } from '../Crowns';
import { rarest } from '../DeckShelf';
import { cardArtUrl } from '../cardArtUrl';

const packOf = (preset: DraftPreset) => boosterPacks.find(entry => entry.id === preset.packs[0])!;
/** The same artwork as the draft's stripe in the blade: the best card of the booster, full bleed, shaded for reading. */
export function DraftBackdrop({ preset }: { preset: DraftPreset }) {
  const art = rarest(packCards(Object.values(registry.cards), packOf(preset)).map(card => card.id))[0];
  return <div className="draft-backdrop" aria-hidden>
    <div className="draft-world" style={art ? { backgroundImage: `url(${cardArtUrl(art.id)})` } : undefined}/>
    <div className="draft-shade"/>
  </div>;
}

const Booster3D = lazy(() => import('../BoosterPack3D').then(module => ({ default: module.BoosterReward3D })));
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduce-motion'); } catch { return false; } };

/** The draft's boosters: the real 3D pack, three of them side by side, with the count of the whole draft. */
export function DraftPacks({ preset }: { preset: DraftPreset }) {
  useLanguage();
  const pack = packOf(preset);
  const flat = <div className="draft-pack-flat"><FactionIcon faction={pack.icon} className="draft-pack-icon"/><span className="draft-pack-name">{packLines(pack.name)}</span></div>;
  return <div className="draft-packs" style={packColor(pack) as CSSProperties} role="img" aria-label={msg("{v0} boosters", { v0: preset.rounds * 3 })}>
    {hasWebGL
      ? <SceneBoundary fallback={flat}><Suspense fallback={null}><Booster3D pack={carouselPack(pack)} count={3} tagline={msg("SIX CARDS")} reduced={calm()}/></Suspense></SceneBoundary>
      : flat}
    <b className="draft-packs-count">×{preset.rounds * 3}</b>
  </div>;
}

const prizeText = (boosters: number) => boosters === 1 ? msg("+ 1 booster") : msg("+ {v0} boosters", { v0: boosters });

/** The payout ladder: one bronze medallion per number of wins, the best at the top. */
export function DraftLadder({ preset, wins, best }: { preset: DraftPreset; wins: number; best: number }) {
  useLanguage();
  const tiers = preset.payout.map((tier, wonCount) => ({ tier, wonCount })).reverse();
  return <ol className="draft-ladder" aria-label={msg("Payout")}>{tiers.map(({ tier, wonCount }) => {
    // Filled: payouts already won. Lit: the next one in reach. Dim: still possible. Struck: out of reach.
    const state = wins < 0 ? 'open' : wonCount <= wins ? 'secured' : wonCount > best ? 'lost' : wonCount === wins + 1 ? 'next' : 'reach';
    return <li key={wonCount} className={`draft-tier ${state}${wonCount === wins ? ' here' : ''}`} aria-current={wonCount === wins ? 'true' : undefined}>
      <span className="draft-medal"><b>{wonCount}</b><small>{wonCount === 1 ? msg("win") : msg("wins")}</small></span>
      <span className="draft-prize">
        <span className="draft-prize-crowns"><CrownIcon/>{msg("{v0} crowns", { v0: tier.crowns })}</span>
        <span className="draft-prize-packs"><Package size={14}/>{prizeText(tier.boosters)}</span>
      </span>
      {wonCount === wins && <em className="draft-tier-now">{msg("You are here")}</em>}
    </li>;
  })}</ol>;
}
