/**
 * Stable aliases for cards renamed during the prototype. Keep these here rather
 * than in game rules: they only migrate browser storage authored under an
 * earlier content catalogue.
 */
const aliases: Record<string, string> = {
  'crown-bastion': 'crown-holding',
  'crown-bulwark': 'crown-holding',
};

export const currentCardId = (id: string) => aliases[id] ?? id;
export const currentCardIds = (ids: readonly string[]) => ids.map(currentCardId);
