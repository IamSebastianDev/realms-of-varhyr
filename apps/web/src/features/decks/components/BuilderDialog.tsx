import { t as msg, useLanguage } from "@realms/ui/i18n";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** Builder dialogs preserve the editing screen and return focus to their opener. */
export function BuilderDialog({
  title,
  close,
  origin,
  className = "",
  children,
}: {
  title: string;
  /** Extra class for dialogs that need more room than the default 480px. */
  className?: string;
  close: () => void;
  origin: HTMLElement | null;
  children: ReactNode;
}) {
  useLanguage();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>(
      '[data-autofocus], input:not([type="hidden"]), select, textarea',
    );
    (first ?? panel.current?.querySelector<HTMLElement>("button"))?.focus();
    return () => {
      if (origin?.isConnected) origin.focus();
    };
  }, [origin, title]);
  return (
    <div className="modal-backdrop builder-dialog-backdrop" onClick={close}>
      <section
        ref={panel}
        className={`builder-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === msg("Escape")) {
            event.stopPropagation();
            close();
          }
          if (event.key !== msg("Tab")) return;
          const controls = Array.from(
            panel.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)',
            ) ?? [],
          );
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <button
          className="builder-dialog-close"
          aria-label={msg("Close {v0}", { v0: title.toLowerCase() })}
          onClick={close}
        >
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
