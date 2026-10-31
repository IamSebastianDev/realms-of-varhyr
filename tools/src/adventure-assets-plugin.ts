import { join } from "node:path";
import type { Plugin } from "vite";
import { importAdventureAssets } from "./adventure-assets";
import { repoRoot } from "./repoRoot";

/** Publishes adventure definitions and art when Vite starts, and again whenever an authored file changes. */
export function adventureAssetsPlugin(root: string = repoRoot): Plugin {
  const folder = join(root, "assets/adventures");
  const run = async (log: (message: string) => void) => {
    const result = await importAdventureAssets(root);
    for (const problem of result.problems) log(`Adventure: ${problem}`);
    return result;
  };
  return {
    name: "varhyr-adventure-assets",
    async configResolved(config) {
      try {
        await run((message) => config.logger.warn(message));
      } catch (error) {
        config.logger.warn(`Adventures: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    configureServer(server) {
      server.watcher.add(folder);
      server.watcher.on("change", async (file) => {
        if (!file.startsWith(folder)) return;
        try {
          const result = await run((message) => server.config.logger.warn(message));
          if (!result.problems.length) {
            server.config.logger.info("Adventures republished.");
            server.ws.send({ type: "full-reload" });
          }
        } catch (error) {
          server.config.logger.warn(
            `Adventures: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    },
  };
}
