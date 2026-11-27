import { defineConfig, type Plugin } from 'vite';
import { createDevApi } from './src/server/devMiddleware';

/** Serves the game API at /api during `npm run dev` and `npm run preview`, like Netlify does online. */
function gameApi(): Plugin {
  const middleware = createDevApi();
  return {
    name: 'ghostlight-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the build works from any folder or host path.
  base: './',
  plugins: [gameApi()],
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
