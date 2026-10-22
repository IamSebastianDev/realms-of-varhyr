/**
 * Cards are dragged as bodies, not as the browser's faint drag image. A press on a `draggable` element (a short move
 * with the mouse, a long press with a finger) lifts a copy of it that follows the pointer on a spring, leans into the
 * direction it is pulled, and either settles into the target it is dropped on or flies back to where it came from.
 *
 * The existing handlers still see the usual dragstart / dragenter / dragover / drop / dragend sequence, so the deck
 * builder, drafts and quests work unchanged.
 */
const HOLD_MS = 220,
  SLOP = 8,
  MOUSE_SLOP = 4;
type Pending = { id: number; x: number; y: number; source: HTMLElement; kind: string };
type Drag = {
  source: HTMLElement;
  transfer: DataTransfer;
  ghost: HTMLElement;
  target: Element | null;
  x: number;
  y: number;
  holder: HTMLElement;
  grab: { x: number; y: number };
  cx: number;
  cy: number;
  rot: number;
  tilt: number;
  scale: number;
  raf: number;
  origin: DOMRect;
};
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
const still = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function fire(type: string, target: Element, transfer: DataTransfer, x: number, y: number) {
  let event: Event;
  try {
    event = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      dataTransfer: transfer,
    });
  } catch {
    event = new Event(type, { bubbles: true, cancelable: true });
  }
  if (!(event as DragEvent).dataTransfer)
    Object.defineProperty(event, "dataTransfer", { value: transfer });
  return target.dispatchEvent(event); // false when a handler called preventDefault, i.e. the target accepts the drop
}

