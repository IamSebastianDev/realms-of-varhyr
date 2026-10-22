import type { DragEvent } from "react";

/**
 * What the drafts are dragging. The data is also put on the event's DataTransfer for mouse drags, but a touch drag is
 * synthesised and some phone browsers drop the data on the way, so the drop targets read it from here first.
 */
let held: { kind: string; value: string } | null = null;

export function holdDrag(event: DragEvent, kind: string, value: string, mime = "text/plain") {
  held = { kind, value };
  event.dataTransfer.setData(mime, value);
  event.dataTransfer.effectAllowed = "move";
}
export const heldDrag = (kind: string): string | null => (held?.kind === kind ? held.value : null);
export const releaseDrag = () => {
  held = null;
};
