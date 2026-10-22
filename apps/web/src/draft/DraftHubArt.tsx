import { lazy, Suspense, type CSSProperties } from 'react';
import { hasWebGL, proceduralPack, SceneBoundary } from '../packScene';
import { Check, Minus, Package, Swords, X } from 'lucide-react';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import { FactionIcon } from '../../../../packages/renderer/src/FactionIcon';
import type { DraftPreset } from '../../../../packages/draft/src';
import { packLines } from '../BoosterOpening';
import { CrownIcon } from '../Crowns';
import { cardArtUrl } from '../cardArtUrl';
import { factionArt, factionColor, factionName } from './factionTools';

/** The same artwork as the faction's stripe in the blade: its best card, full bleed, shaded for reading. */
export function DraftBackdrop({ faction }: { faction: string }) {
  const art = factionArt(faction);
  return <div className="draft-backdrop" aria-hidden>
    <div className="draft-world" style={art ? { backgroundImage: `url(${cardArtUrl(art.id)})` } : undefined}/>
    <div className="draft-shade"/>
  </div>;
}

const Booster3D = lazy(() => import('../BoosterPack3D').then(module => ({ default: module.BoosterReward3D })));
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduce-motion'); } catch { return false; } };

/** The draft's boosters: half of them are the faction everybody starts with, the other half are a mystery until the second faction is chosen. */
export function DraftPacks({ preset, faction, second }: { preset: DraftPreset; faction: string; second?: string | null }) {
  useLanguage();
  const half = preset.rounds * 3 / 2, other = second ?? null;
  const sides = [
    { key: 'first', pack: proceduralPack('draft-first', factionName(faction), factionColor(faction), faction), icon: faction, name: factionName(faction) },
    { key: 'second', pack: proceduralPack('draft-second', other ? factionName(other) : '?', other ? factionColor(other) : '#8d8574', other), icon: other, name: other ? factionName(other) : msg("Second faction") },
  ];
  return <div className="draft-packs" role="img" aria-label={msg("{v0} boosters", { v0: preset.rounds * 3 })}>{sides.map(side => <div key={side.key} className="draft-packs-side" style={{ ['--pack-color' as string]: side.pack.color } as CSSProperties}>
    {hasWebGL
      ? <SceneBoundary fallback={<div className="draft-pack-flat">{side.icon ? <FactionIcon faction={side.icon} className="draft-pack-icon"/> : <span className="draft-pack-icon">?</span>}<span className="draft-pack-name">{packLines(side.name)}</span></div>}><Suspense fallback={null}><Booster3D pack={side.pack} count={1} tagline={msg("SIX CARDS")} reduced={calm()}/></Suspense></SceneBoundary>
      : <div className="draft-pack-flat">{side.icon ? <FactionIcon faction={side.icon} className="draft-pack-icon"/> : <span className="draft-pack-icon">?</span>}<span className="draft-pack-name">{packLines(side.name)}</span></div>}
    <b className="draft-packs-count">×{half}</b>
  </div>)}</div>;
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
