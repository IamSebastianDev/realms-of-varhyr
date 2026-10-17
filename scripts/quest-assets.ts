import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { parseMap } from '../packages/quest/src/map';

export const tileSize = 512;
export type TileInfo = { size: number; maxZoom: number; width: number; height: number };

/**
 * Publishes the quest map to public/quest: the node file, plus the painted map cut into a pyramid of 512 px tiles
 * (level 0 is one tile; each level doubles the width, and the last level is the full-size image).
 * The tiles are generated and not committed, like the card assets. Unchanged art is not cut again.
 */
export async function importQuestAssets(root: string): Promise<{ tiles: number } | null> {
  const source = join(root, 'assets/quest/map.json'), out = join(root, 'public/quest');
  if (!existsSync(source)) return null;
  const map = parseMap(await readFile(source, 'utf8'));
  const imagePath = join(root, 'assets/quest', map.image);
  if (!map.image || !existsSync(imagePath)) throw new Error(`Quest map image assets/quest/${map.image} is missing.`);
  const info = await stat(imagePath), stamp = `${info.size}-${Math.round(info.mtimeMs)}`, stampFile = join(out, '.stamp');
  const meta = await sharp(imagePath, { limitInputPixels: false }).metadata();
  const width = meta.width!, height = meta.height!, maxZoom = Math.max(0, Math.ceil(Math.log2(width / tileSize)));
  const tiles: TileInfo = { size: tileSize, maxZoom, width, height };
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'map.json'), JSON.stringify({ ...map, tiles }) + '\n');
  if (existsSync(stampFile) && (await readFile(stampFile, 'utf8')) === stamp) return { tiles: 0 };
  await rm(join(out, 'tiles'), { recursive: true, force: true });
  let count = 0;
  for (let z = 0; z <= maxZoom; z++) {
    const w = z === maxZoom ? width : tileSize * 2 ** z, h = Math.round(w * height / width);
    const level = await sharp(imagePath, { limitInputPixels: false }).resize(w, h, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    await mkdir(join(out, 'tiles', String(z)), { recursive: true });
    for (let y = 0; y * tileSize < h; y++) for (let x = 0; x * tileSize < w; x++) {
      const region = { left: x * tileSize, top: y * tileSize, width: Math.min(tileSize, w - x * tileSize), height: Math.min(tileSize, h - y * tileSize) };
      await sharp(level.data, { raw: level.info }).extract(region).jpeg({ quality: 82, mozjpeg: true }).toFile(join(out, 'tiles', String(z), `${x}_${y}.jpg`));
      count++;
    }
  }
  await writeFile(stampFile, stamp);
  return { tiles: count };
}
