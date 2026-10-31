import type { AdventureDef, NodeType } from "@realms/adventure";

export const adventureNodeTypes: NodeType[] = [
  "battle",
  "elite",
  "event",
  "shop",
  "improve",
  "final",
];
export const adventureMediaRoot = "/adventures/shared";
export const engravingUrls = adventureNodeTypes.map(
  (type) => `${adventureMediaRoot}/engraving/${type}.svg`,
);
export const mapTextureUrls = (def: AdventureDef) => [
  `${adventureMediaRoot}/textures/wood-color.webp`,
  `${adventureMediaRoot}/textures/wood-normal.webp`,
  def.mapArt
    ? `/adventures/${def.id}/${def.mapArt}.webp`
    : `${adventureMediaRoot}/textures/parchment.webp`,
  ...engravingUrls,
];
export const adventureArtworkUrls = (def: AdventureDef) => [
  ...mapTextureUrls(def),
  ...[
    def.art,
    ...def.events.map((event) => event.art),
    ...def.events.flatMap((event) => event.beats.map((beat) => beat.art)),
    ...def.enemies.map((enemy) => enemy.art),
  ]
    .filter((name): name is string => Boolean(name))
    .map((name) => `/adventures/${def.id}/${name}.webp`),
];
