/**
 * picture.repository.test.ts : tests for the database queries
 *
 * The unit tests replace the repository with an in-memory list. These tests
 * check the real thing: that pictures are stored byte for byte, and that the
 * "latest" queries sort correctly in PostgreSQL.
 */
import type { DataSource } from 'typeorm';
import type { Animal } from '../../src/config/animals.js';
import { PictureRepository } from '../../src/pictures/picture.repository.js';
import { clearPictures, connectTestDatabase } from './helpers/database.js';

let dataSource: DataSource;
let repository: PictureRepository;

beforeAll(async () => {
  dataSource = await connectTestDatabase();
  repository = new PictureRepository(dataSource);
});

beforeEach(async () => {
  await clearPictures(dataSource);
});

afterAll(async () => {
  await dataSource.destroy();
});

/** A small, unsaved picture of the given animal. */
function newPicture(animal: Animal, imageData: Buffer = Buffer.from(`a ${animal}`)) {
  return {
    animal,
    provider: 'fake',
    sourceUrl: `https://fake.example/${animal}`,
    contentType: 'image/png',
    sizeBytes: imageData.byteLength,
    imageData,
  };
}

/** Saves a small picture of the given animal on its own. */
async function savePicture(animal: Animal, imageData?: Buffer) {
  const [saved] = await repository.saveAll([newPicture(animal, imageData)]);
  return saved!;
}

/** How many pictures are really in the database. */
async function savedPictureCount(): Promise<number> {
  const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM "animal_pictures"');
  return count;
}

/** Changes when a picture counts as saved, to test the sorting. */
async function setCreatedAt(id: number, createdAt: string) {
  await dataSource.query(`UPDATE "animal_pictures" SET "created_at" = $1 WHERE "id" = $2`, [createdAt, id]);
}

describe('PictureRepository.saveAll', () => {
  it('saves several pictures and returns them in the order given', async () => {
    const saved = await repository.saveAll([newPicture('cat'), newPicture('dog'), newPicture('bear')]);

    expect(saved.map((picture) => [picture.id, picture.animal])).toEqual([
      [1, 'cat'],
      [2, 'dog'],
      [3, 'bear'],
    ]);
    expect(await savedPictureCount()).toBe(3);
    // Saved together, so they count as saved at the same moment; the last one is the latest.
    expect((await repository.findLatest())?.animal).toBe('bear');
  });

  it('saves none of the pictures when one of them cannot be saved', async () => {
    // The database refuses a picture without contents (the column is NOT NULL).
    const broken = { ...newPicture('dog'), imageData: null as unknown as Buffer };

    await expect(repository.saveAll([newPicture('cat'), broken, newPicture('bear')])).rejects.toThrow(
      /null value in column "image_data"/,
    );

    expect(await savedPictureCount()).toBe(0);
  });

  it('gives the picture an id and a creation time', async () => {
    const before = new Date();

    const saved = await savePicture('cat');

    expect(saved.id).toBe(1);
    expect(saved.createdAt).toBeInstanceOf(Date);
    // Allow a second of clock difference between the test and the database container.
    expect(saved.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it('stores the picture byte for byte', async () => {
    // Every possible byte value, 0 to 255.
    const everyByte = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const saved = await savePicture('dog', everyByte);

    const loaded = await repository.findById(saved.id);

    expect(loaded?.imageData).toEqual(everyByte);
    expect(loaded).toMatchObject({
      animal: 'dog',
      provider: 'fake',
      sourceUrl: 'https://fake.example/dog',
      contentType: 'image/png',
      sizeBytes: 256,
    });
  });
});

describe('PictureRepository.findLatest', () => {
  it('returns null when nothing has been saved', async () => {
    expect(await repository.findLatest()).toBeNull();
    expect(await repository.findLatestDetails()).toBeNull();
  });

  it('returns the newest picture, whatever the animal', async () => {
    await savePicture('cat');
    await savePicture('dog');
    await savePicture('bear');

    expect(await repository.findLatest()).toMatchObject({ id: 3, animal: 'bear' });
  });

  it('sorts by creation time, not by id', async () => {
    await savePicture('cat');
    await savePicture('cat');
    await setCreatedAt(1, '2026-09-15T12:00:00Z');
    await setCreatedAt(2, '2026-09-15T11:00:00Z');

    expect((await repository.findLatest())?.id).toBe(1);
  });

  it('picks the higher id when two pictures were saved at the same moment', async () => {
    await savePicture('cat');
    await savePicture('cat');
    await setCreatedAt(1, '2026-09-15T12:00:00Z');
    await setCreatedAt(2, '2026-09-15T12:00:00Z');

    expect((await repository.findLatest())?.id).toBe(2);
    expect((await repository.findLatestDetails())?.id).toBe(2);
  });

  it('leaves the picture bytes out of the details', async () => {
    await savePicture('bear');

    const details = await repository.findLatestDetails();

    expect(details).toMatchObject({ id: 1, animal: 'bear', sizeBytes: 'a bear'.length });
    // TypeORM still puts an "imageData" key on the object, but leaves it empty.
    expect((details as { imageData?: Buffer } | null)?.imageData).toBeUndefined();
  });
});

describe('PictureRepository.findById', () => {
  it('returns null for an id that does not exist', async () => {
    expect(await repository.findById(42)).toBeNull();
  });
});
