import { useEffect, useMemo, useRef, useState } from "react";
import { factionInfo, registry, type SetDefinition } from "@realms/content";
import {
  validateAdventure,
  type AdventureDef,
  type NodeDef,
  type NodeType,
  type EventDef,
  type EnemyDef,
  type Localized,
  type StoryBeat,
} from "@realms/adventure";
import * as fs from "../lib/fs";
import "../styles/adventure-editor.css";

const types: NodeType[] = ["event", "battle", "elite", "shop", "improve", "final"];
const labels: Record<NodeType, string> = {
  event: "Story",
  battle: "Battle",
  elite: "Elite battle",
  shop: "Market",
  improve: "Camp",
  final: "Final battle",
};
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const idFor = (base: string, ids: string[]) => {
  let id = base,
    n = 2;
  while (ids.includes(id)) id = `${base}-${n++}`;
  return id;
};
const loc = (value?: Localized): Localized => value ?? { en: "" };
const starter = (factions: fs.StoredFaction[], faction: string) =>
  structuredClone(factions.find((f) => f.data.id === faction)?.data.starter?.cards ?? {});
const empty = (factions: fs.StoredFaction[]): AdventureDef => {
  const faction = factions.find((f) => f.data.starter)?.data.id ?? "bright-marches";
  return {
    id: "",
    revision: 1,
    faction,
    name: { en: "" },
    premise: { en: "" },
    starterDeck: starter(factions, faction),
    start: "start",
    nodes: [
      { id: "start", type: "event", x: 50, y: 90, next: ["final"], event: "opening" },
      { id: "final", type: "final", x: 50, y: 10, next: [], enemy: "final-opponent" },
    ],
    events: [{ id: "opening", title: { en: "Opening" }, beats: [{ en: "" }] }],
    enemies: [
      {
        id: "final-opponent",
        name: { en: "Final opponent" },
        faction,
        deck: starter(factions, faction),
      },
    ],
    pools: {},
  };
};
function LocalText({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value?: Localized;
  onChange: (v: Localized) => void;
  multiline?: boolean;
}) {
  return (
    <fieldset className="ae-local">
      <legend>{label}</legend>
      {(["en", "de"] as const).map((lang) => (
        <label key={lang}>
          {lang === "en" ? "English" : "German"}{" "}
          {multiline ? (
            <textarea
              rows={3}
              value={value?.[lang] ?? ""}
              onChange={(e) => onChange({ ...loc(value), [lang]: e.target.value })}
            />
          ) : (
            <input
              value={value?.[lang] ?? ""}
              onChange={(e) => onChange({ ...loc(value), [lang]: e.target.value })}
            />
          )}
        </label>
      ))}
    </fieldset>
  );
}
function JsonField({
  label,
  value,
  onChange,
  onValidity,
}: {
  label: string;
  value: unknown;
  onChange: (v: any) => void;
  onValidity: (bad: boolean) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
    setBad(false);
  }, [label]);
  useEffect(() => () => onValidity(false), []);
  return (
    <label>
      {label}
      <textarea
        rows={5}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          const str = e.target.value;
          setText(str);
          try {
            const parsed = JSON.parse(str);
            if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== "object"))
              throw Error();
            setBad(false);
            onValidity(false);
            onChange(parsed);
          } catch {
            setBad(true);
            onValidity(true);
          }
        }}
      />
      {bad && <small className="studio-problem">Enter a valid JSON array before saving.</small>}
    </label>
  );
}

