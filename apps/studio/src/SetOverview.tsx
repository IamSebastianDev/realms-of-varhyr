import { useMemo, useState } from 'react';
import { factionInfo, setDefinitions } from '../../../packages/content/src';
import { groupOf, setStats, type Filters, type Stored } from './model';

const short = (id: string) => (factionInfo[id]?.name ?? id).replace(/^The /, '');
const label = (id: string) => id.split('+').map(short).join(' + ');
/** One dot per faction in the row; a hybrid shows its factions side by side. */
export const FactionDots = ({ members, fallback }: { members: string[]; fallback?: string }) => <span className="dots">{(members.length ? members : [fallback ?? 'neutral']).map(id => <i key={id} className="dot" style={{ background: factionInfo[id]?.color }}/>)}</span>;

const types = ['creature', 'spell', 'holding'] as const;
const typeName: Record<string, string> = { creature: 'Creatures', spell: 'Spells', holding: 'Holdings' };
const rarityName: Record<string, string> = { common: 'Common', rare: 'Rare', legendary: 'Legendary' };
const rarities = ['legendary', 'rare', 'common'] as const;
const average = (value: number) => value.toFixed(1);

/** How a set is shaping up: how many cards, of what kind, for whom, at what cost, and what is still unfinished. */
export function SetOverview({ cards, set, faction, onSet, onFaction, onOpen, onCreate }: { cards: Stored[]; set: string; faction: string | null; onSet: (id: string) => void; onFaction: (id: string | null) => void; onOpen: (filters: Partial<Filters>) => void; onCreate: (where: { set: string; faction?: string }) => void }) {
  const ids = useMemo(() => [...new Set([...setDefinitions.map(definition => definition.id), ...cards.map(card => card.data.set as string)])].filter(Boolean), [cards]);
  const current = ids.includes(set) ? set : ids[0];
  const definition = setDefinitions.find(entry => entry.id === current);
  const factionOrder = useMemo(() => Object.keys(factionInfo).filter(id => id !== 'neutral'), []);
  const inSet = useMemo(() => cards.filter(card => card.data.set === current), [cards, current]);
  const scoped = useMemo(() => faction ? inSet.filter(card => groupOf(card.data, factionOrder) === faction) : inSet, [inSet, faction, factionOrder]);
  const stats = useMemo(() => setStats(scoped, factionOrder), [scoped, factionOrder]);
  /** What the figures and tables below open in the card list: this set, narrowed to the chosen faction. */
  const scope: Partial<Filters> = faction ? { set: current, faction } : { set: current };
  const tallest = Math.max(1, ...stats.curve.map(bucket => Object.values(bucket).reduce((sum, n) => sum + n, 0)));
  const widest = Math.max(1, ...stats.factions.map(row => row.total));
  const [curveBy, setCurveBy] = useState<'type' | 'rarity'>('type');
  const parts = curveBy === 'type' ? types : rarities;
  const count = (id: string) => cards.filter(card => card.data.set === id).length;

  return <main className="studio-sets">
    <div className="set-tabs" role="tablist" aria-label="Sets">
      {ids.map(id => <button key={id} role="tab" aria-selected={id === current} className={id === current ? 'on' : ''} onClick={() => { onFaction(null); onSet(id); }}>
        {setDefinitions.find(entry => entry.id === id)?.name ?? id}<small>{count(id)}</small></button>)}
    </div>

    <header className="set-head">
      {faction && <button className="link back" onClick={() => onFaction(null)}>← {definition?.name ?? current}</button>}
      <h2>{faction ? <><FactionDots members={faction === 'neutral' ? [] : faction.split('+')} fallback={faction}/>{label(faction)}</> : definition?.name ?? current}</h2>
      <p>{faction ? `${stats.total} ${stats.total === 1 ? 'card' : 'cards'} of this ${faction.includes('+') ? 'hybrid' : 'faction'} in ${definition?.name ?? current}.` : definition?.description ?? 'This set has no definition file yet. Add assets/sets/' + current + '.json.'}</p>
      <div className="set-actions"><button onClick={() => onOpen(scope)}>Show these cards</button>
        <button className="primary" onClick={() => onCreate({ set: current, faction: faction ?? '' })}>{faction ? `New ${label(faction)} card` : 'New card in this set'}</button></div>
    </header>

    <div className="set-figures">
      <div><strong>{stats.total}</strong><span>cards</span></div>
      {!faction && <button onClick={() => onOpen({ set: current, faction: 'hybrid' })}><strong>{stats.hybrids}</strong><span>hybrids</span></button>}
      {types.map(type => <button key={type} onClick={() => onOpen({ ...scope, type })}><strong>{stats.type[type] ?? 0}</strong><span>{typeName[type].toLowerCase()}</span></button>)}
      {(['common', 'rare', 'legendary'] as const).map(rarity => <button key={rarity} onClick={() => onOpen({ ...scope, rarity })}><strong>{stats.rarity[rarity] ?? 0}</strong><span>{rarityName[rarity].toLowerCase()}</span></button>)}
    </div>

    <section aria-label="Type by rarity">
      <h3>Type by rarity</h3>
      <table className="set-table narrow"><thead><tr><th>Type</th>{rarities.map(rarity => <th key={rarity}>{rarityName[rarity]}</th>)}<th className="gap">Total</th></tr></thead><tbody>
        {types.map(type => <tr key={type}><th scope="row"><button className="link" onClick={() => onOpen({ ...scope, type })}>{typeName[type]}</button></th>
          {rarities.map(rarity => <td key={rarity} className={stats.typeRarity[type][rarity] ? '' : 'zero'}><button className="cell" onClick={() => onOpen({ ...scope, type, rarity })}>{stats.typeRarity[type][rarity]}</button></td>)}
          <td className="gap total">{stats.type[type] ?? 0}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row">Whole set</th>{rarities.map(rarity => <td key={rarity}>{stats.rarity[rarity] ?? 0}</td>)}<td className="gap total">{stats.total}</td></tr></tfoot></table>
      {stats.creatures.count > 0 && <p className="studio-hint">Average creature: costs {average(stats.creatures.cost)}, {average(stats.creatures.attack)} Attack, {average(stats.creatures.defense)} Defense, {average(stats.creatures.output)} energy per turn ({stats.creatures.count} creatures).</p>}
    </section>

    {!faction && <section aria-label="Cards per faction">
      <h3>By faction</h3>
      <table className="set-table"><thead><tr><th>Faction</th><th title="Legendary">Leg.</th><th>Rare</th><th>Common</th><th className="gap">Creatures</th><th>Spells</th><th>Holdings</th><th className="gap" title="Creatures that cost nothing">Free</th><th className="gap">Total</th><th className="gap" title="Hybrid cards that include this faction. They are counted in the hybrid rows below, not in this row.">Hybrid</th><th/><th/></tr></thead><tbody>
        {stats.factions.map(row => {
          const free = row.free.common + row.free.rare + row.free.legendary;
          const cell = (value: number, extra = '') => <td className={`${value ? '' : 'zero'} ${extra}`}>{value}</td>;
          return <tr key={row.id}>
            <th scope="row"><button className="link" onClick={() => onFaction(row.id)}><FactionDots members={row.members} fallback={row.id}/>{row.members.length ? row.members.map(short).join(' + ') : short(row.id)}</button></th>
            {cell(row.rarity.legendary)}{cell(row.rarity.rare)}{cell(row.rarity.common)}
            {types.map((type, index) => cell(row[type], index === 0 ? 'gap' : ''))}
            {cell(free, 'gap')}
            {cell(row.total, 'gap total')}
            {row.members.length === 1 ? cell(stats.hybridIn[row.id] ?? 0, 'gap') : <td className="gap"/>}
            <td className="bar"><span style={{ width: `${(row.total / widest) * 100}%`, background: factionInfo[row.id]?.color }}/></td>
            <td className="add"><button className="quiet" aria-label={`New ${row.members.length ? row.members.map(short).join(' + ') : short(row.id)} card in ${definition?.name ?? current}`} title="New card" onClick={() => onCreate({ set: current, faction: row.id })}>+</button></td>
          </tr>;
        })}
      </tbody>
        <tfoot><tr><th scope="row">Whole set</th>
          {(['legendary', 'rare', 'common'] as const).map(rarity => <td key={rarity}>{stats.factions.reduce((sum, row) => sum + row.rarity[rarity], 0)}</td>)}
          {types.map((type, index) => <td key={type} className={index === 0 ? 'gap' : ''}>{stats.factions.reduce((sum, row) => sum + row[type], 0)}</td>)}
          <td className="gap">{stats.factions.reduce((sum, row) => sum + row.free.common + row.free.rare + row.free.legendary, 0)}</td>
          <td className="gap total">{stats.total}</td><td className="gap">{stats.hybrids || ''}</td><td/><td/></tr></tfoot></table>
    </section>}

    <section aria-label="Cost curve">
      <h3>Cost curve</h3>
      <div className="seg" role="group" aria-label="Colour the curve by"><button className={curveBy === 'type' ? 'on' : ''} aria-pressed={curveBy === 'type'} onClick={() => setCurveBy('type')}>By type</button><button className={curveBy === 'rarity' ? 'on' : ''} aria-pressed={curveBy === 'rarity'} onClick={() => setCurveBy('rarity')}>By rarity</button></div>
      <div className="curve" role="img" aria-label={`Cards by total cost: ${stats.curve.map((bucket, cost) => `${cost}: ${Object.values(bucket).reduce((sum, n) => sum + n, 0)}`).join(', ')}`}>
        {stats.curve.map((bucket, cost) => {
          const total = Object.values(bucket).reduce((sum, n) => sum + n, 0);
          return <div key={cost} className="col"><span className="n">{total || ''}</span>
            <div className="stack" style={{ height: `${(total / tallest) * 100}%` }}>{parts.map(part => { const n = curveBy === 'type' ? bucket[part] : stats.curveRarity[cost][part as typeof rarities[number]]; return n ? <span key={part} className={`t-${part}`} style={{ flexGrow: n }} title={`${n} ${(curveBy === 'type' ? typeName[part] : rarityName[part]).toLowerCase()}`}/> : null; })}</div>
            <span className="x">{cost === stats.curveMax ? `${cost}+` : cost}</span></div>;
        })}
      </div>
      <p className="legend">{parts.map(part => <span key={part}><i className={`sw t-${part}`}/>{curveBy === 'type' ? typeName[part] : rarityName[part]}</span>)}</p>
    </section>

    <section aria-label="Unfinished cards">
      <h3>Still to do</h3>
      {stats.missingArt.length || stats.missingGerman.length ? <ul className="todo">
        {stats.missingArt.length > 0 && <li><button className="link" onClick={() => onOpen({ ...scope, show: 'no-art' })}>{stats.missingArt.length} without art</button><span>{stats.missingArt.slice(0, 6).join(', ')}{stats.missingArt.length > 6 ? '…' : ''}</span></li>}
        {stats.missingGerman.length > 0 && <li><button className="link" onClick={() => onOpen({ ...scope, show: 'no-german' })}>{stats.missingGerman.length} with German text missing</button><span>{stats.missingGerman.slice(0, 6).join(', ')}{stats.missingGerman.length > 6 ? '…' : ''}</span></li>}
      </ul> : <p className="studio-hint">Every card in this set has art and German text.</p>}
    </section>
  </main>;
}
