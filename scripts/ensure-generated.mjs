// The card importer loads modules that import the generated JSON files. On a fresh checkout (CI, Cloudflare)
// those files do not exist yet, so create empty placeholders; the importer then overwrites them.
import { existsSync, writeFileSync } from 'node:fs';
for (const name of ['cards', 'factions', 'sets']) {
  const file = new URL(`../packages/content/src/${name}.json`, import.meta.url);
  if (!existsSync(file)) writeFileSync(file, '[]\n');
}
