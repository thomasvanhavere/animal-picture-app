/**
 * migrations.test.ts : checks that the migrations build the right table
 *
 * Runs the migrations against a real PostgreSQL database and then asks the
 * database itself what it contains, so a mistake in the SQL (a wrong column
 * type, a missing index) is caught here instead of in production.
 */
import type { DataSource } from 'typeorm';
import { connectTestDatabase } from './helpers/database.js';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await connectTestDatabase();
});

afterAll(async () => {
  await dataSource.destroy();
});

describe('database migrations', () => {
  it('create the animal_pictures table with the columns the entity expects', async () => {
    const columns = await dataSource.query(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'animal_pictures'
       ORDER BY ordinal_position
    `);

    expect(columns).toEqual([
      { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
      { column_name: 'animal', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'provider', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'source_url', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'content_type', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'size_bytes', data_type: 'integer', is_nullable: 'NO' },
      { column_name: 'image_data', data_type: 'bytea', is_nullable: 'NO' },
      { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
    ]);
  });

  it('create the index used by the "latest picture" query', async () => {
    const indexes = await dataSource.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'animal_pictures' ORDER BY indexname`,
    );

    expect(indexes.map((row: { indexname: string }) => row.indexname)).toContain(
      'idx_animal_pictures_animal_created_at',
    );
  });

  it('match the entity, so TypeORM finds nothing left to change', async () => {
    // TypeORM compares the entity classes with the real tables and lists the
    // SQL it would need to make them equal. There should be nothing.
    const pending = await dataSource.driver.createSchemaBuilder().log();

    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('are applied only once, however often the app starts', async () => {
    // connectTestDatabase already ran them in beforeAll.
    expect(await dataSource.runMigrations()).toEqual([]);
  });

  it('can be undone and applied again', async () => {
    await dataSource.undoLastMigration();
    const [{ exists: existsAfterUndo }] = await dataSource.query(
      `SELECT to_regclass('animal_pictures') IS NOT NULL AS exists`,
    );
    expect(existsAfterUndo).toBe(false);

    const applied = await dataSource.runMigrations();
    expect(applied.map((migration) => migration.name)).toEqual(['CreateAnimalPictures1757844000000']);
  });
});
