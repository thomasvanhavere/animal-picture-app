/**
 * 1757844000000-create-animal-pictures.ts : creates the animal_pictures table
 *
 * A "migration" is a recorded change to the database structure. TypeORM
 * keeps a list of the migrations that have already been applied (in a table
 * called "migrations"), so each one runs exactly once, no matter how often
 * the app is restarted.
 *
 * The number at the start of the file name is a timestamp. It puts the
 * migrations in order when there are several. Future changes to the table
 * (a new column, for example) get their own, newer migration file.
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

    // The "latest picture" request always asks: "newest row, optionally for
    // one animal". This index lets the database answer that without reading
    // the whole table.
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
