import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { cardAssetsPlugin } from '../../scripts/card-assets-plugin';

const repo = resolve(__dirname, '../..');
/** The card studio is its own Vite app. It shares the repository's card assets, public art and packages. */
export default defineConfig({
  root: __dirname,
  publicDir: resolve(repo, 'public'),
  cacheDir: resolve(repo, 'node_modules/.vite-studio'),
  plugins: [cardAssetsPlugin(repo, { reload: false }), react()],
  // The studio writes cards itself, so it must not reload when the importer regenerates the catalogue.
  server: { port: 5174, fs: { allow: [repo] }, watch: { ignored: ['**/.card-import-*/**', '**/packages/content/src/*.json'] } },
  build: { outDir: resolve(repo, 'dist-studio'), emptyOutDir: true },
});
