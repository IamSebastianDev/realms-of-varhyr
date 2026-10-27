import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { t as msg } from "@realms/ui/i18n";

/** The shared shelf of both store tabs: arrows, arrow keys, swipe and double-click around whatever the tab draws in the middle. */
export function ShelfFrame({
  label,
  count,
  index,
  setIndex,
  onActivate,
  children,
}: {
  label: string;
  count: number;
  index: number;
  setIndex: (index: number) => void;
  onActivate?: () => void;
  children: ReactNode;
}) {
  const drag = useRef<number | null>(null);
  const step = (by: number) => setIndex(Math.min(count - 1, Math.max(0, index + by)));
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  };
  const onUp = (event: PointerEvent) => {
    if (drag.current !== null && Math.abs(event.clientX - drag.current) > 60)
      step(event.clientX < drag.current ? 1 : -1);
    drag.current = null;
  };
  return (
    <div
      className="store-carousel"
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerDown={(event) => {
        drag.current = event.clientX;
      }}
      onPointerUp={onUp}
      onDoubleClick={onActivate}
    >
      <button
        className="store-arrow left"
        aria-label={msg("Previous shelf item")}
        disabled={index <= 0}
        onClick={() => step(-1)}
      >
        <ChevronLeft size={26} />
      </button>
      <button
        className="store-arrow right"
        aria-label={msg("Next shelf item")}
        disabled={index >= count - 1}
        onClick={() => step(1)}
      >
        <ChevronRight size={26} />
      </button>
      {children}
    </div>
  );
}
