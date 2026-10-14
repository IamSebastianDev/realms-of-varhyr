import { useMemo } from 'react';
import { factionInfo, setDefinitions } from '../../../packages/content/src';
import { setStats, type Filters, type Stored } from './model';

const short = (id: string) => (factionInfo[id]?.name ?? id).replace(/^The /, '');
/** One dot per faction in the row; a hybrid shows its factions side by side. */
export const FactionDots = ({ members, fallback }: { members: string[]; fallback?: string }) => <span className="dots">{(members.length ? members : [fallback ?? 'neutral']).map(id => <i key={id} className="dot" style={{ background: factionInfo[id]?.color }}/>)}</span>;

const types = ['creature', 'spell', 'holding'] as const;
const typeName: Record<string, string> = { creature: 'Creatures', spell: 'Spells', holding: 'Holdings' };
const rarityName: Record<string, string> = { common: 'Common', rare: 'Rare', legendary: 'Legendary' };

/** How a set is shaping up: how many cards, of what kind, for whom, at what cost, and what is still unfinished. */
export function SetOverview({ cards, set, onSet, onOpen, onCreate }: { cards: Stored[]; set: string; onSet: (id: string) => void; onOpen: (filters: Partial<Filters>) => void; onCreate: (where: { set: string; faction?: string }) => void }) {
  const ids = useMemo(() => [...new Set([...setDefinitions.map(definition => definition.id), ...cards.map(card => card.data.set as string)])].filter(Boolean), [cards]);
  const current = ids.includes(set) ? set : ids[0];
  const definition = setDefinitions.find(entry => entry.id === current);
  const inSet = useMemo(() => cards.filter(card => card.data.set === current), [cards, current]);
  const stats = useMemo(() => setStats(inSet, Object.keys(factionInfo).filter(id => id !== 'neutral')), [inSet]);
  const tallest = Math.max(1, ...stats.curve.map(bucket => Object.values(bucket).reduce((sum, n) => sum + n, 0)));
  const widest = Math.max(1, ...stats.factions.map(row => row.total));
  const count = (id: string) => cards.filter(card => card.data.set === id).length;

  return <main className="studio-sets">
    <div className="set-tabs" role="tablist" aria-label="Sets">
      {ids.map(id => <button key={id} role="tab" aria-selected={id === current} className={id === current ? 'on' : ''} onClick={() => onSet(id)}>
        {setDefinitions.find(entry => entry.id === id)?.name ?? id}<small>{count(id)}</small></button>)}
    </div>

    <header className="set-head">
      <h2>{definition?.name ?? current}</h2>
      <p>{definition?.description ?? 'This set has no definition file yet. Add assets/sets/' + current + '.json.'}</p>
      <div className="set-actions"><button onClick={() => onOpen({ set: current })}>Show these cards</button>
        <button className="primary" onClick={() => onCreate({ set: current, faction: '' })}>New card in this set</button></div>
    </header>

    <div className="set-figures">
      <div><strong>{stats.total}</strong><span>cards</span></div>
      <button onClick={() => onOpen({ set: current, faction: 'hybrid' })}><strong>{stats.hybrids}</strong><span>hybrids</span></button>
      {types.map(type => <button key={type} onClick={() => onOpen({ set: current, type })}><strong>{stats.type[type] ?? 0}</strong><span>{typeName[type].toLowerCase()}</span></button>)}
      {(['common', 'rare', 'legendary'] as const).map(rarity => <button key={rarity} onClick={() => onOpen({ set: current, rarity })}><strong>{stats.rarity[rarity] ?? 0}</strong><span>{rarityName[rarity].toLowerCase()}</span></button>)}
    </div>

    <section aria-label="Cards per faction">
      <h3>By faction</h3>
      <table className="set-table"><thead><tr><th>Faction</th><th title="Legendary">Leg.</th><th>Rare</th><th>Common</th><th className="gap">Creatures</th><th>Spells</th><th>Holdings</th><th className="gap" title="Creatures that cost nothing">Free</th><th className="gap">Total</th><th className="gap" title="Hybrid cards that include this faction. They are counted in the hybrid rows below, not in this row.">Hybrid</th><th/><th/></tr></thead><tbody>
        {stats.factions.map(row => {
          const free = row.free.common + row.free.rare + row.free.legendary;
          const cell = (value: number, extra = '') => <td className={`${value ? '' : 'zero'} ${extra}`}>{value}</td>;
          return <tr key={row.id}>
            <th scope="row"><button className="link" onClick={() => onOpen({ set: current, faction: row.id })}><FactionDots members={row.members} fallback={row.id}/>{row.members.length ? row.members.map(short).join(' + ') : short(row.id)}</button></th>
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
    </section>

    <section aria-label="Cost curve">
      <h3>Cost curve</h3>
      <div className="curve" role="img" aria-label={`Cards by total cost: ${stats.curve.map((bucket, cost) => `${cost}: ${Object.values(bucket).reduce((sum, n) => sum + n, 0)}`).join(', ')}`}>
        {stats.curve.map((bucket, cost) => {
          const total = Object.values(bucket).reduce((sum, n) => sum + n, 0);
          return <div key={cost} className="col"><span className="n">{total || ''}</span>
            <div className="stack" style={{ height: `${(total / tallest) * 100}%` }}>{types.map(type => bucket[type] ? <span key={type} className={`t-${type}`} style={{ flexGrow: bucket[type] }} title={`${bucket[type]} ${typeName[type].toLowerCase()}`}/> : null)}</div>
            <span className="x">{cost === stats.curveMax ? `${cost}+` : cost}</span></div>;
        })}
      </div>
      <p className="legend">{types.map(type => <span key={type}><i className={`sw t-${type}`}/>{typeName[type]}</span>)}</p>
    </section>

    <section aria-label="Unfinished cards">
      <h3>Still to do</h3>
      {stats.missingArt.length || stats.missingGerman.length ? <ul className="todo">
        {stats.missingArt.length > 0 && <li><button className="link" onClick={() => onOpen({ set: current, show: 'no-art' })}>{stats.missingArt.length} without art</button><span>{stats.missingArt.slice(0, 6).join(', ')}{stats.missingArt.length > 6 ? '…' : ''}</span></li>}
        {stats.missingGerman.length > 0 && <li><button className="link" onClick={() => onOpen({ set: current, show: 'no-german' })}>{stats.missingGerman.length} with German text missing</button><span>{stats.missingGerman.slice(0, 6).join(', ')}{stats.missingGerman.length > 6 ? '…' : ''}</span></li>}
      </ul> : <p className="studio-hint">Every card in this set has art and German text.</p>}
    </section>
  </main>;
}
