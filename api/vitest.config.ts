/**
 * vitest.config.ts : settings for the test runner (unit tests)
 *
 * Vitest runs the automated tests in the test/ folder. It understands
 * TypeScript directly, so the tests don't need to be compiled first.
 *
 * This file is used by "npm test" and runs the fast unit tests only. The
 * integration tests in test/integration/ need Docker and have their own
 * settings in vitest.integration.config.ts ("npm run test:integration").
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Which files count as tests.
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],

    // Make "describe", "it" and "expect" available in every test file
    // without importing them, the way most test runners do.
    globals: true,

    // Load "reflect-metadata" before the tests, because the TypeORM entity
    // decorators need it to be present.
    setupFiles: ['test/setup.ts'],
  },
});
