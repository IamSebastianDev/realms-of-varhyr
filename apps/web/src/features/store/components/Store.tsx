import {
  lazy,
  Suspense,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ChevronLeft, ChevronRight, Crown, Gift } from "lucide-react";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { boosterPacks, type BoosterPack } from "@realms/content/boosters";
import { collectionRules, packCount, type Collection } from "../../collection/lib/collection";
import { CrownAmount } from "../../../components/Crowns";
import { packColor, packLines, packSymbol } from "../../boosters/components/BoosterOpening";
import type { CarouselPack } from "../../boosters/components/BoosterPack3D";
import { CardBacksShop } from "./CardBacksShop";
import { carouselPack, hasWebGL, SceneBoundary } from "../../boosters/components/packScene";
import "../styles/store.css";

const BoosterCarousel3D = lazy(() => import("../../boosters/components/BoosterPack3D"));
const mod = (value: number, size: number) => ((value % size) + size) % size;

function FlatPack({ pack }: { pack: BoosterPack }) {
  return (
    <div className="booster-pack store-pack">
      <span>REALMS OF VARHYR</span>
      {packSymbol(pack) ? <b className="pack-symbol">{packSymbol(pack)}</b> : <Crown size={55} />}
      <strong>{packLines(msg(pack.name))}</strong>
      <small>{msg("FIVE CARDS")}</small>
    </div>
  );
}

type Props = {
  collection: Collection;
  saved: boolean;
  message: string;
  reduced: boolean;
  open: (pack: BoosterPack) => void;
  buy: (pack: BoosterPack) => void;
};

/** One window-sized inset: the wallet on top, an endless carousel of boosters, and the focused booster to open or buy. */
export function Store({ collection, saved, message, reduced, open, buy }: Props) {
  useLanguage();
  const count = boosterPacks.length,
    canBuy = collection.crowns >= collectionRules.packCost;
  const [tab, setTab] = useState<"boosters" | "backs">("boosters");
  const [position, setPosition] = useState(0),
    [showing3d] = useState(hasWebGL);
  const step = (delta: number) => setPosition((value) => value + delta);
  const pack = boosterPacks[mod(position, count)];
  const packs: CarouselPack[] = boosterPacks.map(carouselPack);
  const owned = packCount(collection, pack.id),
    color = packs[mod(position, count)].color;
  const drag = useRef<number | null>(null);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  };
  const onDown = (event: PointerEvent) => {
    drag.current = event.clientX;
  };
  const onUp = (event: PointerEvent) => {
    if (drag.current !== null && Math.abs(event.clientX - drag.current) > 60)
      step(event.clientX < drag.current ? 1 : -1);
    drag.current = null;
  };
  return (
    <main className="store-page store-hall" aria-label={msg("Store")}>
      <section className="store-stage" style={{ "--pack-color": color } as CSSProperties}>
        <header className="store-bar">
          <h1>{msg("Store")}</h1>
          <div className="store-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "boosters"}
              onClick={() => setTab("boosters")}
            >
              {msg("Boosters")}
            </button>
            <button role="tab" aria-selected={tab === "backs"} onClick={() => setTab("backs")}>
              {msg("Card backs")}
            </button>
          </div>
        </header>
        {!saved && (
          <p className="collection-save-error" role="alert">
            {msg(
              "Your collection is available for this session. Browser storage could not save it.",
            )}
          </p>
        )}
        {tab === "backs" ? (
          <CardBacksShop crowns={collection.crowns} />
        ) : (
          <>
            <div
              className="store-carousel"
              role="group"
              aria-roledescription="carousel"
              aria-label={msg("Boosters")}
              tabIndex={0}
              onKeyDown={onKey}
              onPointerDown={onDown}
              onPointerUp={onUp}
              onDoubleClick={() => {
                if (canBuy) buy(pack);
              }}
            >
              <div className="store-pack-view" aria-hidden="true">
                {showing3d ? (
                  <SceneBoundary fallback={<FlatPack pack={pack} />}>
                    <Suspense fallback={<FlatPack pack={pack} />}>
                      <BoosterCarousel3D
                        packs={packs}
                        tagline={msg("FIVE CARDS")}
                        position={position}
                        pick={(offset) => setPosition(offset)}
                        reduced={reduced}
                      />
                    </Suspense>
                  </SceneBoundary>
                ) : (
                  <FlatPack pack={pack} />
                )}
              </div>
              {count > 1 && (
                <>
                  <button
                    className="store-arrow left"
                    aria-label={msg("Previous booster")}
                    onClick={() => step(-1)}
                  >
                    <ChevronLeft size={26} />
                  </button>
                  <button
                    className="store-arrow right"
                    aria-label={msg("Next booster")}
                    onClick={() => step(1)}
                  >
                    <ChevronRight size={26} />
                  </button>
                </>
              )}
            </div>
            <div className="store-bay-info" aria-live="polite">
              <h2>{msg(pack.name)}</h2>
              <p>{msg(pack.blurb)}</p>
              {count > 1 && (
                <div className="store-dots" aria-hidden="true">
                  {boosterPacks.map((item, index) => (
                    <i key={item.id} className={index === mod(position, count) ? "on" : ""} />
                  ))}
                </div>
              )}
              <div className="store-owned">
                <Gift size={15} />
                {owned} {msg("owned")}
                <span className="store-status" role="status">
                  {message}
                </span>
              </div>
              <div className="store-buy">
                <button
                  className="gold-button"
                  aria-label={msg("Open {v0} booster", { v0: pack.name })}
                  disabled={!owned}
                  onClick={() => open(pack)}
                >
                  <Gift size={17} />
                  {msg("Open booster")}
                </button>
                <button
                  className="outline-button store-crown-buy"
                  aria-label={msg("Buy {v0} booster for {v1} crowns", {
                    v0: pack.name,
                    v1: collectionRules.packCost,
                  })}
                  disabled={collection.crowns < collectionRules.packCost}
                  onClick={() => buy(pack)}
                >
                  {msg("Buy")}
                  <CrownAmount amount={collectionRules.packCost} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
