/**
 * Touch screens do not fire HTML5 drag events, so every `draggable` card would be undraggable on a phone.
 * This adapter turns a long press on a draggable element into the same dragstart / dragover / drop / dragend
 * sequence a mouse produces, so the existing handlers (deck builder, drafts, quests) work unchanged.
 */
const HOLD_MS = 220, SLOP = 8;
type Drag = { source: HTMLElement; transfer: DataTransfer; ghost: HTMLElement; target: Element | null; x: number; y: number };

function fire(type: string, target: Element, transfer: DataTransfer, x: number, y: number) {
  let event: Event;
  try { event = new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: transfer }); }
  catch { event = new Event(type, { bubbles: true, cancelable: true }); }
  if (!(event as DragEvent).dataTransfer) Object.defineProperty(event, 'dataTransfer', { value: transfer });
  return target.dispatchEvent(event); // false when a handler called preventDefault, i.e. the target accepts the drop
}

export function installTouchDrag() {
  if (typeof document === 'undefined' || !('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;
  let timer = 0, pending: { id: number; x: number; y: number; source: HTMLElement } | null = null, drag: Drag | null = null, swallowClick = 0;

  const block = (event: Event) => { if (drag) event.preventDefault(); };
  const move = (x: number, y: number) => {
    if (!drag) return;
    drag.x = x; drag.y = y;
    drag.ghost.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(.7)`;
    const under = document.elementsFromPoint(x, y).find(element => !drag!.ghost.contains(element)) ?? null;
    if (under !== drag.target) {
      if (drag.target) fire('dragleave', drag.target, drag.transfer, x, y);
      drag.target = under;
      if (under) fire('dragenter', under, drag.transfer, x, y);
    }
    if (under) fire('dragover', under, drag.transfer, x, y);
  };
  const finish = (drop: boolean) => {
    window.clearTimeout(timer); pending = null;
    if (!drag) return;
    const current = drag; drag = null;
    current.ghost.remove();
    document.documentElement.removeAttribute('data-touch-dragging');
    if (drop && current.target && !fire('dragover', current.target, current.transfer, current.x, current.y)) fire('drop', current.target, current.transfer, current.x, current.y);
    else if (current.target) fire('dragleave', current.target, current.transfer, current.x, current.y);
    fire('dragend', current.source, current.transfer, current.x, current.y);
    swallowClick = performance.now() + 450;
  };
  const start = () => {
    if (!pending) return;
    const { source, x, y } = pending; pending = null;
    const transfer = new DataTransfer();
    if (fire('dragstart', source, transfer, x, y) === false && !transfer.types.length) return; // The handler refused the drag.
    const rect = source.getBoundingClientRect(), ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id'); ghost.setAttribute('aria-hidden', 'true'); ghost.className += ' touch-drag-ghost';
    ghost.style.width = `${rect.width}px`; ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    document.documentElement.setAttribute('data-touch-dragging', '');
    drag = { source, transfer, ghost, target: null, x, y };
    navigator.vibrate?.(8);
    move(x, y);
  };

  document.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !event.isPrimary || drag) return;
    const source = (event.target as Element).closest<HTMLElement>('[draggable="true"]');
    if (!source) return;
    pending = { id: event.pointerId, x: event.clientX, y: event.clientY, source };
    window.clearTimeout(timer); timer = window.setTimeout(start, HOLD_MS);
  }, true);
  document.addEventListener('pointermove', event => {
    if (pending && event.pointerId === pending.id && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > SLOP) { window.clearTimeout(timer); pending = null; return; }
    if (drag) move(event.clientX, event.clientY);
  }, true);
  document.addEventListener('pointerup', () => finish(true), true);
  document.addEventListener('pointercancel', () => finish(false), true);
  // While a card is held, the page must not scroll, and the browser's own drag or context menu must stay out of the way.
  window.addEventListener('touchmove', block, { passive: false });
  document.addEventListener('contextmenu', event => { if (pending || drag) event.preventDefault(); }, true);
  document.addEventListener('dragstart', event => { if (event.isTrusted && (pending || drag)) event.preventDefault(); }, true);
  document.addEventListener('click', event => { if (performance.now() < swallowClick) { event.stopPropagation(); event.preventDefault(); } }, true);
}
