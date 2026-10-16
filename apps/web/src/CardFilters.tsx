import { Check, Filter, Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { t as msg, useLanguage } from '../../../packages/ui/src/i18n';
import { setDefinitions } from '../../../packages/content/src';
import type { CardDefinition } from '../../../packages/contracts/src';
import { BuilderDialog } from './BuilderDialog';
import { Checkbox } from './Checkbox';
import { FactionSelect } from './FactionSelect';
import { initialBuilderFilters, type BuilderFilters, type CardSort } from './deckTools';
import type { OwnedCopies } from './collection';

export type Ownership = { owned: boolean; unowned: boolean };
export const defaultOwnership: Ownership = { owned: true, unowned: false };

/** Applies the ownership checkboxes. Owned cards keep their place ahead of unowned ones. */
export function byOwnership(cards: CardDefinition[], owned: OwnedCopies, ownership: Ownership) {
  const have = (card: CardDefinition) => (owned[card.id] ?? 0) > 0;
  return [...(ownership.owned ? cards.filter(have) : []), ...(ownership.unowned ? cards.filter(card => !have(card)) : [])];
}

type Props = {
  filters: BuilderFilters; setFilters: (filters: BuilderFilters) => void; ownership: Ownership; setOwnership: (ownership: Ownership) => void;
  /** Number of cards currently shown, for the dialog's confirm button. */
  count: number; /** Cards that match the filters but are hidden by the ownership checkboxes. */ hidden: number;
  /** Deck building adds the "only cards I can add" filter. */ deck?: boolean;
};

/** The search field, filter button and filter dialog shared by the collection and the deck builder. */
export function CardFilterBar({ filters, setFilters, ownership, setOwnership, count, hidden, deck }: Props) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const filter = <K extends keyof BuilderFilters>(key: K, value: BuilderFilters[K]) => setFilters({ ...filters, [key]: value });
  const filterCount = Object.entries(filters).filter(([key, value]) => value !== initialBuilderFilters[key as keyof BuilderFilters] && key !== 'sort' && key !== 'query').length + (ownership.unowned ? 1 : 0) + (ownership.owned ? 0 : 1);
  const reset = () => { setFilters({ ...initialBuilderFilters, sort: filters.sort }); setOwnership(defaultOwnership); };
  return <>
    <label className="collection-search"><Search size={15}/><input aria-label={msg("Search cards")} placeholder={msg("Search cards…")} value={filters.query} onChange={event => filter('query', event.target.value)}/></label>
    <button ref={trigger} className="builder-small-button filter-trigger" onClick={() => setOpen(true)} aria-label={msg("Open card filters")}><Filter size={14}/><span>{msg("Filters")}</span>{filterCount > 0 && <b>{filterCount}</b>}</button>
    {(filters.query || filterCount > 0) && <button className="builder-icon-button" aria-label={msg("Clear filters")} title={msg("Clear filters")} onClick={reset}><X size={15}/></button>}
    {open && <BuilderDialog title={msg("Card filters")} origin={trigger.current} close={() => setOpen(false)}>
      <div className="builder-filter-dialog-grid">
        <label>{msg("Set")}<select aria-label={msg("Filter by set")} value={filters.set} onChange={event => filter('set', event.target.value)}><option value="all">{msg("All sets")}</option>{setDefinitions.map(set => <option key={set.id} value={set.id}>{msg(set.name)}</option>)}</select></label>
        <label>{msg("Faction")}<FactionSelect aria-label={msg("Filter by faction")} value={filters.faction} onChange={event => filter('faction', event.target.value)}/></label>
        <label>{msg("Type")}<select aria-label={msg("Filter by card type")} value={filters.kind} onChange={event => filter('kind', event.target.value)}><option value="all">{msg("All types")}</option><option value="creature">{msg("Creatures")}</option><option value="spell">{msg("Spells")}</option><option value="holding">{msg("Holdings")}</option></select></label>
        <label>{msg("Role")}<select aria-label={msg("Filter by role")} value={filters.role} onChange={event => filter('role', event.target.value as BuilderFilters['role'])}><option value="all">{msg("All roles")}</option><option value="producers">{msg("Energy producers")}</option><option value="free-producers">{msg("Free producers")}</option></select></label>
        <label>{msg("Rarity")}<select aria-label={msg("Filter by rarity")} value={filters.rarity} onChange={event => filter('rarity', event.target.value)}><option value="all">{msg("All rarities")}</option><option value="common">{msg("Common")}</option><option value="rare">{msg("Rare")}</option><option value="legendary">{msg("Legendary")}</option></select></label>
        <label className="builder-filter-sort">{msg("Sort cards")}<select aria-label={msg("Sort cards")} value={filters.sort} onChange={event => filter('sort', event.target.value as CardSort)}><option value="faction">{msg("Faction, cost, name")}</option><option value="cost">{msg("Cost: low to high")}</option><option value="name">{msg("Name: A–Z")}</option><option value="attack">{msg("Attack: high to low")}</option><option value="defense">{msg("Defense: high to low")}</option></select></label>
      </div>
      <div className="builder-cost-filter" role="group" aria-label={msg("Filter by total energy cost")}><span>{msg("Cost")}</span><button aria-pressed={filters.cost === null} onClick={() => filter('cost', null)}>{msg("All")}</button>{[0, 1, 2, 3, 4, 5, 6].map(cost => <button key={cost} aria-label={msg("Cost {v0}", { v0: cost === 6 ? '6 or more' : cost })} aria-pressed={filters.cost === cost} onClick={() => filter('cost', filters.cost === cost ? null : cost)}>{cost === 6 ? '6+' : cost}</button>)}</div>
      <Checkbox className="builder-limit-filter" checked={ownership.owned} onChange={event => setOwnership({ ...ownership, owned: event.target.checked })}>{msg("Show cards I own")}</Checkbox>
      <Checkbox className="builder-limit-filter" checked={ownership.unowned} onChange={event => setOwnership({ ...ownership, unowned: event.target.checked })}>{msg("Show cards I don’t own")}{hidden > 0 && !ownership.unowned && msg(" ({v0} hidden)", { v0: hidden })}</Checkbox>
      {deck && <Checkbox className="builder-limit-filter" checked={filters.addable} onChange={event => filter('addable', event.target.checked)}>{msg("Only cards I can add")}</Checkbox>}
      <div className="builder-dialog-actions"><button className="outline-button" onClick={reset}>{msg("Reset filters")}</button><button className="gold-button" onClick={() => setOpen(false)}>{msg("Show")}{' '}{count} {msg("cards")}<Check size={15}/></button></div>
    </BuilderDialog>}
  </>;
}
