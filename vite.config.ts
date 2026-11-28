import { defineConfig, loadEnv, type Plugin } from 'vite';
import { createDevApi } from './src/server/devMiddleware';

/**
 * Serves the game API at /api, like Netlify does online. `npm run dev` uses MongoDB when `.env`
 * sets MONGODB_URI; `npm run preview` (and so the smoke test) always uses memory, so tests never
 * write to the real database.
 */
function gameApi(env: Record<string, string>): Plugin {
  return {
    name: 'ghostlight-api',
    configureServer(server) {
      server.middlewares.use(createDevApi({ mongoUri: env.MONGODB_URI, mongoDb: env.MONGODB_DB, jwtSecret: env.JWT_SECRET }));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createDevApi());
    },
  };
}

export default defineConfig(({ mode }) => {
  // Every variable from .env, not only VITE_ ones. They stay on the server: nothing here reaches the browser.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Relative asset paths, so the build works from any folder or host path.
    base: './',
    plugins: [gameApi(env)],
    build: {
      target: 'es2022',
      sourcemap: true,
      // three.js alone is about 700 KB minified; warn only above that.
      chunkSizeWarningLimit: 900,
    },
    server: {
      port: 5173,
    },
  };
});
