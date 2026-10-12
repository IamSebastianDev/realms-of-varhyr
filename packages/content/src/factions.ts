import raw from './factions.json';
import type { FactionDefinition } from './factionDefinition';

/** Generated from assets/factions/*.json by `npm run import:cards`. Do not edit factions.json by hand. */
export type FactionPresentation = {
  name: string;
  short: string;
  color: string;
  symbol: string;
};
export type { FactionDefinition } from './factionDefinition';

export const factionDefinitions: readonly FactionDefinition[] = raw as FactionDefinition[];

/** Neutral is built in: cards without a named faction, paid with generic energy. */
export const neutralFaction: FactionPresentation = { name: 'Neutral', short: 'Neutral', color: '#c6c3b5', symbol: '◇' };

export const factionInfo: Record<string, FactionPresentation> = {
  ...Object.fromEntries(factionDefinitions.map(({ id, name, short, color, symbol }) => [id, { name, short, color, symbol }])),
  neutral: neutralFaction,
};

// Used by card validation and the faction filter; no second list to maintain.
export const factions: string[] = factionDefinitions.map(faction => faction.id);
