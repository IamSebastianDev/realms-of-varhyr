import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/**
 * The workshop layout: a full-height screen with a main panel on the left and a side pane on the right.
 * The deck builder, the draft pick screen and the draft deck builder are all this layout; a new screen of this shape
 * fills the slots and writes no layout CSS (see layout.css and deck-builder.css for the rules).
 *
 *   ┌─ bar: back · title · actions ──────┐ ┌─ pane ─────┐
 *   │ children (gallery, grid, …)         │ │            │
 *   ├─ rail ─────────────────────────────┤ │            │
 *   └─────────────────────────────────────┘ └────────────┘
 */
export type WorkshopProps = {
  /** Accessible name of the whole screen. */
  label: string;
  /** Extra class names on <main>, for screen-specific styling only. */
  className?: string;
  style?: CSSProperties;
  /** Full-bleed artwork behind the panels. */
  backdrop?: ReactNode;
  /** Accessible name of the main panel. */
  panelLabel: string;
  /** Class names and handlers (drag and drop) for the main panel. */
  panel?: HTMLAttributes<HTMLElement> & { className?: string };
  back?: { label: string; onClick: () => void };
  title: ReactNode;
  subtitle?: ReactNode;
  /** Controls on the right of the bar, such as filters. */
  actions?: ReactNode;
  /** The footer under the main panel; use <Rail>. */
  rail?: ReactNode;
  /** The side pane; use <DraftPane> or the deck builder's own. */
  pane: ReactNode;
  /** Dialogs and other overlays; rendered outside the panels so they are never clipped by them. */
  overlays?: ReactNode;
  children: ReactNode;
};

export function Workshop({
  label,
  className = "",
  style,
  backdrop,
  panelLabel,
  panel,
  back,
  title,
  subtitle,
  actions,
  rail,
  pane,
  overlays,
  children,
}: WorkshopProps) {
  const { className: panelClass = "", ...panelProps } = panel ?? {};
  return (
    <main className={`deck-workshop ${className}`.trim()} aria-label={label} style={style}>
      {backdrop}
      <section
        className={`builder-collection ${panelClass}`.trim()}
        aria-label={panelLabel}
        {...panelProps}
      >
        <div className="builder-collection-bar">
          {back && (
            <button
              className="builder-icon-button"
              aria-label={back.label}
              title={back.label}
              onClick={back.onClick}
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <h2>
            {title}
            {subtitle && <span>{subtitle}</span>}
          </h2>
          {actions}
        </div>
        {children}
        {rail}
      </section>
      {pane}
      {overlays}
    </main>
  );
}

/** The slim footer rail under a panel: a status line on the left, actions on the right. */
export function Rail({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`builder-deck-footer ${className}`.trim()}>{children}</div>;
}
