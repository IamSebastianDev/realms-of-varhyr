/**
 * Dragging a card with the mouse normally leaves the card where it was and floats a faint copy beside the pointer.
 * This makes it read as picking the card up: the drag image is a solid copy of the card, held where it was grabbed,
 * and the card left behind dims to an empty slot until it is dropped or released.
 */
const LIFTED = 'drag-lifted';

export function installDragLift() {
  if (typeof document === 'undefined') return;
  let lifted: HTMLElement | null = null;
  const put = () => { lifted?.classList.remove(LIFTED); lifted = null; };

  document.addEventListener('dragstart', event => {
    const source = (event.target as Element | null)?.closest?.<HTMLElement>('[draggable="true"]');
    if (!source || !event.dataTransfer) return;
    const rect = source.getBoundingClientRect();
    const scale = rect.width / (source.offsetWidth || rect.width) || 1;
    const copy = source.cloneNode(true) as HTMLElement;
    copy.classList.add('drag-image');
    copy.style.cssText = `position:fixed;left:-9999px;top:0;width:${source.offsetWidth}px;height:${source.offsetHeight}px;margin:0;transform:scale(${scale});transform-origin:0 0;pointer-events:none`;
    document.body.appendChild(copy);
    try { event.dataTransfer.setDragImage(copy, (event.clientX - rect.left) || rect.width / 2, (event.clientY - rect.top) || rect.height / 2); } catch { /* A synthesised touch drag has no image to set. */ }
    window.setTimeout(() => copy.remove(), 0);
    // The browser snapshots the element when this handler returns, so dim it just after.
    window.requestAnimationFrame(() => { put(); lifted = source; source.classList.add(LIFTED); });
  }, true);
  document.addEventListener('dragend', put, true);
  document.addEventListener('drop', () => window.setTimeout(put, 0), true);
}
