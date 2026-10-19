import { lazy, Suspense, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Gift, Store as StoreIcon } from 'lucide-react';
import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { boosterPacks, type BoosterPack } from '../../../packages/content/src/boosters';
import { packCount, totalPacks, type Collection } from './collection';
import { carouselPack, hasWebGL, SceneBoundary } from './packScene';
import { packLines, packSymbol } from './BoosterOpening';
import { CountBadge } from './CountBadge';
import './store.css';
import './packs.css';

const BoosterCarousel3D = lazy(() => import('./BoosterPack3D'));
const mod = (value: number, size: number) => ((value % size) + size) % size;

function FlatPack({ pack }: { pack: BoosterPack }) {
  return <div className="booster-pack store-pack"><span>REALMS OF VARHYR</span>{packSymbol(pack) && <b className="pack-symbol">{packSymbol(pack)}</b>}<strong>{packLines(msg(pack.name))}</strong><small>{msg("FIVE CARDS")}</small></div>;
}

/** The boosters the player can open: an endless carousel of only the packs they own, with the number waiting on a badge. */
export function Packs({ collection, reduced, open, goToStore }: { collection: Collection; reduced: boolean; open: (pack: BoosterPack) => void; goToStore: () => void }) {
  useLanguage();
  const waiting = totalPacks(collection), mine = boosterPacks.filter(pack => packCount(collection, pack.id) > 0), count = mine.length;
  const [position, setPosition] = useState(0);
  const step = (delta: number) => setPosition(value => value + delta);
  const drag = useRef<number | null>(null);
  const pack = count ? mine[mod(position, count)] : undefined;
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Enter' && event.target === event.currentTarget && pack) { event.preventDefault(); open(pack); } else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); } else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); } };
  const onDown = (event: PointerEvent) => { drag.current = event.clientX; };
  const onUp = (event: PointerEvent) => { if (drag.current !== null && Math.abs(event.clientX - drag.current) > 60) step(event.clientX < drag.current ? 1 : -1); drag.current = null; };
  /** Double-clicking the pack opens it. The arrows keep their own meaning, and a side pack first slides to the middle. */
  const onDouble = (event: MouseEvent) => { if (pack && !(event.target as Element).closest('.store-arrow')) open(pack); };
  const bar = <header className="store-bar">
    <h1>{msg("Packs")}</h1>
    <span className="store-waiting"><Gift size={17}/><b>{waiting}</b>{waiting === 1 ? msg("booster waiting") : msg("boosters waiting")}</span>
    <button className="outline-button packs-store" onClick={goToStore}><StoreIcon size={16}/>{msg("Get more in the Store")}</button>
  </header>;
  if (!pack) return <main className="store-page store-hall packs-page" aria-label={msg("Packs")}>
    <section className="store-stage">{bar}
      <div className="packs-empty"><Gift size={42}/><h2>{msg("No boosters waiting")}</h2><p>{msg("Win matches to earn boosters, or buy them in the Store.")}</p></div>
    </section>
  </main>;
  const owned = packCount(collection, pack.id);
  return <main className="store-page store-hall packs-page" aria-label={msg("Packs")}>
    <section className="store-stage" style={{ '--pack-color': pack.color } as CSSProperties}>
      {bar}
      <div className="store-carousel packs-carousel" role="group" aria-roledescription="carousel" aria-label={msg("Boosters")} tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerUp={onUp} onDoubleClick={onDouble}>
        <div className="store-pack-view" aria-hidden="true">
          {hasWebGL
            ? <SceneBoundary fallback={<FlatPack pack={pack}/>}><Suspense fallback={<FlatPack pack={pack}/>}><BoosterCarousel3D packs={mine.map(carouselPack)} tagline={msg("FIVE CARDS")} position={position} pick={offset => setPosition(offset)} reduced={reduced}/></Suspense></SceneBoundary>
            : <FlatPack pack={pack}/>}
        </div>
        <CountBadge big count={owned} className="pack-badge" key={pack.id}/>
        {count > 1 && <>
          <button className="store-arrow left" aria-label={msg("Previous booster")} onClick={() => step(-1)}><ChevronLeft size={26}/></button>
          <button className="store-arrow right" aria-label={msg("Next booster")} onClick={() => step(1)}><ChevronRight size={26}/></button>
        </>}
      </div>
      <div className="store-bay-info" aria-live="polite">
        <h2>{msg(pack.name)}</h2>
        <p>{msg(pack.blurb)}</p>
        {count > 1 && <div className="store-dots" aria-hidden="true">{mine.map((item, index) => <i key={item.id} className={index === mod(position, count) ? 'on' : ''}/>)}</div>}
        <div className="store-owned"><Gift size={15}/>{owned} {msg("owned")}</div>
        <div className="store-buy"><button className="gold-button" aria-label={msg("Open {v0} booster", { v0: pack.name })} onClick={() => open(pack)}><Gift size={17}/>{msg("Open booster")}</button></div>
      </div>
    </section>
  </main>;
}
