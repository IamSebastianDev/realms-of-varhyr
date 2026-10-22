import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cardAssetsPlugin } from "../../tools/src/card-assets-plugin";
import { questAssetsPlugin } from "../../tools/src/quest-assets-plugin";
import { webpArtPlugin } from "../../tools/src/webp-art-plugin";

const repo = resolve(import.meta.dirname, "../..");
/** The game. Card art and the quest map are generated into the shared public/ folder by the plugins. */
export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(repo, "public"),
  plugins: [cardAssetsPlugin(repo), questAssetsPlugin(repo), react(), webpArtPlugin()],
  server: { fs: { allow: [repo] }, watch: { ignored: ["**/.card-import-*/**"] } },
});
