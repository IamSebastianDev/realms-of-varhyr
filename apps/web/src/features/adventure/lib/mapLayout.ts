import type { NodeDef } from "@realms/adventure";

/** Shared coordinates for the models, paths and accessible HTML hit targets. */
export const mapWidth = 20;
export const mapLength = 30;
export function nodePosition(node: Pick<NodeDef, "x" | "y">): [number, number, number] {
  return [((node.x - 50) / 100) * 17.3, 0.05, ((node.y - 50) / 100) * 28];
}
export const focusPosition = (node: Pick<NodeDef, "x" | "y">) =>
  clampPan(nodePosition(node)[2] - 3);
export const clampPan = (value: number) => Math.max(-10.5, Math.min(11, value));
