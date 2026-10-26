import { useEffect, useRef, useState } from "react";
import type { AbilityChoice } from "../lib/model";

/** Search and browse the abilities a slot offers: each shows its rules text, grouped by what it does. */
export function AbilityPicker({
  title,
  groups,
  current,
  onPick,
  onClose,
}: {
  title: string;
  groups: { group: string; items: AbilityChoice[] }[];
  /** The ability being replaced, if any. */
  current?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = groups
    .map(({ group, items }) => ({
      group,
      items: items.filter((item) => {
        const haystack = `${item.title} ${item.id} ${item.text} ${group}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      }),
    }))
    .filter(({ items }) => items.length);
  const first = shown[0]?.items[0];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const move = (event: React.KeyboardEvent, from: "search" | "item") => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = [
      ...(list.current?.querySelectorAll<HTMLButtonElement>("button.ability-row") ?? []),
    ];
    const at = from === "search" ? -1 : rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? at + 1 : at - 1;
    if (next < 0)
      (event.currentTarget.closest(".picker")!.querySelector("input") as HTMLElement).focus();
    else rows[Math.min(next, rows.length - 1)]?.focus();
  };
  return (
    <div className="picker-backdrop" onMouseDown={onClose}>
      <div
        className="picker"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="quiet" onClick={onClose}>
            Close
          </button>
        </header>
        <input
          type="search"
          autoFocus
          aria-label="Search abilities"
          placeholder="Search by name or effect, for example damage, draw, adjacent"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && first) onPick(first.id);
            else move(event, "search");
          }}
        />
        <div className="picker-list" ref={list}>
          {shown.map(({ group, items }) => (
            <section key={group} aria-label={group}>
              <h3>{group}</h3>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ability-row"
                  aria-current={item.id === current || undefined}
                  onClick={() => onPick(item.id)}
                  onKeyDown={(event) => move(event, "item")}
                >
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </button>
              ))}
            </section>
          ))}
          {!shown.length && <p className="picker-empty">No ability matches "{query}".</p>}
        </div>
      </div>
    </div>
  );
}
