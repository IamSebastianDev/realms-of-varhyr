import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { compileContent } from "@realms/content/compiler";
import { ArtCard, CardFacts } from "@realms/ui";
import type { CardDefinition } from "@realms/contracts";
import { serialize, type Draft } from "../lib/model";

/** Shown until art is chosen: a plain dusk gradient, so the empty card still reads as a card. */
const placeholder = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="840"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2823"/><stop offset="1" stop-color="#12110f"/></linearGradient></defs><rect width="600" height="840" fill="url(#g)"/></svg>')}`;

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: { children: ReactNode }) {
    if (this.state.failed && previous.children !== this.props.children)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? (
      <p className="studio-hint">The card cannot be drawn yet. Fix the problems listed below.</p>
    ) : (
      this.props.children
    );
  }
}

/** The card exactly as the game draws it. While the draft is incomplete the last valid version stays on screen. */
export function Preview({ draft, art }: { draft: Draft; art: Blob | null }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!art) {
      setUrl("");
      return;
    }
    const made = URL.createObjectURL(art);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [art]);
  const [last, setLast] = useState<CardDefinition | null>(null);
  const card = useMemo(() => {
    try {
      const { data, de } = serialize({
        ...draft,
        id: draft.id || "preview",
        name: draft.name || "Unnamed card",
      });
      return Object.values(
        compileContent([
          {
            ...data,
            art: url || placeholder,
            translations: de ? { de: { name: de.name, lore: de.lore } } : undefined,
          },
        ]).cards,
      )[0];
    } catch {
      return null;
    }
  }, [draft, url]);
  useEffect(() => {
    if (card) setLast(card);
  }, [card]);
  const shown = card ?? last;
  if (!shown) return <p className="studio-hint">Fill in the card to see it here.</p>;
  return (
    <Guard>
      <div className="studio-preview-pair">
        <ArtCard card={shown} detail={false} className="studio-card" />
        <div className="studio-facts">
          <CardFacts card={shown} />
        </div>
      </div>
    </Guard>
  );
}
