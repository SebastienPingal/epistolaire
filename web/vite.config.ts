import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // En local, les requêtes /api vont au serveur Rust (`cargo run`).
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
