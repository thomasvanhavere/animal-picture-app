/**
 * global-setup.ts : starts a real PostgreSQL database for the integration tests
 *
 * Vitest runs this once, before any integration test file. It starts the
 * same PostgreSQL image that docker-compose.yml uses, in a temporary Docker
 * container on a random free port, and hands the connection details to the
 * tests. When all tests are done, the container is removed again.
 *
 * The container is completely separate from the one started by Docker
 * Compose, so running the tests never touches your saved pictures.
 */
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import type { DatabaseConfig } from '../../src/config/config.js';

// Tells TypeScript what inject('database') returns in the test files.
declare module 'vitest' {
  export interface ProvidedContext {
    database: DatabaseConfig;
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('animal_picture_test')
    .withUsername('animal_picture_test')
    .withPassword('animal_picture_test')
    .start();

  project.provide('database', {
    host: container.getHost(),
    port: container.getPort(),
    name: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
  });

  // Vitest calls the returned function after the last test.
  return async () => {
    await container.stop();
  };
}
