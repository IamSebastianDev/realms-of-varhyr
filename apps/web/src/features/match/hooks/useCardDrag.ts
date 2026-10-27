import { toStageX, toStageY } from "@realms/ui/stage";
import { useEffect, useRef, useState } from "react";

export type CardDrag = { cardId: string; x: number; y: number };
/** Drag positions are stage px, like the board layout they are hit-tested against. */
/** The parts of a pointer-down event the drag needs; React DOM events and R3F native events both satisfy it. */
export type DragStartEvent = {
  button: number;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;
  currentTarget?: EventTarget | null;
};
type PointerDrag = CardDrag & {
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  pointerType: string;
  element: HTMLElement | null;
};

export function useCardDrag(
  enabled: boolean,
  revision: number,
  onDrop: (drag: CardDrag) => void,
  onStart: () => void,
) {
  const [drag, setDrag] = useState<CardDrag | null>(null);
  const pointer = useRef<PointerDrag | null>(null),
    suppressUntil = useRef(0);
  const callbacks = useRef({ onDrop, onStart });
  callbacks.current = { onDrop, onStart };
  function finish(drop: boolean) {
    const current = pointer.current;
    pointer.current = null;
    setDrag(null);
    if (!current) return;
    if (current.element?.hasPointerCapture(current.pointerId))
      current.element.releasePointerCapture(current.pointerId);
    if (current.active) {
      suppressUntil.current = Date.now() + 400;
      if (drop) callbacks.current.onDrop(current);
    }
  }
  useEffect(() => {
    function move(event: PointerEvent) {
      const current = pointer.current;
      if (!current || event.pointerId !== current.pointerId) return;
      current.x = toStageX(event.clientX);
      current.y = toStageY(event.clientY);
      if (
        !current.active &&
        current.pointerType === "touch" &&
        Math.abs(current.x - current.startX) > Math.abs(current.y - current.startY)
      )
        return;
      if (
        !current.active &&
        Math.hypot(current.x - current.startX, current.y - current.startY) >= 7
      ) {
        current.active = true;
        callbacks.current.onStart();
      }
      if (current.active) {
        event.preventDefault();
        setDrag({ cardId: current.cardId, x: current.x, y: current.y });
      }
    }
    function up(event: PointerEvent) {
      if (event.pointerId !== pointer.current?.pointerId) return;
      pointer.current.x = toStageX(event.clientX);
      pointer.current.y = toStageY(event.clientY);
      finish(true);
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") finish(false);
    }
    const cancel = () => finish(false);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
      finish(false);
    };
  }, []);
  useEffect(() => {
    finish(false);
  }, [enabled, revision]);
  function start(cardId: string, event: DragStartEvent) {
    if (!enabled || event.button !== 0 || !event.isPrimary) return;
    const element = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    pointer.current = {
      cardId,
      x: toStageX(event.clientX),
      y: toStageY(event.clientY),
      startX: toStageX(event.clientX),
      startY: toStageY(event.clientY),
      pointerId: event.pointerId,
      active: false,
      pointerType: event.pointerType,
      element,
    };
    element?.setPointerCapture(event.pointerId);
  }
  return { drag, start, suppressClick: () => Date.now() < suppressUntil.current };
}
