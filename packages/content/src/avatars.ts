import raw from './avatars.json';

/** A selectable player portrait. Authored by hand in avatars.json; the first entry is the default. */
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
