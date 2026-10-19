import { t as msg } from '../../../packages/ui/src/i18n';
import { registry } from '../../../packages/content/src';
import { cardBacks, cardBackArt } from './cardBacks';
import { audioUrls } from './AudioExperience';
import { preloadPacks } from './packScene';
import { factionArenas, fallbackArena } from './arenas';

/** Images that were preloaded stay referenced here, so the browser keeps them decoded and ready. */
const held = new Map<string, HTMLImageElement>();
const CONCURRENCY = 4;

function load(src: string): Promise<void> {
  if (held.has(src)) return Promise.resolve();
  return new Promise(resolve => {
    const image = new Image();
    image.decoding = 'async';
    const done = () => { held.set(src, image); resolve(); };
    image.onload = () => { image.decode?.().then(done, done); };
    image.onerror = () => resolve();
    image.src = src;
  });
}

export type PreloadProgress = { done: number; total: number; label: string };

/** Load a list in order, a few at a time, so the first entries are ready first. */
async function loadAll(tasks: (() => Promise<void>)[], tick: () => void) {
  const queue = [...tasks];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { for (let task = queue.shift(); task; task = queue.shift()) { await task().catch(() => {}); tick(); } }));
}

/** Audio is fetched into the browser cache, so it starts without a wait once sound is allowed. */
const fetched = (url: string) => () => fetch(url).then(response => response.blob()).then(() => {});
const image = (src: string) => () => load(src);

let started: Promise<void> | null = null;

/** Everything the lobby, store and a match will show, in the order it is likely to be needed. Resolves when all of it is ready (or after a time limit, so a bad connection never traps the player). */
export function preloadAssets(onProgress: (progress: PreloadProgress) => void = () => {}): Promise<void> {
  if (started) return started;
  const cards = Object.values(registry.cards).map(card => card.art).filter((art): art is string => !!art);
  const unique = (list: string[]) => [...new Set(list)];
  const groups: [string, (() => Promise<void>)[]][] = [
    [msg('Loading the valley'), unique(['/art/varhyr-valley.png', '/art/screen-decks.jpg', '/art/screen-packs.jpg', '/art/screen-store.jpg', '/art/screen-profile.jpg']).map(image)],
    [msg('Loading cards'), unique(cards).map(image)],
    [msg('Loading card backs'), cardBacks.map(back => image(cardBackArt(back.id)))],
    [msg('Loading battlefields'), unique([fallbackArena.art, ...Object.values(factionArenas).map(arena => arena.art)]).map(image)],
    [msg('Loading sound'), unique(Object.values(audioUrls.effects).flat()).map(fetched)],
    [msg('Loading booster packs'), [() => preloadPacks()]],
    [msg('Loading music'), unique(audioUrls.music).map(fetched)],
  ];
  const total = groups.reduce((sum, [, list]) => sum + list.length, 0);
  let done = 0;
  const run = (async () => {
    await Promise.race([document.fonts?.ready, new Promise(resolve => setTimeout(resolve, 3000))]);
    for (const [label, list] of groups) {
      onProgress({ done, total, label });
      await loadAll(list, () => { done += 1; onProgress({ done, total, label }); });
    }
    onProgress({ done: total, total, label: msg('Ready') });
  })();
  started = Promise.race([run, new Promise<void>(resolve => setTimeout(resolve, 30000))]);
  return started;
}
