/**
 * picture.service.test.ts : tests for the business rules
 *
 * The service is tested with a fake downloader and a fake repository (an
 * in-memory list instead of a database), so these tests are fast and need
 * nothing installed.
 */
import type { Animal } from '../src/config/animals.js';
import type { AnimalPicture } from '../src/database/animal-picture.entity.js';
import { BadGatewayError, BadRequestError, NotFoundError } from '../src/errors/http-error.js';
import type { DownloadedPicture, PictureDownloader } from '../src/pictures/picture-downloader.js';
import type { PictureRepository } from '../src/pictures/picture.repository.js';
import { PictureService } from '../src/pictures/picture.service.js';

/**
 * A downloader that returns a tiny fake picture and remembers which animals were asked for.
 * With failOnDownload set, that download (1 = the first) fails like an unreachable picture service.
 */
function fakeDownloader(failOnDownload?: number) {
  const requested: Animal[] = [];
  const downloader = {
    async download(animal: Animal): Promise<DownloadedPicture> {
      requested.push(animal);
      if (requested.length === failOnDownload) {
        throw new BadGatewayError(`The ${animal} picture service answered with HTTP 503.`);
      }
      return {
        animal,
        provider: 'fake',
        sourceUrl: `https://fake.example/${animal}`,
        contentType: 'image/jpeg',
        imageData: Buffer.from(`picture of a ${animal}`),
      };
    },
  } as unknown as PictureDownloader;
  return { downloader, requested };
}

/** A repository that keeps pictures in a list instead of a database. */
function fakeRepository() {
  const rows: AnimalPicture[] = [];
  const latest = () => rows.at(-1) ?? null;

  const repository = {
    async saveAll(pictures: Omit<AnimalPicture, 'id' | 'createdAt'>[]): Promise<AnimalPicture[]> {
      const saved = pictures.map((picture, i) => ({ ...picture, id: rows.length + i + 1, createdAt: new Date() }));
      rows.push(...saved);
      return saved;
    },
    async findLatest() {
      return latest();
    },
    async findLatestDetails() {
      const row = latest();
      if (!row) return null;
      const { imageData: _imageData, ...details } = row;
      return details;
    },
    async findById(id: number) {
      return rows.find((row) => row.id === id) ?? null;
    },
  } as unknown as PictureRepository;
  return { repository, rows };
}

/** The settings the service sees: cats and dogs only, random default, at most 3 pictures per request. */
const config: ConstructorParameters<typeof PictureService>[0] = {
  enabledAnimals: ['cat', 'dog'],
  defaultAnimal: 'random',
  maxPicturesPerRequest: 3,
};

function makeService(overrides: Partial<typeof config> = {}, failOnDownload?: number) {
  const { downloader, requested } = fakeDownloader(failOnDownload);
  const { repository, rows } = fakeRepository();
  const service = new PictureService({ ...config, ...overrides }, downloader, repository);
  return { service, requested, rows };
}

describe('PictureService.fetchAndSave', () => {
  it('downloads one picture by default and saves it with its size', async () => {
    const { service, rows } = makeService();

    const saved = await service.fetchAndSave('cat');

    expect(saved).toHaveLength(1);
    expect(rows[0]).toMatchObject({ animal: 'cat', provider: 'fake', sizeBytes: 'picture of a cat'.length });
    // The answer never contains the picture bytes, only the details.
    expect(saved[0]).not.toHaveProperty('imageData');
  });

  it('downloads as many pictures as asked, in order', async () => {
    const { service, requested } = makeService();

    const saved = await service.fetchAndSave('dog', 3);

    expect(requested).toEqual(['dog', 'dog', 'dog']);
    expect(saved.map((picture) => picture.id)).toEqual([1, 2, 3]);
  });

  it('uses the default animal when none is given', async () => {
    const { service, requested } = makeService({ defaultAnimal: 'dog' });

    await service.fetchAndSave(undefined, 2);

    expect(requested).toEqual(['dog', 'dog']);
  });

  it('picks a random enabled animal when the default is "random"', async () => {
    const { service, requested } = makeService({ maxPicturesPerRequest: 20 });

    await service.fetchAndSave(undefined, 20);

    expect(requested).toHaveLength(20);
    for (const animal of requested) {
      expect(['cat', 'dog']).toContain(animal);
    }
  });

  it('picks a random enabled animal when asked for "random", whatever the default is', async () => {
    const { service, requested } = makeService({ defaultAnimal: 'dog' });
    // Make the "random" choice predictable: 0 picks the first enabled animal.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);

    await service.fetchAndSave('random', 2);

    random.mockRestore();
    expect(requested).toEqual(['cat', 'cat']);
  });

  it('refuses an animal that is switched off', async () => {
    const { service } = makeService();

    await expect(service.fetchAndSave('bear')).rejects.toThrow(
      new BadRequestError('Pictures of "bear" are switched off. Enabled animals: cat, dog.'),
    );
  });

  it('saves nothing when one of the downloads fails', async () => {
    const { service, requested, rows } = makeService({}, 2);

    await expect(service.fetchAndSave('cat', 3)).rejects.toThrow(BadGatewayError);

    // It stops at the failing download, and the first picture isn't kept either.
    expect(requested).toEqual(['cat', 'cat']);
    expect(rows).toEqual([]);
  });

  it('refuses a count outside 1..MAX_PICTURES_PER_REQUEST', async () => {
    const { service } = makeService();

    await expect(service.fetchAndSave('cat', 0)).rejects.toThrow(BadRequestError);
    await expect(service.fetchAndSave('cat', 4)).rejects.toThrow(
      new BadRequestError('count must be between 1 and 3, but it is 4.'),
    );
  });
});

describe('PictureService.getLatest', () => {
  it('returns the newest picture, with its bytes', async () => {
    const { service } = makeService();
    await service.fetchAndSave('cat');
    await service.fetchAndSave('dog');

    const latest = await service.getLatest();

    expect(latest).toMatchObject({ id: 2, animal: 'dog' });
    expect(latest.imageData.toString()).toBe('picture of a dog');
    expect(await service.getLatestDetails()).toMatchObject({ id: 2, animal: 'dog' });
  });

  it('reports when nothing has been saved yet', async () => {
    const { service } = makeService();

    await expect(service.getLatest()).rejects.toThrow(new NotFoundError('No picture has been saved yet.'));
    await expect(service.getLatestDetails()).rejects.toThrow(new NotFoundError('No picture has been saved yet.'));
  });

  it('finds a picture by id', async () => {
    const { service } = makeService();
    await service.fetchAndSave('dog');

    expect((await service.getById(1)).animal).toBe('dog');
    await expect(service.getById(99)).rejects.toThrow(new NotFoundError('There is no picture with id 99.'));
  });
});
