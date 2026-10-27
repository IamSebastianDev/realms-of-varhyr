import { useSyncExternalStore } from "react";

/**
 * The game is drawn on a fixed-size stage (apps/web installs it) that is scaled to fit the window; everything around it is black.
 * Pointer events and getBoundingClientRect() report window pixels, while layout inside the stage is in stage pixels.
 * Code that turns one into the other goes through here. Without a stage (the card studio) every helper is the identity.
 */
export type StageGeometry = {
  /** Window pixels per stage pixel. */
  scale: number;
  /** Window position of the stage's top-left corner. */
  left: number;
  top: number;
  /** Size in stage pixels. */
  width: number;
  height: number;
};
export type StageRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

let geometry: StageGeometry = { scale: 1, left: 0, top: 0, width: 0, height: 0 };
let active = false;
const listeners = new Set<() => void>();

export function setStageGeometry(next: StageGeometry) {
  const same =
    active &&
    next.scale === geometry.scale &&
    next.left === geometry.left &&
    next.top === geometry.top &&
    next.width === geometry.width &&
    next.height === geometry.height;
  if (same) return;
  active = true;
  geometry = next;
  for (const listener of listeners) listener();
}
export const stageGeometry = (): StageGeometry => geometry;
export function subscribeStage(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
export const useStageGeometry = () => useSyncExternalStore(subscribeStage, stageGeometry);

/** Size of the area layout happens in: the stage, or the window where there is none. */
export const stageWidth = () => (active ? geometry.width : window.innerWidth);
export const stageHeight = () => (active ? geometry.height : window.innerHeight);
export const stageScale = () => (active ? geometry.scale : 1);

/** A window x or y coordinate (pointer position, rect edge) as a stage coordinate. */
export const toStageX = (x: number) => (active ? (x - geometry.left) / geometry.scale : x);
export const toStageY = (y: number) => (active ? (y - geometry.top) / geometry.scale : y);
/** A distance in window pixels as stage pixels. */
export const toStageLength = (length: number) => (active ? length / geometry.scale : length);
export function toStageRect(rect: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): StageRect {
  const left = toStageX(rect.left),
    top = toStageY(rect.top),
    right = toStageX(rect.right),
    bottom = toStageY(rect.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
/** The element's box in stage pixels. */
export const rectOf = (element: Element): StageRect => toStageRect(element.getBoundingClientRect());

/** Where dialogs and drag ghosts attach so they are drawn, and scaled, with the game. */
export const stageRoot = (): HTMLElement =>
  (typeof document !== "undefined" && document.getElementById("stage")) || document.body;
/** rectOf for something that may not be mounted. */
export const maybeRectOf = (element: Element | null | undefined): StageRect | undefined =>
  element ? rectOf(element) : undefined;
