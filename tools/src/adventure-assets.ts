import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateAdventure, type AdventureDef } from "@realms/adventure";
import { registry } from "@realms/content";

/** What the authoring side may produce: one folder per adventure with `adventure.json` and an optional `art/` of paintings. */
export type AdventureImport = { adventures: AdventureDef[]; problems: string[] };

export async function readAdventures(root: string): Promise<AdventureImport> {
  const base = join(root, "assets/adventures");
  const adventures: AdventureDef[] = [],
    problems: string[] = [];
  if (!existsSync(base)) return { adventures, problems };
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(base, entry.name, "adventure.json");
    if (!existsSync(file)) continue;
    let def: AdventureDef;
    try {
      def = JSON.parse(await readFile(file, "utf8")) as AdventureDef;
    } catch (error) {
      problems.push(`${entry.name}: adventure.json is not valid JSON (${String(error)})`);
      continue;
    }
    if (def.id !== entry.name)
      problems.push(`${entry.name}: the id "${def.id}" must match its folder`);
    problems.push(...validateAdventure(def, { cards: registry.cards }));
    // Report missing paintings at import time instead of quietly publishing blank scenes.
    const art = new Set([
      def.art,
      def.mapArt,
      ...def.events.map((event) => event.art),
      ...def.events.flatMap((event) => event.beats.map((beat) => beat.art)),
      ...def.enemies.map((enemy) => enemy.art),
    ]);
    for (const name of art) {
      if (!name) continue;
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name))
        problems.push(`${entry.name}: art "${name}" must be a filename without an extension`);
      else if (!existsSync(join(base, entry.name, "art", `${name}.webp`)))
        problems.push(`${entry.name}: missing art/${name}.webp`);
    }
    adventures.push(def);
  }
  adventures.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { adventures, problems };
}

/**
 * Publishes adventures for the game: the validated definitions go to packages/content/src/adventures.json and the paintings
 * to public/adventures/<id>. Both are generated and not committed. A definition with problems is not published.
 */
export async function importAdventureAssets(
  root: string,
): Promise<{ count: number; problems: string[] }> {
  const { adventures, problems } = await readAdventures(root);
  const output = join(root, "packages/content/src/adventures.json");
  if (problems.length) return { count: 0, problems };
  const json = JSON.stringify(adventures, null, 2) + "\n";
  const current = existsSync(output) ? await readFile(output, "utf8") : "";
  if (current !== json) await writeFile(output, json);
  const media = join(root, "public/adventures");
  await rm(media, { recursive: true, force: true });
  const shared = join(root, "assets/adventures/shared");
  if (existsSync(shared)) await cp(shared, join(media, "shared"), { recursive: true });
  for (const adventure of adventures) {
    const art = join(root, "assets/adventures", adventure.id, "art");
    if (!existsSync(art)) continue;
    await mkdir(join(media, adventure.id), { recursive: true });
    await cp(art, join(media, adventure.id), { recursive: true });
  }
  return { count: adventures.length, problems };
}
