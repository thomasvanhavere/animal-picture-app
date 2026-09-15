/**
 * test/setup.ts : runs before every test file
 *
 * TypeORM's decorators (@Entity, @Column, ...) store information about each
 * class using the "reflect-metadata" library. That library must be loaded
 * before any entity file is imported, so it is loaded here, first thing.
 * The real application does the same in src/main.ts.
 *
 * Both Vitest configs list it under "setupFiles". The start-up that runs only
 * once, for the integration tests, is test/integration/global-setup.ts.
 */
import 'reflect-metadata';
