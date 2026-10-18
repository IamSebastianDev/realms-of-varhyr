import { lazy, Suspense } from 'react';
import { ArrowLeft, ArrowRight, Check, Gift } from 'lucide-react';
import { boosterPacks } from '../../../../packages/content/src/boosters';
import type { RunState } from '../../../../packages/quest/src';
import { FactionIcon } from '../../../../packages/renderer/src/FactionIcon';
import { t as msg, useLanguage } from '../../../../packages/ui/src/i18n';
import type { QuestSettlement } from '../collection';
import { CrownIcon } from '../Crowns';
import { carouselPack, hasWebGL, SceneBoundary } from '../packScene';

const BoosterReward3D = lazy(() => import('../BoosterPack3D').then(module => ({ default: module.BoosterReward3D })));

/** The daily quest bonus has its own moment before spending the run's separate card budget. */
export function QuestVictory({ run, receipt, place, reduced, error, retry, leave, continueToCards }: {
  run: RunState; receipt?: QuestSettlement; place: string; reduced: boolean; error: string;
  retry: () => void; leave: () => void; continueToCards: () => void;
}) {
  useLanguage();
  const reward = receipt?.reward, paid = reward && reward !== 'claimed' ? reward : null;
  const pack = boosterPacks.find(entry => entry.id === run.pack);
  const packFallback = <Gift className="quest-victory-pack-fallback"/>;
  return <main className={`quest-page quest-victory ${reduced ? 'reduce-motion' : ''}`} aria-label={msg('Quest victory rewards')}>
    <button className="builder-icon-button quest-victory-back" aria-label={msg('Back to the menu')} onClick={leave}><ArrowLeft size={17}/></button>
    <header className="quest-victory-heading">
      <FactionIcon faction={run.faction} className="quest-victory-crest"/>
      <p>{msg('Victory')}</p><h1>{msg('Quest complete')}</h1>
      <span>{msg('{v0} is defeated at {v1}.', { v0: run.quest.bossName, v1: msg(place) })}</span>
    </header>
    {paid ? <>
      <div className="quest-victory-loot" aria-label={msg('Spoils of victory')}>
        <section className="quest-victory-crowns" aria-label={msg('{v0} crowns', { v0: paid.crowns })}>
          <div className="quest-victory-coin"><CrownIcon tilt/></div>
          <strong>+{paid.crowns}</strong><h2>{msg('Crowns')}</h2><p>{msg('Added to your account')}</p>
        </section>
        <section className="quest-victory-boosters" aria-label={msg('{v0} boosters', { v0: paid.packs })}>
          <div className="quest-victory-packs" aria-hidden="true">{pack && hasWebGL
            ? <SceneBoundary fallback={packFallback}><Suspense fallback={packFallback}><BoosterReward3D pack={carouselPack(pack)} count={paid.packs} tagline={msg('FIVE CARDS')} reduced={reduced}/></Suspense></SceneBoundary>
            : packFallback}</div>
          <strong>+{paid.packs}</strong><h2>{msg('Boosters')}</h2><p>{msg(pack?.name ?? run.quest.packName)}</p>
        </section>
      </div>
      <p className="quest-victory-saved"><Check size={15}/>{msg('Your rewards are saved. Open your boosters from Packs.')}</p>
    </> : <p className="quest-victory-claimed" role="status">{receipt ? msg("Today's reward for this quest was already claimed.") : msg('Preparing your rewards…')}</p>}
    <footer className="quest-victory-actions">
      {error && <p className="quest-error" role="alert">{msg(error)}</p>}
      {error && <button className="outline-button" onClick={retry}>{msg('Try again')}</button>}
      <button className="outline-button quest-victory-continue" disabled={!receipt} onClick={continueToCards}>{msg('Continue to cards')}<ArrowRight size={17}/></button>
      <small>{msg('Next: spend your {v0} run coins to keep cards from your deck.', { v0: receipt?.coins ?? run.gold })}</small>
    </footer>
  </main>;
}
