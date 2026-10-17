import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cardAssetsPlugin } from './scripts/card-assets-plugin';
import { webpArtPlugin } from './scripts/webp-art-plugin';
import { questAssetsPlugin } from './scripts/quest-assets-plugin';
export default defineConfig({ plugins: [cardAssetsPlugin(),questAssetsPlugin(),react(),webpArtPlugin()], server: { watch: { ignored: ['**/.card-import-*/**'] } } });
