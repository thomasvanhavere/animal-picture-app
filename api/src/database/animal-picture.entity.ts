/**
 * animal-picture.entity.ts : the database table for saved pictures
 *
 * An "entity" is a TypeScript class that describes one database table. Each
 * property is one column. TypeORM reads the @Entity and @Column annotations
 * (called "decorators") to know how to save and load rows of this table.
 * If you know Java, this works just like a JPA/Hibernate entity.
 *
 * Every column states its database type explicitly (type: 'text', ...), so
 * the file is a complete description of the table without needing to guess
 * from the TypeScript types.
 *
 * The table itself is created by the migration in migrations/, which
 * contains the matching SQL.
 */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { Animal } from '../config/animals.js';

/** One downloaded animal picture, exactly as it was received from the picture service. */
@Entity({ name: 'animal_pictures' })
// The index created by the migration, for the "latest picture" query. Listed
// here too, so TypeORM knows it belongs to the table and never drops it.
@Index('idx_animal_pictures_animal_created_at', ['animal', 'createdAt'])
export class AnimalPicture {
  /** A number that uniquely identifies the picture. The database hands these out in order. */
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  /** Which animal is in the picture: "cat", "dog" or "bear". */
  @Column({ type: 'text' })
  animal!: Animal;

  /** Which picture service it came from, for example "cataas". */
  @Column({ type: 'text' })
  provider!: string;

  /** The exact web address the picture was downloaded from. */
  @Column({ name: 'source_url', type: 'text' })
  sourceUrl!: string;

  /** The kind of file, for example "image/jpeg". Sent back to the browser so it knows how to show the picture. */
  @Column({ name: 'content_type', type: 'text' })
  contentType!: string;

  /** The size of the picture file in bytes. Stored separately so it can be shown without loading the picture itself. */
  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  /**
   * The picture file itself. "bytea" is PostgreSQL's type for raw binary data.
   *
   * Storing the bytes (instead of only the link) means the picture is still
   * there even if the picture service goes offline or changes its pictures.
   */
  @Column({ name: 'image_data', type: 'bytea' })
  imageData!: Buffer;

  /** When the picture was saved. Filled in automatically by the database. */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