export function AdventureEditor({
  repo,
  cards,
  sets,
}: {
  repo: fs.Repo;
  cards: fs.StoredCard[];
  sets: readonly SetDefinition[];
}) {
  const [items, setItems] = useState<fs.StoredAdventure[]>([]),
    [factions, setFactions] = useState<fs.StoredFaction[]>([]);
  const [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<AdventureDef | null>(null),
    [original, setOriginal] = useState(""),
    [nodeId, setNodeId] = useState("");
  const [images, setImages] = useState<Record<string, Blob>>({}),
    [pending, setPending] = useState<Record<string, Blob>>({});
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [badJson, setBadJson] = useState<Record<string, boolean>>({}),
    [enemyId, setEnemyId] = useState(""),
    [cardQuery, setCardQuery] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const reload = async () => {
    const [list, fsList] = await Promise.all([fs.readAdventures(repo), fs.readFactions(repo)]);
    setItems(list);
    setFactions(fsList);
    return { list, fsList };
  };
  useEffect(() => {
    void reload().catch((e) => setError(String(e)));
  }, [repo]);
  const open = (item: fs.StoredAdventure) => {
    if (
      draft &&
      (JSON.stringify(draft) !== original || Object.keys(pending).length) &&
      !window.confirm("Discard unsaved adventure changes?")
    )
      return;
    const next = structuredClone(item.data);
    setDraft(next);
    setOriginal(JSON.stringify(next));
    setSelected(item.folder);
    setImages(item.art);
    setPending({});
    setNodeId(next.start);
    setEnemyId(next.enemies[0]?.id ?? "");
    setError("");
    setStatus("");
    setBadJson({});
  };
  const create = () => {
    if (
      draft &&
      (JSON.stringify(draft) !== original || Object.keys(pending).length) &&
      !window.confirm("Discard unsaved adventure changes?")
    )
      return;
    const d = empty(factions);
    setDraft(d);
    setOriginal("");
    setSelected("");
    setNodeId("start");
    setImages({});
    setPending({});
    setEnemyId("final-opponent");
    setError("");
  };
  const change = (fn: (d: AdventureDef) => void) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      fn(next);
      return next;
    });
    setStatus("");
  };
  const patchNode = (patch: Partial<NodeDef>) =>
    change((d) =>
      Object.assign(
        d.nodes.find((n) => n.id === nodeId)!,
        patch,
      ),
    );
  const node = draft?.nodes.find((n) => n.id === nodeId);
  const event = node?.event && draft?.events.find((e) => e.id === node.event);
  const mapBlob = draft?.mapArt && (pending[draft.mapArt] ?? images[draft.mapArt]);
  const [mapUrl, setMapUrl] = useState("");
  useEffect(() => {
    if (!mapBlob) {
      setMapUrl("");
      return;
    }
    const url = URL.createObjectURL(mapBlob);
    setMapUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mapBlob]);
  const content = useMemo(
    () => ({
      cards: { ...registry.cards, ...Object.fromEntries(cards.map((c) => [c.data.id, c.data])) },
    }),
    [cards],
  );
  let problems: string[] = [];
  try {
    problems = draft ? validateAdventure(draft, content) : [];
  } catch {
    problems = ["An advanced choice or effect is malformed. Check its fields before saving."];
  }
  const artNames = Object.keys({ ...images, ...pending }).sort();
  const usedArt = draft
    ? [
        draft.art,
        draft.mapArt,
        ...draft.events.flatMap((e) => [e.art, ...e.beats.map((b) => b.art)]),
        ...draft.enemies.map((e) => e.art),
      ].filter((x): x is string => !!x)
    : [];
  const missing = usedArt.filter((n) => !artNames.includes(n));
  const dirty = !!draft && (JSON.stringify(draft) !== original || Object.keys(pending).length > 0);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const save = async () => {
    if (!draft) return;
    try {
      if (!draft.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.id))
        throw Error("Enter an adventure ID using lowercase letters, numbers and hyphens.");
      if (selected && selected !== draft.id) throw Error("The adventure ID must match its folder.");
      if (!selected && items.some((i) => i.folder === draft.id))
        throw Error("An adventure with that ID already exists.");
      if (problems.length || missing.length || Object.values(badJson).some(Boolean))
        throw Error("Fix the validation issues before saving.");
      const next = structuredClone(draft);
      if (selected) next.revision += 1;
      await fs.writeAdventure(repo, next.id, next, pending);
      setDraft(next);
      setOriginal(JSON.stringify(next));
      setSelected(next.id);
      setImages((current) => ({ ...current, ...pending }));
      setPending({});
      await reload();
      setStatus(
        "Saved to assets/adventures. Existing runs of an updated adventure will need to restart.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const upload = async (file: File | undefined, name: string, apply: (name: string) => void) => {
    if (!file) return;
    try {
      const unique = idFor(slug(name) || "art", artNames);
      const image = await fs.toWebp(file);
      setPending((old) => ({ ...old, [unique]: image }));
      apply(unique);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const addNode = (type: NodeType) => {
    if (!draft) return;
    const id = idFor(
      type,
      draft.nodes.map((n) => n.id),
    );
    change((d) => {
      const n: NodeDef = { id, type, x: 50, y: 50, next: [] };
      if (type === "event") {
        n.event = id;
        d.events.push({ id, title: { en: "New story" }, beats: [{ en: "" }] });
      }
      if (["battle", "elite", "final"].includes(type)) n.enemy = d.enemies[0]?.id;
      d.nodes.push(n);
    });
    setNodeId(id);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !mapRef.current) return;
    const box = mapRef.current.getBoundingClientRect();
    change((d) => {
      const n = d.nodes.find((n) => n.id === drag);
      if (n) {
        n.x = Math.max(
          0,
          Math.min(
            100,
            Math.round(((((e.clientX - box.left) / box.width) * 100 - 6.75) / 0.865) * 10) / 10,
          ),
        );
        n.y = Math.max(
          0,
          Math.min(
            100,
            Math.round(((((e.clientY - box.top) / box.height) * 100 - 100 / 30) / (28 / 30)) * 10) /
              10,
          ),
        );
      }
    });
  };
  const currentEnemy = draft?.enemies.find((e) => e.id === enemyId);
  const patchEvent = (fn: (e: EventDef) => void) =>
    change((d) => {
      const entry = d.events.find((e) => e.id === node?.event);
      if (entry) fn(entry);
    });
  const setEnemy = (fn: (e: EnemyDef) => void) =>
    change((d) => {
      const enemy = d.enemies.find((e) => e.id === enemyId);
      if (enemy) fn(enemy);
    });
  return (
    <main className="ae-shell">
      <aside className="ae-list">
        <h2>Adventures</h2>
        <button className="primary" onClick={create}>
          New adventure
        </button>
        {items.map((i) => (
          <button
            className={selected === i.folder ? "on" : ""}
            key={i.folder}
            onClick={() => open(i)}
          >
            {i.data.name?.en || i.folder}
          </button>
        ))}
      </aside>
      {!draft ? (
        <section className="ae-empty">
          Choose an adventure or create one to start authoring.
        </section>
      ) : (
        <div className="ae-work">
          <header className="ae-toolbar">
            <div>
              <strong>{draft.name.en || "New adventure"}</strong>
              <small>{dirty ? "Unsaved changes" : "Saved"}</small>
            </div>
            <button
              className="primary"
              onClick={() => void save()}
              disabled={
                !dirty ||
                !!problems.length ||
                !!missing.length ||
                Object.values(badJson).some(Boolean)
              }
            >
              Save adventure
            </button>
          </header>
          {status && (
            <p className="studio-status" role="status">
              {status}
            </p>
          )}
          {error && (
            <p className="studio-problem" role="alert">
              {error}
            </p>
          )}
          <div className="ae-columns">
            <div className="ae-left">
              <details>
                <summary>Adventure settings &amp; starter deck</summary>
                <label>
                  ID{" "}
                  <input
                    value={draft.id}
                    disabled={!!selected}
                    onChange={(e) =>
                      change((d) => {
                        d.id = e.target.value.toLowerCase();
                      })
                    }
                  />
                </label>
                <LocalText
                  label="Name"
                  value={draft.name}
                  onChange={(v) =>
                    change((d) => {
                      d.name = v;
                    })
                  }
                />
                <LocalText
                  label="Premise"
                  value={draft.premise}
                  multiline
                  onChange={(v) =>
                    change((d) => {
                      d.premise = v;
                    })
                  }
                />
                <label>
                  Faction{" "}
                  <select
                    value={draft.faction}
                    onChange={(e) =>
                      change((d) => {
                        d.faction = e.target.value;
                      })
                    }
                  >
                    {Object.keys(factionInfo)
                      .filter((x) => x !== "neutral")
                      .map((id) => (
                        <option key={id} value={id}>
                          {factionInfo[id]?.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Set{" "}
                  <select
                    value={draft.set ?? ""}
                    onChange={(e) =>
                      change((d) => {
                        d.set = e.target.value || undefined;
                      })
                    }
                  >
                    <option value="">None</option>
                    {sets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <ArtInput
                  label="Map artwork"
                  value={draft.mapArt}
                  names={artNames}
                  art={{ ...images, ...pending }}
                  onSelect={(v) =>
                    change((d) => {
                      d.mapArt = v || undefined;
                    })
                  }
                  onUpload={(file) =>
                    void upload(file, "map", (name) =>
                      change((d) => {
                        d.mapArt = name;
                      }),
                    )
                  }
                />
                <ArtInput
                  label="Cover artwork"
                  value={draft.art}
                  names={artNames}
                  art={{ ...images, ...pending }}
                  onSelect={(v) =>
                    change((d) => {
                      d.art = v || undefined;
                    })
                  }
                  onUpload={(file) =>
                    void upload(file, "cover", (name) =>
                      change((d) => {
                        d.art = name;
                      }),
                    )
                  }
                />
                <label>
                  Starter deck: {Object.values(draft.starterDeck).reduce((a, b) => a + b, 0)} cards{" "}
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        change((d) => {
                          d.starterDeck = starter(factions, e.target.value);
                        });
                    }}
                  >
                    <option value="">Copy a faction starter…</option>
                    {factions
                      .filter((f) => f.data.starter)
                      .map((f) => (
                        <option key={f.data.id} value={f.data.id}>
                          {f.data.name}
                        </option>
                      ))}
                  </select>
                </label>
                <DeckEditor
                  deck={draft.starterDeck}
                  cards={cards}
                  query={cardQuery}
                  setQuery={setCardQuery}
                  setDeck={(deck) =>
                    change((d) => {
                      d.starterDeck = deck;
                    })
                  }
                />
              </details>
              <div className="ae-map-heading">
                <div>
                  <h2>Route map</h2>
                  <p>Drag nodes to position them; select one to edit its links and content.</p>
                </div>
                <select
                  aria-label="Add a node"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addNode(e.target.value as NodeType);
                  }}
                >
                  <option value="">+ Add node</option>
                  {types
                    .filter((t) => t !== "final")
                    .map((t) => (
                      <option key={t} value={t}>
                        {labels[t]}
                      </option>
                    ))}
                </select>
              </div>
              <div
                ref={mapRef}
                className="ae-map"
                style={mapUrl ? { backgroundImage: `url(${mapUrl})` } : undefined}
                onPointerMove={move}
                onPointerUp={() => setDrag(null)}
                onPointerCancel={() => setDrag(null)}
              >
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {draft.nodes.flatMap((n) =>
                    n.next.map((id) => {
                      const dest = draft.nodes.find((x) => x.id === id);
                      return dest ? (
                        <line
                          key={`${n.id}:${id}`}
                          x1={6.75 + n.x * 0.865}
                          y1={100 / 30 + (n.y * 28) / 30}
                          x2={6.75 + dest.x * 0.865}
                          y2={100 / 30 + (dest.y * 28) / 30}
                        />
                      ) : null;
                    }),
                  )}
                </svg>
                {draft.nodes.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    title={`${labels[n.type]} · ${n.id}`}
                    aria-label={`${labels[n.type]} ${n.id}`}
                    aria-pressed={n.id === nodeId}
                    className={`ae-node ${n.id === nodeId ? "selected" : ""}`}
                    style={{
                      left: `${6.75 + n.x * 0.865}%`,
                      top: `${100 / 30 + (n.y * 28) / 30}%`,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDrag(n.id);
                      setNodeId(n.id);
                    }}
                    onClick={() => setNodeId(n.id)}
                  >
                    <span>
                      {n.type === "event"
                        ? "✦"
                        : n.type === "battle"
                          ? "⚔"
                          : n.type === "elite"
                            ? "♜"
                            : n.type === "shop"
                              ? "¤"
                              : n.type === "improve"
                                ? "⌂"
                                : "♛"}
                    </span>
                    <small>{labels[n.type]}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="ae-inspector">
              {node && (
                <>
                  <h2>
                    {labels[node.type]} <small>{node.id}</small>
                  </h2>
                  <label>
                    Type{" "}
                    <select
                      value={node.type}
                      onChange={(e) => {
                        const type = e.target.value as NodeType;
                        change((d) => {
                          const n = d.nodes.find((x) => x.id === nodeId)!;
                          n.type = type;
                          delete n.event;
                          delete n.enemy;
                          delete n.pool;
                          if (type === "event") {
                            const id = idFor(
                              nodeId,
                              d.events.map((x) => x.id),
                            );
                            n.event = id;
                            d.events.push({ id, title: { en: "New story" }, beats: [{ en: "" }] });
                          } else if (["battle", "elite", "final"].includes(type))
                            n.enemy = d.enemies[0]?.id;
                        });
                      }}
                    >
                      {types.map((t) => (
                        <option key={t} value={t}>
                          {labels[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <LocalText
                    label="Map label (optional)"
                    value={node.label}
                    onChange={(v) => patchNode({ label: v })}
                  />
                  <div className="ae-coordinates">
                    <label>
                      X{" "}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={node.x}
                        onChange={(e) => patchNode({ x: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Y{" "}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={node.y}
                        onChange={(e) => patchNode({ y: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.start === node.id}
                      onChange={() =>
                        change((d) => {
                          d.start = node.id;
                        })
                      }
                    />{" "}
                    Starting node
                  </label>
                  <fieldset>
                    <legend>Paths to other nodes</legend>
                    <div className="ae-links">
                      {draft.nodes
                        .filter((n) => n.id !== node.id)
                        .map((n) => (
                          <label key={n.id}>
                            <input
                              type="checkbox"
                              checked={node.next.includes(n.id)}
                              onChange={(e) =>
                                patchNode({
                                  next: e.target.checked
                                    ? [...node.next, n.id]
                                    : node.next.filter((id) => id !== n.id),
                                })
                              }
                            />
                            {labels[n.type]} · {n.id}
                          </label>
                        ))}
                    </div>
                  </fieldset>
                  {node.type === "event" && (
                    <label>
                      Story{" "}
                      <select
                        value={node.event ?? ""}
                        onChange={(e) => patchNode({ event: e.target.value || undefined })}
                      >
                        <option value="">Choose a story…</option>
                        {draft.events.map((story) => (
                          <option key={story.id} value={story.id}>
                            {story.title?.en || story.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {event && (
                    <>
                      <h3>Story</h3>
                      {draft.nodes.filter((n) => n.event === event.id).length > 1 && (
                        <p className="studio-hint">
                          This story is shared by{" "}
                          {draft.nodes.filter((n) => n.event === event.id).length} nodes. Changes
                          affect each of them.
                        </p>
                      )}
                      <LocalText
                        label="Title"
                        value={event.title}
                        onChange={(v) =>
                          patchEvent((e) => {
                            e.title = v;
                          })
                        }
                      />
                      <ArtInput
                        label="Story artwork"
                        value={event.art}
                        names={artNames}
                        art={{ ...images, ...pending }}
                        onSelect={(v) =>
                          patchEvent((e) => {
                            e.art = v || undefined;
                          })
                        }
                        onUpload={(file) =>
                          void upload(file, `${event.id}-story`, (name) =>
                            patchEvent((e) => {
                              e.art = name;
                            }),
                          )
                        }
                      />
                      {event.beats.map((beat, i) => (
                        <fieldset key={i}>
                          <legend>Story beat {i + 1}</legend>
                          <LocalText
                            label="Text"
                            value={beat}
                            multiline
                            onChange={(v) =>
                              patchEvent((e) => {
                                e.beats[i] = { ...e.beats[i], ...v };
                              })
                            }
                          />
                          <ArtInput
                            label="Beat artwork (optional)"
                            value={beat.art}
                            names={artNames}
                            art={{ ...images, ...pending }}
                            onSelect={(v) =>
                              patchEvent((e) => {
                                e.beats[i].art = v || undefined;
                              })
                            }
                            onUpload={(file) =>
                              void upload(file, `${event.id}-beat-${i + 1}`, (name) =>
                                patchEvent((e) => {
                                  e.beats[i].art = name;
                                }),
                              )
                            }
                          />
                          <div className="ae-row">
                            <button
                              disabled={i === 0}
                              onClick={() =>
                                patchEvent((e) => {
                                  [e.beats[i - 1], e.beats[i]] = [e.beats[i], e.beats[i - 1]];
                                })
                              }
                            >
                              Move up
                            </button>
                            <button
                              disabled={event.beats.length <= 1}
                              onClick={() =>
                                patchEvent((e) => {
                                  e.beats.splice(i, 1);
                                })
                              }
                            >
                              Remove beat
                            </button>
                          </div>
                        </fieldset>
                      ))}
                      <button
                        onClick={() =>
                          patchEvent((e) => {
                            e.beats.push({ en: "" } as StoryBeat);
                          })
                        }
                      >
                        Add story beat
                      </button>
                      <h3>Choices</h3>
                      {(event.choices ?? []).map((choice, index) => (
                        <fieldset key={choice.id}>
                          <legend>
                            Choice {index + 1} · {choice.id}
                          </legend>
                          <LocalText
                            label="Button text"
                            value={choice.label}
                            onChange={(value) =>
                              patchEvent((e) => {
                                e.choices![index].label = value;
                              })
                            }
                          />
                          <LocalText
                            label="Result text"
                            value={choice.result}
                            multiline
                            onChange={(value) =>
                              patchEvent((e) => {
                                e.choices![index].result = value;
                              })
                            }
                          />
                          <details>
                            <summary>Conditions and effects (advanced)</summary>
                            <JsonField
                              key={`${event.id}-${choice.id}-conditions`}
                              label="Conditions"
                              value={choice.when ?? []}
                              onValidity={(bad) =>
                                setBadJson((prev) => ({
                                  ...prev,
                                  [`${event.id}-${choice.id}-conditions`]: bad,
                                }))
                              }
                              onChange={(value) =>
                                patchEvent((e) => {
                                  e.choices![index].when = value;
                                })
                              }
                            />
                            <JsonField
                              key={`${event.id}-${choice.id}-effects`}
                              label="Effects"
                              value={choice.effects}
                              onValidity={(bad) =>
                                setBadJson((prev) => ({
                                  ...prev,
                                  [`${event.id}-${choice.id}-effects`]: bad,
                                }))
                              }
                              onChange={(value) =>
                                patchEvent((e) => {
                                  e.choices![index].effects = value;
                                })
                              }
                            />
                          </details>
                          <button
                            onClick={() =>
                              patchEvent((e) => {
                                e.choices!.splice(index, 1);
                              })
                            }
                          >
                            Remove choice
                          </button>
                        </fieldset>
                      ))}
                      <button
                        onClick={() =>
                          patchEvent((e) => {
                            e.choices ??= [];
                            const id = idFor(
                              "choice",
                              e.choices.map((choice) => choice.id),
                            );
                            e.choices.push({ id, label: { en: "New choice" }, effects: [] });
                          })
                        }
                      >
                        Add choice
                      </button>
                      <details>
                        <summary>Scene rewards (advanced)</summary>
                        <p>
                          Effects use the adventure format. They apply when a scene has no choices;
                          otherwise, put effects on each choice.
                        </p>
                        <JsonField
                          key={`${event.id}-effects`}
                          label="Effects"
                          value={event.effects ?? []}
                          onValidity={(bad) =>
                            setBadJson((prev) => ({ ...prev, [`${event.id}-effects`]: bad }))
                          }
                          onChange={(v) =>
                            patchEvent((e) => {
                              e.effects = v;
                            })
                          }
                        />
                      </details>
                    </>
                  )}
                  {["battle", "elite", "final"].includes(node.type) && (
                    <>
                      <h3>Encounter</h3>
                      <label>
                        Story after victory
                        <select
                          value={node.event ?? ""}
                          onChange={(e) => patchNode({ event: e.target.value || undefined })}
                        >
                          <option value="">None</option>
                          {draft.events.map((story) => (
                            <option key={story.id} value={story.id}>
                              {story.title?.en || story.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => {
                          const id = idFor(
                            `${node.id}-story`,
                            draft.events.map((story) => story.id),
                          );
                          change((d) => {
                            d.events.push({ id, title: { en: "New story" }, beats: [{ en: "" }] });
                            d.nodes.find((n) => n.id === nodeId)!.event = id;
                          });
                        }}
                      >
                        Create story after victory
                      </button>
                      <label>
                        Opponent{" "}
                        <select
                          value={node.pool ? `pool:${node.pool}` : `enemy:${node.enemy ?? ""}`}
                          onChange={(e) => {
                            const [kind, id] = e.target.value.split(":");
                            patchNode({
                              enemy: kind === "enemy" ? id : undefined,
                              pool: kind === "pool" ? id : undefined,
                            });
                          }}
                        >
                          <option value="enemy:">Choose an opponent…</option>
                          <optgroup label="Fixed opponents">
                            {draft.enemies.map((e) => (
                              <option key={e.id} value={`enemy:${e.id}`}>
                                {e.name.en}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Random pools">
                            {Object.keys(draft.pools).map((p) => (
                              <option key={p} value={`pool:${p}`}>
                                {p}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </label>
                      <button
                        onClick={() => {
                          const id = idFor("new-pool", Object.keys(draft.pools));
                          change((d) => {
                            d.pools[id] = [];
                            const n = d.nodes.find((n) => n.id === nodeId)!;
                            n.pool = id;
                            delete n.enemy;
                          });
                        }}
                      >
                        Create random pool
                      </button>
                      {node.pool && (
                        <fieldset>
                          <legend>Random opponents in {node.pool}</legend>
                          {draft.enemies.map((e) => (
                            <label key={e.id}>
                              <input
                                type="checkbox"
                                checked={draft.pools[node.pool!]?.includes(e.id) ?? false}
                                onChange={(ev) =>
                                  change((d) => {
                                    const pool = d.pools[node.pool!] ?? [];
                                    d.pools[node.pool!] = ev.target.checked
                                      ? [...pool, e.id]
                                      : pool.filter((id) => id !== e.id);
                                  })
                                }
                              />
                              {e.name.en}
                            </label>
                          ))}
                        </fieldset>
                      )}
                      <button
                        onClick={() => {
                          const id = idFor(
                            "opponent",
                            draft.enemies.map((e) => e.id),
                          );
                          const faction = draft.faction;
                          change((d) => {
                            d.enemies.push({
                              id,
                              name: { en: "New opponent" },
                              faction,
                              deck: starter(factions, faction),
                            });
                            const n = d.nodes.find((n) => n.id === nodeId)!;
                            n.enemy = id;
                            delete n.pool;
                          });
                          setEnemyId(id);
                        }}
                      >
                        Create opponent
                      </button>
                    </>
                  )}
                  {node.id !== draft.start && (
                    <button
                      className="danger"
                      onClick={() => {
                        if (!window.confirm(`Delete ${node.id} and its connections?`)) return;
                        change((d) => {
                          d.nodes = d.nodes.filter((n) => n.id !== node.id);
                          d.nodes.forEach((n) => {
                            n.next = n.next.filter((id) => id !== node.id);
                          });
                        });
                        setNodeId(draft.start);
                      }}
                    >
                      Delete node
                    </button>
                  )}
                </>
              )}
              <details>
                <summary>Opponents &amp; decks</summary>
                <label>
                  Opponent{" "}
                  <select value={enemyId} onChange={(e) => setEnemyId(e.target.value)}>
                    {draft.enemies.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name.en} · {e.id}
                      </option>
                    ))}
                  </select>
                </label>
                {currentEnemy && (
                  <>
                    <LocalText
                      label="Name"
                      value={currentEnemy.name}
                      onChange={(v) =>
                        setEnemy((e) => {
                          e.name = v;
                        })
                      }
                    />
                    <LocalText
                      label="Battle introduction"
                      value={currentEnemy.intro}
                      multiline
                      onChange={(v) =>
                        setEnemy((e) => {
                          e.intro = v;
                        })
                      }
                    />
                    <label>
                      Faction{" "}
                      <select
                        value={currentEnemy.faction}
                        onChange={(ev) =>
                          setEnemy((e) => {
                            e.faction = ev.target.value;
                          })
                        }
                      >
                        {Object.keys(factionInfo).map((id) => (
                          <option key={id} value={id}>
                            {factionInfo[id]?.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Copy starter deck{" "}
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value)
                            setEnemy((n) => {
                              n.deck = starter(factions, e.target.value);
                            });
                        }}
                      >
                        <option value="">Choose faction…</option>
                        {factions
                          .filter((f) => f.data.starter)
                          .map((f) => (
                            <option key={f.data.id} value={f.data.id}>
                              {f.data.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p>{Object.values(currentEnemy.deck).reduce((a, b) => a + b, 0)} cards</p>
                    <DeckEditor
                      deck={currentEnemy.deck}
                      cards={cards}
                      query={cardQuery}
                      setQuery={setCardQuery}
                      setDeck={(deck) =>
                        setEnemy((e) => {
                          e.deck = deck;
                        })
                      }
                    />
                  </>
                )}
              </details>
              <details open={!!problems.length || !!missing.length}>
                <summary>Validation · {problems.length + missing.length} issues</summary>
                <ul className="studio-issues">
                  {problems.map((p) => (
                    <li className="error" key={p}>
                      {p}
                    </li>
                  ))}
                  {missing.map((n) => (
                    <li className="error" key={n}>
                      Missing artwork: {n}
                    </li>
                  ))}
                </ul>
                {!problems.length && !missing.length && <p>Ready to save.</p>}
              </details>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ArtInput({
  label,
  value,
  names,
  art,
  onSelect,
  onUpload,
}: {
  label: string;
  value?: string;
  names: string[];
  art: Record<string, Blob>;
  onSelect: (v: string) => void;
  onUpload: (f: File | undefined) => void;
}) {
  const blob = value ? art[value] : undefined;
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return (
    <label>
      {label}
      {url && <img className="ae-art-preview" src={url} alt="" />}
      <select value={value ?? ""} onChange={(e) => onSelect(e.target.value)}>
        <option value="">None</option>
        {value && !names.includes(value) && <option value={value}>{value} (missing)</option>}
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          onUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}
function DeckEditor({
  deck,
  cards,
  query,
  setQuery,
  setDeck,
}: {
  deck: Record<string, number>;
  cards: fs.StoredCard[];
  query: string;
  setQuery: (s: string) => void;
  setDeck: (d: Record<string, number>) => void;
}) {
  const bump = (id: string, n: number) => {
    const next = { ...deck };
    next[id] = (next[id] ?? 0) + n;
    if (next[id] <= 0) delete next[id];
    setDeck(next);
  };
  return (
    <div className="ae-deck">
      <div>
        {Object.entries(deck).map(([id, n]) => (
          <div className="ae-deck-row" key={id}>
            <span>{cards.find((c) => c.data.id === id)?.data.name ?? id}</span>
            <button aria-label={`Remove ${id}`} onClick={() => bump(id, -1)}>
              −
            </button>
            <b>{n}</b>
            <button aria-label={`Add ${id}`} onClick={() => bump(id, 1)}>
              +
            </button>
          </div>
        ))}
      </div>
      <input
        placeholder="Find a card to add…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query &&
        cards
          .filter((c) => String(c.data.name).toLowerCase().includes(query.toLowerCase()))
          .slice(0, 30)
          .map((c) => (
            <button key={c.folder} onClick={() => bump(c.data.id, 1)}>
              + {c.data.name}
            </button>
          ))}
    </div>
  );
}
