import { Component, type ReactNode } from "react";
import { t as msg } from "@realms/ui/i18n";
import type { BoosterPack } from "@realms/content/boosters";
import { factionIconPaths } from "@realms/renderer/factionIcons";
import type { CarouselPack, PackSymbol, PackVariant } from "./BoosterPack3D";
import hearthArt from "../../../../../../assets/boosters/hearth-and-crown.webp";
import wandererArt from "../../../../../../assets/boosters/wanderers-road.webp";
import darkArt from "../../../../../../assets/boosters/gathering-dark.webp";
import model from "../../../../../../assets/boosters/pack-c.glb?url";

/** One authored model for every pack; the artwork and small code-driven variations tell them apart. */
const packLook: Record<string, { art?: string; variant: PackVariant }> = {
  "hearth-and-crown": {
    art: hearthArt,
    variant: { width: 1, height: 1, thin: 1, seal: "ribs", finish: "matte" },
  },
  "wanderers-road": {
    art: wandererArt,
    variant: { width: 1, height: 1, thin: 1, seal: "zigzag", finish: "matte" },
  },
  "gathering-dark": {
    art: darkArt,
    variant: { width: 1, height: 1, thin: 1, seal: "teeth", finish: "matte" },
  },
};
const crownPath = ["M18 43 15.5 25l9 8 7.5-14 7.5 14 9-8L46 43H18Z"];

/** The pack face is painted from plain data: the icon of the pack's lead faction. */
function symbolFor(pack: BoosterPack): PackSymbol {
  return {
    paths: factionIconPaths[pack.icon] ?? crownPath,
    box: factionIconPaths[pack.icon] ? 24 : 64,
  };
}

export function carouselPack(pack: BoosterPack): CarouselPack {
  const look = packLook[pack.id];
  return {
    id: pack.id,
    name: msg(pack.name),
    color: pack.color,
    symbol: symbolFor(pack),
    model,
    art: look?.art,
    variant: look?.variant ?? { width: 1, height: 1, thin: 1, seal: "ribs", finish: "matte" },
  };
}

/** A pack that belongs to no store: the shared model with a generated face and one mark on it, a faction's emblem or a question mark. */
export function proceduralPack(
  id: string,
  name: string,
  color: string,
  mark: string | null,
): CarouselPack {
  const paths = mark ? factionIconPaths[mark] : undefined;
  return {
    id,
    name,
    color,
    symbol: paths ? { paths, box: 24 } : { text: "?" },
    model,
    variant: { width: 1, height: 1, thin: 1, seal: "ribs", finish: "matte" },
  };
}

/** WebGL can be missing or refuse a context; callers keep a flat fallback. */
export const hasWebGL = (() => {
  try {
    return (
      !!document.createElement("canvas").getContext("webgl2") ||
      !!document.createElement("canvas").getContext("webgl")
    );
  } catch {
    return false;
  }
})();

export class SceneBoundary extends Component<
  { fallback: ReactNode; onError?: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D booster unavailable:", error);
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Loads the 3D code, the booster model and the pack artwork once the app starts, so no pack pops in later. */
let packsLoading: Promise<void> | null = null;
export function preloadPacks(): Promise<void> {
  if (!hasWebGL) return Promise.resolve();
  packsLoading ??= Promise.all([
    import("./BoosterPack3D"),
    import("./BoosterBurst3D"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("@react-three/fiber"),
  ])
    .then(async ([pack, , { GLTFLoader }, { useLoader }]) => {
      await Promise.all(
        Object.values(packLook)
          .filter((look) => look.art)
          .map((look) => pack.loadArt(look.art!)),
      );
      useLoader.preload(GLTFLoader, model);
      await fetch(model)
        .then((response) => response.blob())
        .catch(() => {});
    })
    .catch(() => {
      /* The packs still load on demand. */
    });
  return packsLoading;
}
