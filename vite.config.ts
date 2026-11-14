import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any path (GitHub Pages included).
  base: './',
  server: { port: 5183 },
  build: { chunkSizeWarningLimit: 2500 },
});
