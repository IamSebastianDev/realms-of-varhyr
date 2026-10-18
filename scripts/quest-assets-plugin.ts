import { join } from 'node:path';
import type { Plugin } from 'vite';
import { importQuestAssets } from './quest-assets';

/** Cuts the quest map into tiles when Vite starts or builds. A missing map is fine: the quest screen says so. */
export function questAssetsPlugin(): Plugin {
  return {
    name: 'varhyr-quest-assets',
    async configResolved(config) {
      try {
        const result = await importQuestAssets(config.root);
        if (result?.tiles) config.logger.info(`Cut the quest map into ${result.tiles} tiles.`);
      } catch (error) { config.logger.warn(`Quest map: ${error instanceof Error ? error.message : String(error)}`); }
    },
    // The studio saves map.json while the game runs; publish it again at once so a new expedition sees the change without restarting Vite.
    configureServer(server) {
      const source = join(server.config.root, 'assets/quest/map.json');
      const art = join(server.config.root, 'assets/quest/art');
      server.watcher.add([source, art]);
      server.watcher.on('change', async file => {
        if (file !== source && !file.startsWith(art)) return;
        try { await importQuestAssets(server.config.root); server.config.logger.info('Quest map republished.'); server.ws.send({ type: 'full-reload' }); }
        catch (error) { server.config.logger.warn(`Quest map: ${error instanceof Error ? error.message : String(error)}`); }
      });
    },
  };
}
