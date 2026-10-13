import { FactionIcon } from '../../../packages/renderer/src/FactionIcon';
import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react';
import { localizedCard, t as msg, useLanguage } from './i18n';
import { factionInfo, registry } from '../../../packages/content/src';
import type { CardDefinition } from '../../../packages/contracts/src';
import { totalPacks, type Collection } from './collection';
import { cardCost, collectionStats, type StatSlice } from './collectionBreakdown';

const percent = (part: number, whole: number) => whole ? Math.round(part / whole * 100) : 0;
const typeNames: Record<string, string> = { creature: 'Creatures', spell: 'Spells', bastion: 'Bastions' };

function Row({ label, slice, color }: { label: ReactNode; slice: StatSlice; color?: string }) {
  return <li className="stat-row" style={color ? { '--tint': color } as CSSProperties : undefined}>
    <span className="stat-label">{label}</span>
    <span className="stat-bar" role="img" aria-label={msg("{v0} of {v1} cards", { v0: slice.unique, v1: slice.uniqueTotal })}><i style={{ width: `${percent(slice.unique, slice.uniqueTotal)}%` }}/></span>
    <b className="stat-value">{slice.unique}<span>/{slice.uniqueTotal}</span></b>
    <small className="stat-copies">{slice.copies}/{slice.copiesTotal} {msg("copies")}</small>
  </li>;
}

export function CollectionStats({ collection, inspect }: { collection: Collection; inspect: (card: CardDefinition) => void }) {
  useLanguage();
  const stats = useMemo(() => collectionStats(collection.counts, registry, Object.keys(factionInfo)), [collection.counts]);
  // The ring fills in once on arrival; reduced motion removes the transition in CSS.
  const [ready, setReady] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(frame); }, []);
  const share = percent(stats.unique, stats.uniqueTotal), circumference = 2 * Math.PI * 52;
  const peak = Math.max(1, ...stats.curve.map(bucket => bucket.uniqueTotal));
  const facts: [string, number, string?][] = [
    [msg("Copies owned"), stats.copies, `/${stats.copiesTotal}`],
    [msg("Complete playsets"), stats.playsets, `/${stats.uniqueTotal}`],
    [msg("Boosters opened"), collection.boostersOpened],
    [msg("Victories"), collection.rewardedMatches.length],
    [msg("Boosters waiting"), totalPacks(collection)],
  ];
  return <main className="stats-page">
    <div className="collection-heading"><div><h1>{msg("Statistics")}</h1></div></div>
    <section className="stats-hero" aria-label={msg("Collection progress")}>
      <div className="stats-ring" role="img" aria-label={msg("{v0} of {v1} cards", { v0: stats.unique, v1: stats.uniqueTotal })}>
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="ring-track" cx="60" cy="60" r="52"/><circle className="ring-fill" cx="60" cy="60" r="52" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - (ready ? share : 0) / 100)} transform="rotate(-90 60 60)"/></svg>
        <div><strong>{share}<small>%</small></strong><span>{msg("discovered")}</span></div>
      </div>
      <div className="stats-hero-body">
        <h2>{msg("{v0} of {v1} cards", { v0: stats.unique, v1: stats.uniqueTotal })}</h2>
        <dl className="stats-facts">{facts.map(([label, value, of]) => <div key={label}><dt>{label}</dt><dd>{value}{of && <span>{of}</span>}</dd></div>)}</dl>
      </div>
    </section>
    <div className="stats-grid">
      <section className="stats-panel" aria-label={msg("By faction")}><h2>{msg("By faction")}</h2>
        <ul>{stats.byFaction.map(slice => <Row key={slice.id} slice={slice} color={factionInfo[slice.id]?.color} label={<><FactionIcon faction={slice.id}/>{msg(factionInfo[slice.id]?.name ?? slice.id)}</>}/>)}</ul>
      </section>
      <section className="stats-panel" aria-label={msg("By rarity")}><h2>{msg("By rarity")}</h2>
        <ul>{stats.byRarity.map(slice => <Row key={slice.id} slice={slice} label={msg(slice.id).replace(/^./u,c=>c.toLocaleUpperCase())} color={slice.id === 'legendary' ? '#e6b45a' : slice.id === 'rare' ? '#8fb8d8' : '#b8c4b0'}/>)}</ul>
      </section>
      <section className="stats-panel" aria-label={msg("By type")}><h2>{msg("By type")}</h2>
        <ul>{stats.byType.map(slice => <Row key={slice.id} slice={slice} label={msg(typeNames[slice.id] ?? slice.id)}/>)}</ul>
      </section>
      <section className="stats-panel stats-curve" aria-label={msg("Cost curve")}><h2>{msg("Cost curve")}</h2>
        <p className="stats-note">{msg("Cards you own at each total cost. The outline shows every card in the game.")}</p>
        <ol>{stats.curve.map(bucket => <li key={bucket.cost} title={msg("Cost {v0}: {v1} of {v2} cards", { v0: bucket.cost, v1: bucket.unique, v2: bucket.uniqueTotal })}>
          <span className="curve-column" style={{ height: `${Math.max(4, bucket.uniqueTotal / peak * 100)}%` }}><span className="curve-count">{bucket.unique}<small>/{bucket.uniqueTotal}</small></span><i style={{ height: `${percent(bucket.unique, bucket.uniqueTotal)}%` }}/></span>
          <span className="curve-cost">{bucket.cost}</span>
        </li>)}</ol>
      </section>
      <section className="stats-panel stats-missing" aria-label={msg("Still missing")}><h2>{msg("Still missing")}<small>{stats.missing.length}</small></h2>
        {stats.missing.length ? <ul>{stats.missing.map(card => <li key={card.id}><button className={`rarity-${card.rarity}`} onClick={() => inspect(card)}><span>{localizedCard(card).name}</span><small>{cardCost(card)}</small></button></li>)}</ul> : <p className="stats-note">{msg("Every card is yours.")}</p>}
      </section>
    </div>
  </main>;
}
