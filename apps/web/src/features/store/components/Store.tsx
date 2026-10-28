import { useState, type CSSProperties } from "react";
import { Gift } from "lucide-react";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { boosterPacks, type BoosterPack } from "@realms/content/boosters";
import {
  boosterPrice,
  collectionRules,
  packCount,
  type Collection,
} from "../../collection/lib/collection";
import { CrownAmount } from "../../../components/Crowns";
import { ShelfFrame } from "./ShelfFrame";
import { CardBacksShop } from "./CardBacksShop";
import packArt from "../../../../../../assets/boosters/store-pack.webp";
import stackArt from "../../../../../../assets/boosters/store-stack.webp";
import "../styles/store.css";

/** The two offers as pictures, rendered once from the booster model: one pack, and ten piled up. */
const offerArt = [packArt, stackArt];

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
  const [position, setPosition] = useState(0);
  const offer = offers[position]!,
    pack = base,
    price = boosterPrice(offer.count);
  const owned = packCount(collection, pack.id),
    color = pack.color;
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
                {offers.map((entry, index) => (
                  <img
                    key={entry.count}
                    className={`store-pack-art ${index === position ? "" : "side"} ${reduced ? "still" : ""}`}
                    onClick={() => setPosition(index)}
                    src={offerArt[index]}
                    alt=""
                    decoding="async"
                    draggable={false}
                    style={
                      {
                        "--slot": index - position,
                        "--near": Math.min(1, Math.abs(index - position)),
                      } as CSSProperties
                    }
                  />
                ))}
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
