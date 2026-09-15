/**
 * api.e2e.test.ts : end-to-end tests of the whole API
 *
 * "End to end" means nothing is faked inside the app. Every request goes
 * through the same code that runs in production:
 *
 *   HTTP request -> routes -> controller -> service -> downloader -> picture service
 *                                                   -> repository -> PostgreSQL
 *
 * Only the two things outside the app are replaced: the database is a
 * temporary PostgreSQL container, and the picture service is a small local
 * web server (see helpers/fake-picture-service.ts). The settings are read
 * with loadConfig, just like at start-up.
 *
 * Each test describes something a user of the API does, and checks both the
 * HTTP answer and what really ended up in the database.
 */
import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApplication } from '../../src/application.js';
import { loadConfig, type Config } from '../../src/config/config.js';
import { createDataSource } from '../../src/database/data-source.js';
import { clearPictures, connectTestDatabase } from './helpers/database.js';
import { startFakePictureService, type FakePictureService } from './helpers/fake-picture-service.js';

let dataSource: DataSource;
let pictureService: FakePictureService;
let config: Config;
let app: Express;

beforeAll(async () => {
  dataSource = await connectTestDatabase();
  pictureService = await startFakePictureService();

  // Cats and dogs are switched on, bears are off. Without an animal in the
  // request, a dog is fetched. No random size variation, so the addresses
  // the app asks for are predictable.
  config = loadConfig({
    ENABLED_ANIMALS: 'cat,dog',
    DEFAULT_ANIMAL: 'dog',
    PICTURE_SIZE_VARIATION: '0',
    MAX_PICTURES_PER_REQUEST: '5',
    DOWNLOAD_TIMEOUT_MS: '5000',
    CAT_PROVIDER: 'cataas',
    CAT_PROVIDER_CATAAS_URL: `${pictureService.baseUrl}/cat/{width}/{height}`,
    CAT_PICTURE_WIDTH: '300',
    CAT_PICTURE_HEIGHT: '200',
    DOG_PROVIDER: 'placedog',
    DOG_PROVIDER_PLACEDOG_URL: `${pictureService.baseUrl}/dog/{width}/{height}`,
    DOG_PICTURE_WIDTH: '500',
    DOG_PICTURE_HEIGHT: '400',
    ...databaseEnv(),
  });

  app = createApplication(config, dataSource);
});

beforeEach(async () => {
  await clearPictures(dataSource);
  pictureService.reset();
});

afterAll(async () => {
  await pictureService.close();
  await dataSource.destroy();
});

/** The test database's connection details, written as the DATABASE_* settings. */
function databaseEnv() {
  const database = dataSource.options as { host: string; port: number; database: string; username: string; password: string };
  return {
    DATABASE_HOST: database.host,
    DATABASE_PORT: String(database.port),
    DATABASE_NAME: database.database,
    DATABASE_USER: database.username,
    DATABASE_PASSWORD: database.password,
  };
}

/** How many pictures are really in the database. */
async function savedPictureCount(): Promise<number> {
  const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM "animal_pictures"');
  return count;
}

/** Makes supertest collect a picture answer as raw bytes, whatever its content type. */
function asBytes(res: request.Response, done: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

describe('health check', () => {
  it('reports ok when the database is reachable', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('reports degraded when the database connection is gone', async () => {
    // A second connection that is closed straight away, so the app can't use it.
    const closedDataSource = createDataSource(config.database);
    await closedDataSource.initialize();
    await closedDataSource.destroy();

    const response = await request(createApplication(config, closedDataSource)).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'degraded', database: 'down' });
  });
});

