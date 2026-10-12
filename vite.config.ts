import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cardAssetsPlugin } from './scripts/card-assets-plugin';
export default defineConfig({ plugins: [cardAssetsPlugin(),react()], server: { watch: { ignored: ['**/.card-import-*/**'] } } });
