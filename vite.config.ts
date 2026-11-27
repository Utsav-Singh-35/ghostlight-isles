import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any folder or host path.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js alone is about 700 KB minified; warn only above that.
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
  },
});
