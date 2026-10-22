import { t as msg, useLanguage } from "@realms/ui/i18n";
import { useEffect, useState, type ReactNode } from "react";
import { Eye } from "lucide-react";

/** A modal backdrop that can be set aside to look at the battlefield before deciding.
 * The dialog stays mounted, so nothing in it is lost; Escape or the button brings it back. */
export function PeekBackdrop({
  className = "",
  back,
  children,
}: {
  className?: string;
  back: string;
  children: ReactNode;
}) {
  useLanguage();
  const [peeking, setPeeking] = useState(false);
  useEffect(() => {
    if (!peeking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === msg("Escape")) setPeeking(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peeking]);
  return (
    <>
      <div
        className={`modal-backdrop ${className} ${peeking ? "peeking" : ""}`}
        inert={peeking || undefined}
        aria-hidden={peeking || undefined}
      >
        {children}
      </div>
      <button
        type="button"
        className={`peek-toggle ${peeking ? "on" : ""}`}
        onClick={() => setPeeking((value) => !value)}
        aria-pressed={peeking}
      >
        <Eye size={15} aria-hidden="true" />
        {peeking ? back : msg("Peek at the board")}
      </button>
    </>
  );
}
