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
  };
}
