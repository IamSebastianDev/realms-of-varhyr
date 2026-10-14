import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { draftFromFiles, serialize, validate } from '../apps/studio/src/model';

const root = 'assets/cards';
const folders = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('card studio model', () => {
  it.each(folders)('%s survives a load and save unchanged', folder => {
    const data = read(`${root}/${folder}/data.json`);
    const dePath = `${root}/${folder}/data.de.json`, de = existsSync(dePath) ? read(dePath) : undefined;
    const out = serialize(draftFromFiles(folder, data, de));
    // Key order and empty optional fields vary in hand-written files; the content must not.
    const plain = (card: any) => JSON.parse(JSON.stringify({ ...card, cost: { ...card.cost, factions: Object.keys(card.cost.factions ?? {}).length ? card.cost.factions : undefined }, stats: card.stats && { ...card.stats, energyOutputs: card.stats.energyOutputs?.length ? card.stats.energyOutputs : undefined } }));
    expect(plain(out.data)).toEqual(plain(data));
    if (de) expect(out.de).toEqual(de);
  });

  it('validates every existing card as saveable', () => {
    const ids = new Set(folders);
    for (const folder of folders) {
      const draft = draftFromFiles(folder, read(`${root}/${folder}/data.json`));
      expect(validate(draft, ids, true).errors, folder).toEqual([]);
    }
  });
});
