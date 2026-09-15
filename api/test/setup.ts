/**
 * test/setup.ts : runs once before the tests
 *
 * TypeORM's decorators (@Entity, @Column, ...) store information about each
 * class using the "reflect-metadata" library. That library must be loaded
 * before any entity file is imported, so it is loaded here, first thing.
 * The real application does the same in src/main.ts.
 */
import 'reflect-metadata';
