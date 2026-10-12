/** Add your test factions here. Neutral cards have no named faction; neutral energy pays generic costs. */
export type FactionPresentation = {
  name: string;
  short: string;
  color: string;
  symbol: string;
};

export const factionInfo: Record<string, FactionPresentation> = {
  crownlands: {
    name: 'The Crownlands',
    short: 'Crown',
    color: '#deb966',
    symbol: '♜',
  },
  // Example second faction. Uncomment and rename when ready:
  // 'your-faction': { name: 'Your faction', short: 'Short name', color: '#83c3a4', symbol: '❧' },
  neutral: {
    name: 'Neutral',
    short: 'Neutral',
    color: '#c6c3b5',
    symbol: '◇',
  },
};

// Used by card validation and the faction filter; no second list to maintain.
export const factions = Object.keys(factionInfo).filter(id => id !== 'neutral');
