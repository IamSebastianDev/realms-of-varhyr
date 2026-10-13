import raw from './avatars.json';

/** A selectable player portrait. Authored by hand in avatars.json; display order is the faction grid. */
export type AvatarDefinition = {
  id: string;
  name: string;
  /** Epithet shown under the name. */
  title: string;
  lore: string;
  /** Ring colour around the portrait. */
  accent: string;
  /** Public URL of the portrait image. */
  art: string;
  /** The original file in assets/avatars this was made from. */
  source?: string;
};

export const avatarDefinitions: readonly AvatarDefinition[] = raw as AvatarDefinition[];

/** Independent of display order: the neutral hero occupies the center of the grid. */
export const defaultAvatarId = 'the-lonely-wanderer';
