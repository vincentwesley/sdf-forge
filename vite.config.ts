import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works from any subpath (GitHub Pages serves it at /sdf-forge/).
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
