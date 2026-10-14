import type { Plugin } from 'vite';
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

/**
 * Production builds ship card art as WebP, typically a fraction of the PNG size. The authoring PNGs in assets/,
 * the generated public/cards folder, the dev server and the importer are untouched: the swap happens only in the build
 * output, and only for card art.
 */
export function webpArtPlugin({ quality = 82 }: { quality?: number } = {}): Plugin {
  let outDir = '', replaced = 0;
  return {
    name: 'varhyr-webp-art',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    // The card catalogue holds every art URL; point them at the converted files.
    transform(code, id) {
      if (!id.split('?')[0].replace(/\\/g, '/').endsWith('packages/content/src/cards.json')) return;
      const next = code.replaceAll('/data.png?v=', '/data.webp?v=');
      if (next !== code) replaced += 1;
      return { code: next, map: null };
    },
    async closeBundle() {
      if (!replaced) return; // The catalogue never made it into this build (it failed), so there is nothing to convert.
      const cards = join(outDir, 'cards');
      let folders: string[];
      try { folders = (await readdir(cards, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name); }
      catch { return; }
      let before = 0, after = 0;
      for (let start = 0; start < folders.length; start += 4) {
        await Promise.all(folders.slice(start, start + 4).map(async folder => {
          const source = join(cards, folder, 'data.png');
          before += (await stat(source)).size;
          after += (await sharp(source).webp({ quality, effort: 5 }).toFile(join(cards, folder, 'data.webp'))).size;
          await rm(source);
        }));
      }
      // Stylesheets and pages may name a card's art directly (the menu backdrop does).
      const walk = async (directory: string): Promise<string[]> => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry =>
        entry.isDirectory() ? walk(join(directory, entry.name)) : Promise.resolve(/\.(css|html)$/.test(entry.name) ? [join(directory, entry.name)] : [])))).flat();
      for (const file of await walk(outDir)) {
        const text = await readFile(file, 'utf8'), next = text.replace(/(\/cards\/[a-z0-9-]+\/data)\.png/g, '$1.webp');
        if (next !== text) await writeFile(file, next);
      }
      console.log(`Card art: ${folders.length} PNGs → WebP, ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB.`);
    },
  };
}
