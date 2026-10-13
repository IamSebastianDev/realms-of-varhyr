import raw from './factions.json';
import { neutralId, type FactionDefinition } from './factionDefinition';

/** Generated from assets/factions/*.json by `npm run import:cards`. Do not edit factions.json by hand. */
export type FactionPresentation = {
  name: string;
  short: string;
  color: string;
  signatureAbility?: string;
};
export type { FactionDefinition } from './factionDefinition';

export const factionDefinitions: readonly FactionDefinition[] = raw as FactionDefinition[];

const present = ({ name, short, color, signatureAbility }: FactionDefinition): FactionPresentation => ({ name, short, color, ...(signatureAbility ? { signatureAbility } : {}) });
// Neutral is a faction file like the others, listed last in filters.
export const factionInfo: Record<string, FactionPresentation> = Object.fromEntries([
  ...factionDefinitions.filter(faction => faction.id !== neutralId),
  ...factionDefinitions.filter(faction => faction.id === neutralId),
].map(faction => [faction.id, present(faction)]));

// Named factions only. Neutral is not a faction for costs, energy types or card validation.
export const factions: string[] = factionDefinitions.map(faction => faction.id).filter(id => id !== neutralId);
