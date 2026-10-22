import { Check, Filter, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { t as msg, useLanguage } from "@realms/ui/i18n";
import { setDefinitions } from "@realms/content";
import type { CardDefinition } from "@realms/contracts";
import { BuilderDialog } from "./BuilderDialog";
import { Checkbox } from "./Checkbox";
import { factionInfo } from "@realms/content";
import { FactionIcon } from "@realms/renderer/FactionIcon";
import {
  initialBuilderFilters,
  type BuilderFilters,
  type CardRole,
  type CardSort,
} from "./deckTools";
import type { OwnedCopies } from "./collection";

export type Ownership = { owned: boolean; unowned: boolean };
export const defaultOwnership: Ownership = { owned: true, unowned: false };

/** Applies the ownership checkboxes. Owned cards keep their place ahead of unowned ones. */
export function byOwnership(cards: CardDefinition[], owned: OwnedCopies, ownership: Ownership) {
  const have = (card: CardDefinition) => (owned[card.id] ?? 0) > 0;
  return [
    ...(ownership.owned ? cards.filter(have) : []),
    ...(ownership.unowned ? cards.filter((card) => !have(card)) : []),
  ];
}

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/** A row of toggle chips. Nothing chosen means no restriction; several chosen match any of them. */
function Chips<T extends string | number>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; title?: string; icon?: React.ReactNode; tint?: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="builder-chips" role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={String(option.value)}
            aria-pressed={selected.includes(option.value)}
            title={option.title}
            style={option.tint ? { ["--tint" as string]: option.tint } : undefined}
            onClick={() => onChange(toggle(selected, option.value))}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Props = {
  filters: BuilderFilters;
  setFilters: (filters: BuilderFilters) => void;
  ownership: Ownership;
  setOwnership: (ownership: Ownership) => void;
  /** Number of cards currently shown, for the dialog's confirm button. */
  count: number;
  /** Cards that match the filters but are hidden by the ownership checkboxes. */ hidden: number;
  /** Deck building adds the "only cards I can add" filter. */ deck?: boolean;
};

/** The search field, filter button and filter dialog shared by the collection and the deck builder. */
export function CardFilterBar({
  filters,
  setFilters,
  ownership,
  setOwnership,
  count,
  hidden,
  deck,
}: Props) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const filter = <K extends keyof BuilderFilters>(key: K, value: BuilderFilters[K]) =>
    setFilters({ ...filters, [key]: value });
  const filterCount =
    (["set", "faction", "kind", "rarity", "cost", "role"] as const).filter(
      (key) => filters[key].length > 0,
    ).length +
    (filters.addable ? 1 : 0) +
    (ownership.unowned ? 1 : 0) +
    (ownership.owned ? 0 : 1);
  const reset = () => {
    setFilters({ ...initialBuilderFilters, sort: filters.sort });
    setOwnership(defaultOwnership);
  };
  return (
    <>
      <label className="collection-search">
        <Search size={15} />
        <input
          aria-label={msg("Search cards")}
          placeholder={msg("Search cards…")}
          value={filters.query}
          onChange={(event) => filter("query", event.target.value)}
        />
      </label>
      <button
        ref={trigger}
        className="builder-small-button filter-trigger"
        onClick={() => setOpen(true)}
        aria-label={msg("Open card filters")}
      >
        <Filter size={14} />
        <span>{msg("Filters")}</span>
        {filterCount > 0 && <b>{filterCount}</b>}
      </button>
      {(filters.query || filterCount > 0) && (
        <button
          className="builder-icon-button"
          aria-label={msg("Clear filters")}
          title={msg("Clear filters")}
          onClick={reset}
        >
          <X size={15} />
        </button>
      )}
      {open && (
        <BuilderDialog
          title={msg("Card filters")}
          origin={trigger.current}
          close={() => setOpen(false)}
        >
          <div className="builder-filter-chips">
            <Chips
              label={msg("Set")}
              selected={filters.set}
              onChange={(next) => filter("set", next)}
              options={setDefinitions.map((set) => ({ value: set.id, label: msg(set.name) }))}
            />
            <Chips
              label={msg("Faction")}
              selected={filters.faction}
              onChange={(next) => filter("faction", next)}
              options={Object.entries(factionInfo).map(([id, info]) => ({
                value: id,
                label: msg(info.name),
                icon: <FactionIcon faction={id} />,
                tint: info.color,
              }))}
            />
            <Chips
              label={msg("Type")}
              selected={filters.kind}
              onChange={(next) => filter("kind", next)}
              options={[
                { value: "creature", label: msg("Creatures") },
                { value: "spell", label: msg("Spells") },
                { value: "holding", label: msg("Holdings") },
              ]}
            />
            <Chips<CardRole>
              label={msg("Role")}
              selected={filters.role}
              onChange={(next) => filter("role", next)}
              options={[
                { value: "producers", label: msg("Energy producers") },
                { value: "free-producers", label: msg("Free producers") },
              ]}
            />
            <Chips
              label={msg("Rarity")}
              selected={filters.rarity}
              onChange={(next) => filter("rarity", next)}
              options={[
                { value: "common", label: msg("Common") },
                { value: "rare", label: msg("Rare") },
                { value: "legendary", label: msg("Legendary") },
              ]}
            />
            <Chips
              label={msg("Cost")}
              selected={filters.cost}
              onChange={(next) => filter("cost", next)}
              options={[0, 1, 2, 3, 4, 5, 6].map((cost) => ({
                value: cost,
                label: cost === 6 ? "6+" : String(cost),
                title: msg("Cost {v0}", { v0: cost === 6 ? "6 or more" : cost }),
              }))}
            />
            <label className="builder-filter-sort">
              {msg("Sort cards")}
              <select
                aria-label={msg("Sort cards")}
                value={filters.sort}
                onChange={(event) => filter("sort", event.target.value as CardSort)}
              >
                <option value="faction">{msg("Faction, cost, name")}</option>
                <option value="cost">{msg("Cost: low to high")}</option>
                <option value="name">{msg("Name: A–Z")}</option>
                <option value="attack">{msg("Attack: high to low")}</option>
                <option value="defense">{msg("Defense: high to low")}</option>
              </select>
            </label>
          </div>
          <Checkbox
            className="builder-limit-filter"
            checked={ownership.owned}
            onChange={(event) => setOwnership({ ...ownership, owned: event.target.checked })}
          >
            {msg("Show cards I own")}
          </Checkbox>
          <Checkbox
            className="builder-limit-filter"
            checked={ownership.unowned}
            onChange={(event) => setOwnership({ ...ownership, unowned: event.target.checked })}
          >
            {msg("Show cards I don’t own")}
            {hidden > 0 && !ownership.unowned && msg(" ({v0} hidden)", { v0: hidden })}
          </Checkbox>
          {deck && (
            <Checkbox
              className="builder-limit-filter"
              checked={filters.addable}
              onChange={(event) => filter("addable", event.target.checked)}
            >
              {msg("Only cards I can add")}
            </Checkbox>
          )}
          <div className="builder-dialog-actions">
            <button className="outline-button" onClick={reset}>
              {msg("Reset filters")}
            </button>
            <button className="gold-button" onClick={() => setOpen(false)}>
              {msg("Show")} {count} {msg("cards")}
              <Check size={15} />
            </button>
          </div>
        </BuilderDialog>
      )}
    </>
  );
}
