/**
 * vitest.integration.config.ts : settings for the integration tests
 *
 * Used by "npm run test:integration". These tests run against a real
 * PostgreSQL database, which is started in a throwaway Docker container
 * before the tests and removed afterwards (see test/integration/global-setup.ts).
 * Docker must be running.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globals: true,
    setupFiles: ['test/setup.ts'],

    // Start the database container once, before any test file runs.
    globalSetup: ['test/integration/global-setup.ts'],

    // All test files share the one database and empty it before each test,
    // so they must run one after the other, never at the same time.
    fileParallelism: false,

    // Real database work is slower than in-memory fakes.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
