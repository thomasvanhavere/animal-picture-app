/**
 * 1757844000000-create-animal-pictures.ts : creates the animal_pictures table
 *
 * A "migration" is a recorded change to the database structure. TypeORM
 * keeps a list of the migrations that have already been applied (in a table
 * called "migrations"), so each one runs exactly once, no matter how often
 * the app is restarted.
 *
 * The number is a timestamp (milliseconds since 1970). TypeORM reads it from
 * the end of the migration's `name` below and runs migrations oldest first;
 * the file name starts with it only to keep the files in the same order.
 * Future changes to the table (a new column, for example) get their own,
 * newer migration, which must also be added to the list in data-source.ts.
 *
 * "up" applies the change, "down" undoes it.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnimalPictures1757844000000 implements MigrationInterface {
  /** TypeORM records this name to remember that the migration has run. */
  name = 'CreateAnimalPictures1757844000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The columns match the properties in animal-picture.entity.ts.
    await queryRunner.query(`
      CREATE TABLE "animal_pictures" (
        "id"           SERIAL PRIMARY KEY,
        "animal"       TEXT        NOT NULL,
        "provider"     TEXT        NOT NULL,
        "source_url"   TEXT        NOT NULL,
        "content_type" TEXT        NOT NULL,
        "size_bytes"   INTEGER     NOT NULL,
        "image_data"   BYTEA       NOT NULL,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // This index speeds up "newest picture of one animal" (WHERE animal = ...
    // ORDER BY created_at DESC). The API never asks that: its "latest picture"
    // is of any animal, and this index can't help with that, because it is
    // sorted by animal first.
    await queryRunner.query(`
      CREATE INDEX "idx_animal_pictures_animal_created_at"
        ON "animal_pictures" ("animal", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping the table also removes its index.
    await queryRunner.query(`DROP TABLE "animal_pictures"`);
  }
}
