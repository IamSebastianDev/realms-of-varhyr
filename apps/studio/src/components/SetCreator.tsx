import { useState } from "react";
import { factionDefinitions } from "@realms/content/factions";
import {
  parseSetDefinition,
  validateSetDefinitions,
  type SetDefinition,
} from "@realms/content/setDefinition";
import * as fs from "../lib/fs";

/** Create a set using the same schema and uniqueness rules as the asset importer. */
export function SetCreator({
  repo,
  sets,
  onCreated,
  onCancel,
}: {
  repo: fs.Repo;
  sets: readonly SetDefinition[];
  onCreated: (set: SetDefinition) => Promise<void>;
  onCancel: () => void;
}) {
  const [id, setId] = useState(""),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [description, setDescription] = useState(""),
    [color, setColor] = useState("#d4bd85"),
    [symbol, setSymbol] = useState("⟐"),
    [deName, setDeName] = useState(""),
    [deDescription, setDeDescription] = useState(""),
    [members, setMembers] = useState<string[]>([]),
    [introduced, setIntroduced] = useState<string[]>([]),
    [pack, setPack] = useState(false),
    [packId, setPackId] = useState(""),
    [packName, setPackName] = useState(""),
    [packBlurb, setPackBlurb] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const raw = {
        id,
        name,
        code,
        description,
        color,
        symbol,
        factions: members,
        introduces: introduced,
        ...(pack ? { pack: { id: packId, name: packName, blurb: packBlurb } } : {}),
        ...(deName.trim() || deDescription.trim()
          ? {
              translations: {
                de: {
                  ...(deName.trim() ? { name: deName } : {}),
                  ...(deDescription.trim() ? { description: deDescription } : {}),
                },
              },
            }
          : {}),
      };
      const set = parseSetDefinition(raw);
      validateSetDefinitions([...sets, set], factionDefinitions);
      await fs.createSet(repo, set);
      await onCreated(set);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="set-create-backdrop">
      <section
        className="set-create bronze-plate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-create-title"
      >
        <h2 id="set-create-title">New set</h2>
        <p>Define the set before adding its cards.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="set-create-grid">
            <label>
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="RoV: Faces of the Realm"
              />
            </label>
            <label>
              ID
              <input
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase())}
                placeholder="faces-of-the-realm"
              />
              <small>Lowercase words separated by hyphens.</small>
            </label>
            <label>
              Code
              <input
                required
                pattern="[A-Z0-9]{2,5}"
                value={code}
                maxLength={5}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FOR"
              />
            </label>
            <label>
              Symbol
              <input
                required
                maxLength={4}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              />
            </label>
            <label>
              Color
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
          </div>
          <label>
            Description
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <fieldset>
            <legend>
              Factions in the set <small>(optional)</small>
            </legend>
            <div className="set-create-factions">
              {factionDefinitions.map((f) => (
                <label key={f.id}>
                  <input
                    type="checkbox"
                    checked={members.includes(f.id)}
                    onChange={() => setMembers(toggle(members, f.id))}
                  />
                  {f.name}
                </label>
              ))}
            </div>
          </fieldset>
          <details>
            <summary>Introduced factions</summary>
            <p>Mark factions first introduced by this set. The faction must already exist.</p>
            <div className="set-create-factions">
              {factionDefinitions
                .filter((f) => f.id !== "neutral")
                .map((f) => (
                  <label key={f.id}>
                    <input
                      type="checkbox"
                      checked={introduced.includes(f.id)}
                      onChange={() => setIntroduced(toggle(introduced, f.id))}
                    />
                    {f.name}
                  </label>
                ))}
            </div>
          </details>
          <details>
            <summary>German translation</summary>
            <label>
              Name
              <input value={deName} onChange={(e) => setDeName(e.target.value)} />
            </label>
            <label>
              Description
              <textarea
                rows={2}
                value={deDescription}
                onChange={(e) => setDeDescription(e.target.value)}
              />
            </label>
          </details>
          <details>
            <summary>Optional set booster</summary>
            <label className="set-create-check">
              <input type="checkbox" checked={pack} onChange={(e) => setPack(e.target.checked)} />{" "}
              Define booster metadata
            </label>
            {pack && (
              <>
                <label>
                  Booster ID
                  <input
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={packId}
                    onChange={(e) => setPackId(e.target.value.toLowerCase())}
                  />
                </label>
                <label>
                  Booster name
                  <input required value={packName} onChange={(e) => setPackName(e.target.value)} />
                </label>
                <label>
                  Booster description
                  <textarea
                    required
                    rows={2}
                    value={packBlurb}
                    onChange={(e) => setPackBlurb(e.target.value)}
                  />
                </label>
                <small>Booster availability is configured separately in the game.</small>
              </>
            )}
          </details>
          {error && (
            <p className="studio-problem" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create set"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
