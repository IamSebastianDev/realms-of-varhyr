import { ArrowLeft } from "lucide-react";
import { FactionIcon } from "@realms/renderer/FactionIcon";
import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react";
import { localizedCard, t as msg, useLanguage } from "@realms/ui/i18n";
import { factionInfo, registry, setDefinitions, setInfo } from "@realms/content";
import type { CardDefinition } from "@realms/contracts";
import { totalPacks, type Collection } from "../lib/collection";
import { cardCost, collectionStats, type StatSlice } from "../lib/collectionBreakdown";

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const typeNames: Record<string, string> = {
  creature: "Creatures",
  spell: "Spells",
  holding: "Holdings",
};

function Row({ label, slice, color }: { label: ReactNode; slice: StatSlice; color?: string }) {
  return (
    <li className="stat-row" style={color ? ({ "--tint": color } as CSSProperties) : undefined}>
      <span className="stat-label">{label}</span>
      <span
        className="stat-bar"
        role="img"
        aria-label={msg("{v0} of {v1} cards", { v0: slice.unique, v1: slice.uniqueTotal })}
      >
        <i style={{ width: `${percent(slice.unique, slice.uniqueTotal)}%` }} />
      </span>
      <b className="stat-value">
        {slice.unique}
        <span>/{slice.uniqueTotal}</span>
      </b>
      <small className="stat-copies">
        {slice.copies}/{slice.copiesTotal} {msg("copies")}
      </small>
    </li>
  );
}

