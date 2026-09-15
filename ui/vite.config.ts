/**
 * vite.config.ts : settings for Vite (the build tool) and Vitest (the tests)
 *
 * Vite does two jobs:
 *   - "npm run dev" starts a development server that reloads the page on
 *     every change,
 *   - "npm run build" turns index.html, the TypeScript and the CSS into a
 *     few small files in dist/, which Nginx serves in the Docker container.
 */
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Read the project's .env file (one folder up), if there is one, to find
  // the API's port. Without it, the default port from .env.defaults is used.
  const env = loadEnv(mode, '..', '');
  const apiPort = env['API_PORT'] || '3000';

  return {
    server: {
      port: 5173,
      // In development, the page runs on Vite's server, not on Nginx. Pass
      // /api requests on to the API running on this machine, just like
      // Nginx does inside Docker, so the page's code is the same in both.
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },

    test: {
      include: ['test/**/*.test.ts'],
      globals: true,
      // The tests run in Node.js, which has no web page. jsdom provides a
      // fake one (document, elements, events) for the tests to use.
      environment: 'jsdom',
    },
  };
});
