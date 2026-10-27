import { lazy, Suspense, useState, type CSSProperties } from "react";
import { Crown, Gift } from "lucide-react";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { boosterPacks, type BoosterPack } from "@realms/content/boosters";
import {
  boosterPrice,
  collectionRules,
  packCount,
  type Collection,
} from "../../collection/lib/collection";
import { CrownAmount } from "../../../components/Crowns";
import { packLines, packSymbol } from "../../boosters/components/BoosterOpening";
import type { CarouselPack } from "../../boosters/components/BoosterPack3D";
import { ShelfFrame } from "./ShelfFrame";
import { CardBacksShop } from "./CardBacksShop";
import { carouselPack, hasWebGL, SceneBoundary } from "../../boosters/components/packScene";
import "../styles/store.css";

const BoosterCarousel3D = lazy(() => import("../../boosters/components/BoosterPack3D"));

function FlatPack({ pack, stack = 1 }: { pack: BoosterPack; stack?: number }) {
  return (
    <div
      className="booster-pack store-pack"
      style={
        stack > 1
          ? {
              boxShadow:
                "14px 10px 0 -2px rgb(var(--shade-rgb) / 0.5), 28px 20px 0 -4px rgb(var(--shade-rgb) / 0.3)",
            }
          : undefined
      }
    >
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
  buy: (pack: BoosterPack, count: number) => void;
};

/** One window-sized inset: the wallet on top, an endless carousel of boosters, and the focused booster to buy. */
export function Store({ collection, saved, message, reduced, buy }: Props) {
  useLanguage();
  // The store offers the one booster, and ten of them piled up at the bundle price.
  const base = boosterPacks[0]!;
  const offers = [
    { count: 1, title: base.name, blurb: base.blurb },
    {
      count: collectionRules.packBundle.count,
      title: msg("{v0}× {v1}", { v0: collectionRules.packBundle.count, v1: msg(base.name) }),
      blurb: msg("Ten boosters for {v0} crowns: one of them free.", {
        v0: collectionRules.packBundle.cost,
      }),
    },
  ];
  const [tab, setTab] = useState<"boosters" | "backs">("boosters");
  const [position, setPosition] = useState(0),
    [showing3d] = useState(hasWebGL);
  const offer = offers[position]!,
    pack = base,
    price = boosterPrice(offer.count);
  const packs: CarouselPack[] = offers.map((entry) => ({
    ...carouselPack(base),
    id: `${base.id}-${entry.count}`,
    stack: entry.count > 1 ? entry.count : undefined,
  }));
  const owned = packCount(collection, pack.id),
    color = packs[position].color;
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
            <ShelfFrame
              label={msg("Boosters")}
              count={offers.length}
              index={position}
              setIndex={setPosition}
              onActivate={() => {
                if (collection.crowns >= price) buy(pack, offer.count);
              }}
            >
              <div className="store-pack-view" aria-hidden="true">
                {showing3d ? (
                  <SceneBoundary fallback={<FlatPack pack={pack} stack={offer.count} />}>
                    <Suspense fallback={<FlatPack pack={pack} stack={offer.count} />}>
                      <BoosterCarousel3D
                        packs={packs}
                        tagline={msg("FIVE CARDS")}
                        position={position}
                        pick={setPosition}
                        reduced={reduced}
                        linear
                      />
                    </Suspense>
                  </SceneBoundary>
                ) : (
                  <FlatPack pack={pack} stack={offer.count} />
                )}
              </div>
            </ShelfFrame>
            <div className="store-bay-info" aria-live="polite">
              <h2>{msg(offer.title)}</h2>
              <p>{msg(offer.blurb)}</p>
              <div className="store-owned">
                <Gift size={15} />
                {owned} {msg("owned")}
                <span className="store-status" role="status">
                  {message}
                </span>
              </div>
              <div className="store-buy">
                <button
                  className="outline-button store-crown-buy"
                  aria-label={msg("Buy {v0} for {v1} crowns", {
                    v0:
                      offer.count === 1
                        ? msg("1 booster")
                        : msg("{v0} boosters", { v0: offer.count }),
                    v1: price,
                  })}
                  disabled={collection.crowns < price}
                  onClick={() => buy(pack, offer.count)}
                >
                  {msg("Buy")}
                  <CrownAmount amount={price} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