export function CollectionStats({
  collection,
  inspect,
  back,
}: {
  collection: Collection;
  inspect: (card: CardDefinition) => void;
  back: () => void;
}) {
  useLanguage();
  const stats = useMemo(
    () =>
      collectionStats(
        collection.counts,
        registry,
        Object.keys(factionInfo),
        setDefinitions.map((set) => set.id),
      ),
    [collection.counts],
  );
  // The ring fills in once on arrival; reduced motion removes the transition in CSS.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const share = percent(stats.unique, stats.uniqueTotal),
    circumference = 2 * Math.PI * 84;
  const peak = Math.max(1, ...stats.curve.map((bucket) => bucket.uniqueTotal));
  const facts: [string, number, string?][] = [
    [msg("Copies owned"), stats.copies, `/${stats.copiesTotal}`],
    [msg("Complete playsets"), stats.playsets, `/${stats.uniqueTotal}`],
    [msg("Boosters opened"), collection.boostersOpened],
    [msg("Victories"), collection.rewardedMatches.length],
    [msg("Boosters waiting"), totalPacks(collection)],
  ];
  return (
    <main className="stats-page">
      <div className="collection-heading collection-subhead">
        <button
          className="builder-icon-button"
          aria-label={msg("Back to collection")}
          title={msg("Back to collection")}
          onClick={back}
        >
          <ArrowLeft size={16} />
        </button>
        <h1>{msg("Statistics")}</h1>
      </div>
      <section className="stats-hero" aria-label={msg("Collection progress")}>
        <div
          className="stats-ring"
          role="img"
          aria-label={msg("{v0} of {v1} cards", { v0: stats.unique, v1: stats.uniqueTotal })}
        >
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <linearGradient
                id="stats-ring-chrome"
                gradientUnits="userSpaceOnUse"
                x1="20"
                y1="20"
                x2="180"
                y2="180"
              >
                <stop offset="0" stopColor="#e5d29f" />
                <stop offset=".5" stopColor="#6b5527" />
                <stop offset="1" stopColor="#cfae6a" />
              </linearGradient>
              <linearGradient
                id="stats-ring-bronze"
                gradientUnits="userSpaceOnUse"
                x1="20"
                y1="20"
                x2="180"
                y2="180"
              >
                <stop offset="0" stopColor="#e3c780" />
                <stop offset="1" stopColor="#b58f46" />
              </linearGradient>
            </defs>
            <circle className="ring-track" cx="100" cy="100" r="84" />
            <circle
              className="ring-fill"
              cx="100"
              cy="100"
              r="84"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - (ready ? share : 0) / 100)}
              transform="rotate(-90 100 100)"
            />
            <circle className="ring-edge" cx="100" cy="100" r="88.5" />
            <circle className="ring-edge" cx="100" cy="100" r="79.5" />
          </svg>
          <div>
            <strong>
              {share}
              <small>%</small>
            </strong>
            <span>{msg("discovered")}</span>
          </div>
        </div>
        <div className="stats-hero-body">
          <h2>{msg("{v0} of {v1} cards", { v0: stats.unique, v1: stats.uniqueTotal })}</h2>
          <dl className="stats-facts">
            {facts.map(([label, value, of]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {value}
                  {of && <span>{of}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <div className="stats-grid">
        <section className="stats-panel" aria-label={msg("By set")}>
          <h2>{msg("By set")}</h2>
          <ul>
            {stats.bySet.map((slice) => (
              <Row
                key={slice.id}
                slice={slice}
                label={
                  <>
                    {msg(setInfo[slice.id]?.name ?? slice.id)}
                    {setInfo[slice.id]?.code && (
                      <small className="stat-set-code">{setInfo[slice.id].code}</small>
                    )}
                  </>
                }
              />
            ))}
          </ul>
        </section>
        <section className="stats-panel" aria-label={msg("By faction")}>
          <h2>{msg("By faction")}</h2>
          <ul>
            {stats.byFaction.map((slice) => (
              <Row
                key={slice.id}
                slice={slice}
                color={factionInfo[slice.id]?.color}
                label={
                  <>
                    <FactionIcon faction={slice.id} />
                    {msg(factionInfo[slice.id]?.name ?? slice.id)}
                  </>
                }
              />
            ))}
          </ul>
        </section>
        <section className="stats-panel" aria-label={msg("By rarity")}>
          <h2>{msg("By rarity")}</h2>
          <ul>
            {stats.byRarity.map((slice) => (
              <Row
                key={slice.id}
                slice={slice}
                label={msg(slice.id).replace(/^./u, (c) => c.toLocaleUpperCase())}
                color={
                  slice.id === "legendary" ? "#e6b45a" : slice.id === "rare" ? "#8fb8d8" : "#b8c4b0"
                }
              />
            ))}
          </ul>
        </section>
        <section className="stats-panel" aria-label={msg("By type")}>
          <h2>{msg("By type")}</h2>
          <ul>
            {stats.byType.map((slice) => (
              <Row key={slice.id} slice={slice} label={msg(typeNames[slice.id] ?? slice.id)} />
            ))}
          </ul>
        </section>
        <section className="stats-panel stats-curve" aria-label={msg("Cost curve")}>
          <h2>{msg("Cost curve")}</h2>
          <p className="stats-note">
            {msg("Cards you own at each total cost. The outline shows every card in the game.")}
          </p>
          <ol>
            {stats.curve.map((bucket) => (
              <li
                key={bucket.cost}
                title={msg("Cost {v0}: {v1} of {v2} cards", {
                  v0: bucket.cost,
                  v1: bucket.unique,
                  v2: bucket.uniqueTotal,
                })}
              >
                <span
                  className="curve-column"
                  style={{ height: `${Math.max(4, (bucket.uniqueTotal / peak) * 100)}%` }}
                >
                  <span className="curve-count">
                    {bucket.unique}
                    <small>/{bucket.uniqueTotal}</small>
                  </span>
                  <i style={{ height: `${percent(bucket.unique, bucket.uniqueTotal)}%` }} />
                </span>
                <span className="curve-cost">{bucket.cost}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="stats-panel stats-missing" aria-label={msg("Still missing")}>
          <h2>
            {msg("Still missing")}
            <small>{stats.missing.length}</small>
          </h2>
          {stats.missing.length ? (
            <ul>
              {stats.missing.map((card) => (
                <li key={card.id}>
                  <button className={`rarity-${card.rarity}`} onClick={() => inspect(card)}>
                    <span>{localizedCard(card).name}</span>
                    <small>{cardCost(card)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="stats-note">{msg("Every card is yours.")}</p>
          )}
        </section>
      </div>
    </main>
  );
}