describe('fetching and saving new pictures', () => {
  it('downloads the requested pictures and saves them in the database', async () => {
    const response = await request(app).post('/api/pictures?animal=cat&count=2');

    expect(response.status).toBe(201);
    expect(response.body.count).toBe(2);
    expect(response.body.pictures).toEqual([
      {
        id: 1,
        animal: 'cat',
        provider: 'cataas',
        sourceUrl: `${pictureService.baseUrl}/cat/300/200`,
        contentType: 'image/jpeg',
        sizeBytes: pictureService.sentPictures[0]!.byteLength,
        createdAt: expect.any(String),
        url: '/api/pictures/1',
      },
      expect.objectContaining({ id: 2, animal: 'cat', url: '/api/pictures/2' }),
    ]);
    expect(pictureService.requests).toEqual(['/cat/300/200', '/cat/300/200']);
    expect(await savedPictureCount()).toBe(2);
  });

  it('uses DEFAULT_ANIMAL when the request does not name an animal', async () => {
    const response = await request(app).post('/api/pictures');

    expect(response.status).toBe(201);
    expect(response.body.pictures).toEqual([expect.objectContaining({ animal: 'dog', provider: 'placedog' })]);
    expect(pictureService.requests).toEqual(['/dog/500/400']);
  });

  it('picks a random enabled animal for each picture when asked for animal=random', async () => {
    const response = await request(app).post('/api/pictures?animal=random&count=5');

    expect(response.status).toBe(201);
    for (const picture of response.body.pictures) {
      expect(['cat', 'dog']).toContain(picture.animal);
    }
    expect(pictureService.requests).toHaveLength(5);
    expect(await savedPictureCount()).toBe(5);
  });

  it('refuses an animal that is switched off, without downloading anything', async () => {
    const response = await request(app).post('/api/pictures?animal=bear');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Bad Request',
      message: 'Pictures of "bear" are switched off. Enabled animals: cat, dog.',
    });
    expect(pictureService.requests).toEqual([]);
    expect(await savedPictureCount()).toBe(0);
  });

  it('refuses an unknown animal', async () => {
    const response = await request(app).post('/api/pictures?animal=unicorn');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('"unicorn" is not a known animal. Choose one of: cat, dog, bear, random.');
  });

  it.each([
    ['0', 'count must be between 1 and 5, but it is 0.'],
    ['6', 'count must be between 1 and 5, but it is 6.'],
    ['-1', 'count must be a whole number, but it is "-1".'],
    ['2.5', 'count must be a whole number, but it is "2.5".'],
  ])('refuses count=%s', async (count, message) => {
    const response = await request(app).post(`/api/pictures?count=${count}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Bad Request', message });
    expect(pictureService.requests).toEqual([]);
  });

  it('answers 502 and saves nothing when the picture service fails', async () => {
    pictureService.answerNextWith('error');

    const response = await request(app).post('/api/pictures?animal=dog');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: 'Bad Gateway',
      message: `The dog picture service at ${pictureService.baseUrl}/dog/500/400 answered with HTTP 503.`,
    });
    expect(await savedPictureCount()).toBe(0);
  });

  it('answers 502 and saves nothing when the picture service sends a web page instead of a picture', async () => {
    pictureService.answerNextWith('not-a-picture');

    const response = await request(app).post('/api/pictures?animal=cat');

    expect(response.status).toBe(502);
    expect(response.body.message).toContain('did not send a picture (it sent "text/html; charset=utf-8")');
    expect(await savedPictureCount()).toBe(0);
  });

  it('answers 502 when the picture service cannot be reached at all', async () => {
    // Point cats at an address where nothing is listening.
    const unreachable = structuredClone(config);
    unreachable.animals.cat!.providerUrlTemplate = 'http://127.0.0.1:1/cat/{width}/{height}';

    const response = await request(createApplication(unreachable, dataSource)).post('/api/pictures?animal=cat');

    expect(response.status).toBe(502);
    expect(response.body.message).toMatch(/^Could not reach the cat picture service at http:\/\/127\.0\.0\.1:1\/cat\/300\/200/);
    expect(await savedPictureCount()).toBe(0);
  });

  it('saves nothing when a later download in the same request fails', async () => {
    // The first picture downloads fine, the second doesn't. The caller gets
    // an error, so the first picture must not be saved either.
    pictureService.answerNextWith('picture', 'error');

    const response = await request(app).post('/api/pictures?animal=dog&count=3');

    expect(response.status).toBe(502);
    expect(pictureService.requests).toHaveLength(2);
    expect(await savedPictureCount()).toBe(0);
  });
});

describe('getting the latest picture', () => {
  it('answers 404 while nothing has been saved', async () => {
    const file = await request(app).get('/api/pictures/latest');
    const details = await request(app).get('/api/pictures/latest/details');

    expect(file.status).toBe(404);
    expect(file.body).toEqual({ error: 'Not Found', message: 'No picture has been saved yet.' });
    expect(details.status).toBe(404);
    expect(details.body).toEqual({ error: 'Not Found', message: 'No picture has been saved yet.' });
  });

  it('sends back exactly the picture that was downloaded most recently', async () => {
    await request(app).post('/api/pictures?animal=cat&count=2').expect(201);
    const newestCat = pictureService.sentPictures[1]!;

    const response = await request(app).get('/api/pictures/latest').buffer(true).parse(asBytes);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['content-length']).toBe(String(newestCat.byteLength));
    expect(response.body).toEqual(newestCat);
  });

  it('is the newest picture of any animal', async () => {
    await request(app).post('/api/pictures?animal=cat').expect(201);
    await request(app).post('/api/pictures?animal=dog').expect(201);
    await request(app).post('/api/pictures?animal=cat').expect(201);

    const latest = await request(app).get('/api/pictures/latest/details');

    expect(latest.body).toMatchObject({ id: 3, animal: 'cat' });
  });

  it('gives the same details as the fetch answered with', async () => {
    const created = await request(app).post('/api/pictures?animal=dog').expect(201);

    const details = await request(app).get('/api/pictures/latest/details');

    expect(details.status).toBe(200);
    expect(details.body).toEqual(created.body.pictures[0]);
  });
});

describe('getting one picture by id', () => {
  it('follows the "url" from the fetch answer to the picture file', async () => {
    const created = await request(app).post('/api/pictures?animal=dog&count=3').expect(201);
    const second = created.body.pictures[1];

    const response = await request(app).get(second.url).buffer(true).parse(asBytes);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(pictureService.sentPictures[1]);
  });

  it('answers 404 for an id that does not exist', async () => {
    const response = await request(app).get('/api/pictures/999');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found', message: 'There is no picture with id 999.' });
  });
});
