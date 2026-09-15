/**
 * database.ts : connecting the integration tests to the test database
 *
 * The database itself is started by global-setup.ts. These helpers connect
 * to it the same way main.ts connects to the real one: same data source,
 * same migrations.
 */
import type { DataSource } from 'typeorm';
import { inject } from 'vitest';
import { createDataSource } from '../../../src/database/data-source.js';

/** Connects to the test database and brings its tables up to date. */
export async function connectTestDatabase(): Promise<DataSource> {
  const dataSource = createDataSource(inject('database'));
  await dataSource.initialize();
  await dataSource.runMigrations();
  return dataSource;
}

/**
 * Deletes every saved picture and restarts the ids at 1, so each test
 * starts with an empty table and predictable ids.
 */
export async function clearPictures(dataSource: DataSource): Promise<void> {
  await dataSource.query('TRUNCATE TABLE "animal_pictures" RESTART IDENTITY');
}