export function installTouchDrag() {
  if (typeof document === "undefined") return;
  let timer = 0,
    pending: Pending | null = null,
    drag: Drag | null = null,
    swallowClick = 0;

  const block = (event: Event) => {
    if (drag) event.preventDefault();
  };
  const pose = (d: Drag) => {
    d.ghost.style.transform = `translate(${d.cx}px,${d.cy}px) perspective(700px) rotateX(${d.tilt}deg) rotate(${d.rot}deg) scale(${d.scale})`;
  };
  // The card trails the pointer on a spring; how fast it moves decides how far it leans.
  const frame = () => {
    const d = drag;
    if (!d) return;
    const goalX = d.x - d.grab.x,
      goalY = d.y - d.grab.y;
    if (still()) {
      d.cx = goalX;
      d.cy = goalY;
      d.rot = 0;
      d.tilt = 0;
      d.scale = 1.04;
    } else {
      const nextX = d.cx + (goalX - d.cx) * 0.3,
        nextY = d.cy + (goalY - d.cy) * 0.3;
      const vx = nextX - d.cx,
        vy = nextY - d.cy;
      d.cx = nextX;
      d.cy = nextY;
      d.rot += (clamp(vx * 0.6, 9) - d.rot) * 0.22;
      d.tilt += (clamp(-vy * 0.5, 6) - d.tilt) * 0.22;
      d.scale += (1.07 - d.scale) * 0.18;
    }
    pose(d);
    d.raf = requestAnimationFrame(frame);
  };
  const move = (x: number, y: number) => {
    if (!drag) return;
    drag.x = x;
    drag.y = y;
    const under =
      document.elementsFromPoint(x, y).find((element) => !drag!.ghost.contains(element)) ?? null;
    if (under !== drag.target) {
      if (drag.target) fire("dragleave", drag.target, drag.transfer, x, y);
      drag.target = under;
      if (under) fire("dragenter", under, drag.transfer, x, y);
    }
    if (under) fire("dragover", under, drag.transfer, x, y);
  };
  const land = (d: Drag, accepted: boolean, to: DOMRect | null) => {
    cancelAnimationFrame(d.raf);
    const done = () => {
      d.holder.remove();
      d.source.removeAttribute("data-lifted");
    };
    const from = d.ghost.style.transform;
    if (still()) return done();
    const keyframes =
      accepted && to
        ? [
            { transform: from, opacity: 1 },
            {
              transform: `translate(${to.left + to.width / 2 - d.grab.x}px,${to.top + to.height / 2 - d.grab.y}px) scale(.35)`,
              opacity: 0,
            },
          ]
        : [
            { transform: from },
            { transform: `translate(${d.origin.left}px,${d.origin.top}px) scale(1)` },
          ];
    const animation = d.ghost.animate(
      keyframes,
      accepted
        ? { duration: 170, easing: "ease-in", fill: "forwards" }
        : { duration: 300, easing: "cubic-bezier(.2,1.25,.4,1)", fill: "forwards" },
    );
    animation.onfinish = done;
    animation.oncancel = done;
  };
  const finish = (drop: boolean) => {
    window.clearTimeout(timer);
    pending = null;
    if (!drag) return;
    const current = drag;
    drag = null;
    document.documentElement.removeAttribute("data-touch-dragging");
    let accepted = false;
    if (
      drop &&
      current.target &&
      !fire("dragover", current.target, current.transfer, current.x, current.y)
    ) {
      fire("drop", current.target, current.transfer, current.x, current.y);
      accepted = true;
    } else if (current.target)
      fire("dragleave", current.target, current.transfer, current.x, current.y);
    fire("dragend", current.source, current.transfer, current.x, current.y);
    land(current, accepted, current.target?.getBoundingClientRect() ?? null);
    swallowClick = performance.now() + 450;
  };
  const start = () => {
    if (!pending) return;
    const { source, x, y, kind } = pending;
    pending = null;
    const transfer = new DataTransfer();
    if (fire("dragstart", source, transfer, x, y) === false && !transfer.types.length) return; // The handler refused the drag.
    const rect = source.getBoundingClientRect(),
      ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.className += " touch-drag-ghost";
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    const grab = { x: x - rect.left, y: y - rect.top };
    ghost.style.transformOrigin = `${grab.x}px ${grab.y}px`;
    // Card styles are scoped to where the card lives (".deck-workshop .art-card"), so the copy is wrapped in boxless
    // copies of its ancestors to keep them applying.
    let holder: HTMLElement = ghost;
    for (
      let parent = source.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      const wrap = document.createElement("div");
      for (const attribute of parent.getAttributeNames())
        if (attribute !== "id" && attribute !== "style")
          wrap.setAttribute(attribute, parent.getAttribute(attribute)!);
      wrap.style.cssText = parent.getAttribute("style") ?? "";
      wrap.style.display = "contents";
      wrap.appendChild(holder);
      holder = wrap;
    }
    document.body.appendChild(holder);
    source.setAttribute("data-lifted", "");
    document.documentElement.setAttribute("data-touch-dragging", "");
    drag = {
      source,
      transfer,
      ghost,
      holder,
      target: null,
      x,
      y,
      grab,
      cx: rect.left,
      cy: rect.top,
      rot: 0,
      tilt: 0,
      scale: 1,
      raf: 0,
      origin: rect,
    };
    if (kind === "touch") navigator.vibrate?.(8);
    pose(drag);
    drag.raf = requestAnimationFrame(frame);
    move(x, y);
  };

  document.addEventListener(
    "pointerdown",
    (event) => {
      const touch = event.pointerType === "touch";
      if (!event.isPrimary || drag || (!touch && event.button !== 0)) return;
      const source = (event.target as Element).closest<HTMLElement>('[draggable="true"]');
      if (!source) return;
      pending = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        source,
        kind: touch ? "touch" : "mouse",
      };
      window.clearTimeout(timer);
      if (touch) timer = window.setTimeout(start, HOLD_MS);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (pending && event.pointerId === pending.id) {
        const far = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
        if (pending.kind === "mouse") {
          if (far > MOUSE_SLOP) start();
        } else if (far > SLOP) {
          window.clearTimeout(timer);
          pending = null;
          return;
        }
      }
      if (drag) move(event.clientX, event.clientY);
    },
    true,
  );
  document.addEventListener(
    "pointerup",
    () => {
      window.clearTimeout(timer);
      pending = null;
      finish(true);
    },
    true,
  );
  document.addEventListener("pointercancel", () => finish(false), true);
  // While a card is held, the page must not scroll, and the browser's own drag or context menu must stay out of the way.
  window.addEventListener("touchmove", block, { passive: false });
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (pending || drag) event.preventDefault();
    },
    true,
  );
  document.addEventListener(
    "dragstart",
    (event) => {
      if (!event.isTrusted) return;
      if (pending || drag) {
        event.preventDefault();
        if (pending?.kind === "mouse") start();
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      if (performance.now() < swallowClick) {
        event.stopPropagation();
        event.preventDefault();
      }
    },
    true,
  );
}
