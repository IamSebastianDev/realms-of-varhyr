import { useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Download, Upload } from "lucide-react";
import { factionInfo, registry } from "@realms/content";
import { formatNumber, t as msg, useLanguage } from "@realms/ui/i18n";
import {
  exportLedger,
  parseHistoryFile,
  summarize,
  winRange,
  winRate,
  type CardDiff,
  type Outcome,
  type Tally,
} from "../lib/ledger";
import { importLedger, useLedger } from "../stores/ledgerStore";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const record = (t: Tally) => `${t.won}–${t.lost}${t.draw ? `–${t.draw}` : ""}`;
const cardName = (id: string) => msg(registry.cards[id]?.name ?? id);
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const games = (n: number) => (n === 1 ? msg("1 game") : msg("{v0} games", { v0: n }));

/** A win rate as a bar. With few games the bar is faint, because the number says little. */
function RateRow({ label, tally, note }: { label: string; tally: Tally; note?: string }) {
  const [low, high] = winRange(tally);
  return (
    <li
      className="stat-row deck-stat-row"
      style={{ "--sure": Math.min(1, 0.35 + tally.games / 14) } as CSSProperties}
    >
      <span className="stat-label">{label}</span>
      <span
        className="stat-bar"
        role="img"
        aria-label={msg("{v0} win rate over {v1}", {
          v0: tally.games ? percent(winRate(tally)) : "–",
          v1: games(tally.games),
        })}
      >
        <i style={{ width: `${winRate(tally) * 100}%` }} />
      </span>
      <b className="stat-value">
        {record(tally)} <span>{tally.games ? percent(winRate(tally)) : "–"}</span>
      </b>
      <small
        className="stat-copies"
        title={msg("Likely win rate between {v0} and {v1}.", {
          v0: percent(low),
          v1: percent(high),
        })}
      >
        {note ? `${note} · ` : ""}
        {games(tally.games)}
      </small>
    </li>
  );
}

function Changes({ diff }: { diff: CardDiff }) {
  if (!diff.added.length && !diff.removed.length) return null;
  return (
    <span className="deck-stat-changes">
      {diff.added.map((c) => (
        <em key={`+${c.id}`} className="added">
          +{c.count} {cardName(c.id)}
        </em>
      ))}
      {diff.removed.map((c) => (
        <em key={`-${c.id}`} className="removed">
          −{c.count} {cardName(c.id)}
        </em>
      ))}
    </span>
  );
}

/** "The Black Host and The Horde": the faction names of an inferred archetype. */
const archetypeName = (factions: string[]) =>
  factions.length
    ? factions.map((f) => msg(factionInfo[f]?.name ?? f)).join(" + ")
    : msg("Nothing seen");

const letter: Record<Outcome, string> = { won: "W", lost: "L", draw: "D" };

/** What your recorded matches say about one deck: results, how it fares against each opponent, and what changing cards did. */
export function DeckStatsPage({
  deckId,
  deckName,
  back,
}: {
  deckId: string;
  deckName: string;
  back: () => void;
}) {
  useLanguage();
  const ledger = useLedger(),
    stats = useMemo(() => summarize(ledger, deckId), [ledger, deckId]),
    fileRef = useRef<HTMLInputElement>(null),
    [note, setNote] = useState(""),
    [failed, setFailed] = useState(false),
    total = stats.overall;
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportLedger(ledger), null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "varhyr-match-history.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      const added = importLedger(parseHistoryFile(await file.text()));
      setFailed(false);
      setNote(msg("Added {v0} matches.", { v0: added }));
    } catch (error) {
      setFailed(true);
      setNote(
        msg(error instanceof Error ? error.message : "This match history could not be read."),
      );
    }
  };
  const facts: [string, string][] = [
    [msg("Won–lost"), record(total)],
    [msg("Win rate"), percent(winRate(total))],
    [msg("Matches"), String(total.games)],
    [
      msg("Turns per match"),
      formatNumber(stats.averageTurns, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    ],
  ];
  return (
    <main className="stats-page deck-stats-page">
      <div className="collection-heading collection-subhead">
        <button
          className="builder-icon-button"
          aria-label={msg("Back to decks")}
          title={msg("Back to decks")}
          onClick={back}
        >
          <ArrowLeft size={16} />
        </button>
        <h1>{deckName}</h1>
        <span className="deck-stats-sub">{msg("Match record")}</span>
        <button className="outline-button" onClick={download} disabled={!ledger.matches.length}>
          <Download size={15} />
          {msg("Export history")}
        </button>
        <button
          className="outline-button deck-stats-import"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={15} />
          {msg("Import history")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {note && (
        <p className={failed ? "builder-dialog-error stats-note" : "stats-note"} role="status">
          {note}
        </p>
      )}
      {total.games ? (
        <>
          <section className="deck-stats-hero" aria-label={msg("Summary")}>
            <dl className="stats-facts">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="deck-stats-form">
              <span>{msg("Latest")}</span>
              <div aria-label={msg("Latest results, newest first")}>
                {stats.recent.map((result, index) => (
                  <b key={index} className={result}>
                    {letter[result]}
                  </b>
                ))}
              </div>
            </div>
          </section>
          <div className="stats-grid">
            <section className="stats-panel" aria-label={msg("Going first or second")}>
              <h2>{msg("Turn order")}</h2>
              <ul>
                <RateRow label={msg("Going first")} tally={stats.onThePlay} />
                <RateRow label={msg("Going second")} tally={stats.onTheDraw} />
              </ul>
            </section>
            <section className="stats-panel" aria-label={msg("Against")}>
              <h2>
                {msg("Against")} <small>{stats.opponents.length}</small>
              </h2>
              <ul>
                {stats.opponents.map((o) => (
                  <RateRow key={o.key} label={archetypeName(o.factions)} tally={o.tally} />
                ))}
              </ul>
            </section>
          </div>
          <section className="stats-panel deck-stats-versions" aria-label={msg("Card changes")}>
            <h2>{msg("Card changes")}</h2>
            <p className="stats-note">
              {msg(
                "Every time the card list changes, a new version starts. Compare how each one did.",
              )}
            </p>
            <ol>
              {[...stats.versions].reverse().map((v, index) => (
                <li key={v.version}>
                  <div className="deck-stat-when">
                    <b>{index === 0 ? msg("Current list") : msg("Earlier list")}</b>
                    <span>
                      {day(v.firstAt)}
                      {day(v.firstAt) !== day(v.lastAt) && `–${day(v.lastAt)}`}
                    </span>
                  </div>
                  <ul>
                    <RateRow label={msg("Win rate")} tally={v.tally} />
                  </ul>
                  <div className="deck-stat-diff">
                    {v.diff ? (
                      <Changes diff={v.diff} />
                    ) : index === stats.versions.length - 1 ? (
                      <small>{msg("First recorded list")}</small>
                    ) : (
                      <small>{msg("Card list unknown")}</small>
                    )}
                    {v.diff && !v.diff.added.length && !v.diff.removed.length && (
                      <small>{msg("Same cards")}</small>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
        <section className="stats-panel deck-stats-empty">
          <h2>{msg("No matches recorded yet")}</h2>
          <p className="stats-note">
            {msg(
              "Finish a match with this deck against the computer or online and the result appears here. History stays on this device; export it to back it up or move it.",
            )}
          </p>
        </section>
      )}
    </main>
  );
}
