/**
 * main.ts : the starting point of the API service
 *
 * This is the file Node.js runs. It does the start-up steps in order:
 *   1. read and check the settings,
 *   2. connect to the database and apply any pending migrations,
 *   3. build the app from its parts,
 *   4. start listening for requests,
 * and it shuts everything down cleanly when the container is stopped.
 *
 * If any step fails, the process stops with a clear message and a non-zero
 * exit code, so Docker knows the start failed.
 */

// Must be the very first import: TypeORM's decorators depend on it.
import 'reflect-metadata';

import { createApplication } from './application.js';
import { ConfigError, loadConfig } from './config/config.js';
import { createDataSource } from './database/data-source.js';

async function main(): Promise<void> {
  // 1. Settings. Stops with a ConfigError naming the bad setting, if any.
  const config = loadConfig();
  console.log(`Enabled animals: ${config.enabledAnimals.join(', ')} (default: ${config.defaultAnimal})`);

  // 2. Database.
  const dataSource = createDataSource(config.database);
  console.log(`Connecting to database "${config.database.name}" at ${config.database.host}:${config.database.port} ...`);
  await dataSource.initialize();
  const appliedMigrations = await dataSource.runMigrations();
  console.log(
    appliedMigrations.length > 0
      ? `Applied ${appliedMigrations.length} database migration(s).`
      : 'Database is up to date.',
  );

  // 3. Build the app from its parts (see application.ts).
  const app = createApplication(config, dataSource);

  // 4. Listen. "0.0.0.0" means "on every network interface", which is
  // needed inside a container so that requests from outside reach it.
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`animal-picture-api is listening on port ${config.port}.`);
  });

  // Clean shutdown. Docker sends SIGTERM when stopping a container; without
  // this, requests in progress would be cut off and the database connection
  // left hanging. SIGINT is what Ctrl+C sends, for example to stop
  // "npm run dev:api".
  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down ...`);
    server.close(async () => {
      await dataSource.destroy();
      console.log('Goodbye.');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(`Configuration error: ${error.message}`);
  } else {
    console.error('The API could not start:', error);
  }
  process.exit(1);
});
