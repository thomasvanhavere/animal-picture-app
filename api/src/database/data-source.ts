/**
 * data-source.ts : the connection to the PostgreSQL database
 *
 * A TypeORM "DataSource" holds the connection settings, knows which entities
 * (tables) and migrations exist, and manages a pool of open connections that
 * the rest of the app borrows from.
 */
import { DataSource } from 'typeorm';
import type { DatabaseConfig } from '../config/config.js';
import { AnimalPicture } from './animal-picture.entity.js';
import { CreateAnimalPictures1757844000000 } from './migrations/1757844000000-create-animal-pictures.js';

/**
 * Builds a DataSource from the database settings. It is not connected yet:
 * call `await dataSource.initialize()` to connect (main.ts does this).
 */
export function createDataSource(database: DatabaseConfig): DataSource {
  return new DataSource({
    type: 'postgres',
    host: database.host,
    port: database.port,
    database: database.name,
    username: database.user,
    password: database.password,

    // Every table the app uses.
    entities: [AnimalPicture],

    // Every change to the database structure, in order.
    migrations: [CreateAnimalPictures1757844000000],

    // Never let TypeORM change the table structure on its own by comparing
    // it to the entity classes. All changes go through migrations, so they
    // are explicit and repeatable.
    synchronize: false,

    // Set to true to print every SQL statement, which helps when debugging.
    logging: false,
  });
}
