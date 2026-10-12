/** Starter deck IDs must be stable; names and card counts can be edited freely. */
export type StarterDeck = { id: string; name: string; cards: string[] };

const copies = (id: string, count: number) => Array<string>(count).fill(id);

export const starterDefinitions: StarterDeck[] = [
  {
    id: 'crown',
    name: 'Banners of the Crown',
    // Deliberately unfinished until more test content is added (30-card minimum).
    cards: [
      // Energy producers
      ...copies('goldfield-farmer', 3),
      ...copies('longvale-cutters', 3),
      ...copies('merchant-of-tris-vale', 1),
      ...copies('crown-recruit', 3),

      // Support
      ...copies('dawn-banner', 3),
      ...copies('ban-vale-cavalry', 3),

      // Spells
      ...copies('cleansing-light', 3),
      ...copies('battlefield-hymn', 3),

      // Tanks
      ...copies('runeguard', 3),
      ...copies('crown-bastion', 3),
      ...copies('tower-of-the-first-morning', 1),

      // Aggro Hero
      ...copies('aldric-runewarden', 1),
    ],
  },
];

export const defaultDeckId = starterDefinitions[0].id;
export const starterDecks: Record<string, string[]> = Object.fromEntries(
  starterDefinitions.map(deck => [deck.id, deck.cards]),
);
