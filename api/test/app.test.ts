/**
 * app.test.ts : tests for the HTTP layer
 *
 * These tests send real HTTP requests to the Express app (using the
 * "supertest" library) and check the answers. The picture service behind
 * the app is a fake, so no database or internet is needed. What's tested
 * here is the translation between HTTP and the service: parameters, status
 * codes, headers and the JSON shape.
 */
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AnimalPicture } from '../src/database/animal-picture.entity.js';
import { BadGatewayError, NotFoundError } from '../src/errors/http-error.js';
import type { PictureService } from '../src/pictures/picture.service.js';

const picture: AnimalPicture = {
  id: 7,
  animal: 'cat',
  provider: 'cataas',
  sourceUrl: 'https://cataas.com/cat?width=500',
  contentType: 'image/jpeg',
  sizeBytes: 3,
  imageData: Buffer.from('abc'),
  createdAt: new Date('2026-09-14T10:00:00.000Z'),
};
const { imageData: _imageData, ...details } = picture;

/** The JSON the API is expected to send for the picture above. */
const expectedJson = {
  id: 7,
  animal: 'cat',
  provider: 'cataas',
  sourceUrl: 'https://cataas.com/cat?width=500',
  contentType: 'image/jpeg',
  sizeBytes: 3,
  createdAt: '2026-09-14T10:00:00.000Z',
  url: '/api/pictures/7',
};

/** A fake service that records how it was called and answers with the picture above. */
function makeApp(options: { databaseUp?: boolean } = {}) {
  const calls: unknown[][] = [];
  const service = {
    async fetchAndSave(...args: unknown[]) {
      calls.push(['fetchAndSave', ...args]);
      return [details];
    },
    async getLatest(...args: unknown[]) {
      calls.push(['getLatest', ...args]);
      return picture;
    },
    async getLatestDetails(...args: unknown[]) {
      calls.push(['getLatestDetails', ...args]);
      return details;
    },
    async getById(id: number) {
      calls.push(['getById', id]);
      if (id !== picture.id) throw new NotFoundError(`There is no picture with id ${id}.`);
      return picture;
    },
  } as unknown as PictureService;

  const app = createApp({
    pictureService: service,
    checkDatabase: async () => {
      if (options.databaseUp === false) throw new Error('connection refused');
    },
  });
  return { app, calls };
}

describe('POST /api/pictures', () => {
  it('fetches one picture of the default animal when no parameters are given', async () => {
    const { app, calls } = makeApp();

    const response = await request(app).post('/api/pictures');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ count: 1, pictures: [expectedJson] });
    expect(calls).toEqual([['fetchAndSave', undefined, 1]]);
  });

  it('passes the animal and count on to the service', async () => {
    const { app, calls } = makeApp();

    await request(app).post('/api/pictures?animal=Dog&count=3');

    expect(calls).toEqual([['fetchAndSave', 'dog', 3]]);
  });

  it('passes animal=random on to the service', async () => {
    const { app, calls } = makeApp();

    await request(app).post('/api/pictures?animal=RANDOM&count=2');

    expect(calls).toEqual([['fetchAndSave', 'random', 2]]);
  });

  it('rejects an unknown animal with 400', async () => {
    const { app, calls } = makeApp();

    const response = await request(app).post('/api/pictures?animal=fox');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Bad Request',
      message: '"fox" is not a known animal. Choose one of: cat, dog, bear, random.',
    });
    expect(calls).toEqual([]);
  });

  it('rejects a count that is not a whole number with 400', async () => {
    const { app } = makeApp();

    const response = await request(app).post('/api/pictures?count=two');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('count must be a whole number, but it is "two".');
  });
});

describe('GET /api/pictures/latest', () => {
  it('sends the picture file with its content type', async () => {
    const { app, calls } = makeApp();

    const response = await request(app).get('/api/pictures/latest');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['content-length']).toBe('3');
    expect(response.body).toEqual(Buffer.from('abc'));
    expect(calls).toEqual([['getLatest']]);
  });

  it('sends the details as JSON at /latest/details', async () => {
    const { app } = makeApp();

    const response = await request(app).get('/api/pictures/latest/details');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expectedJson);
  });
});

describe('GET /api/pictures/:id', () => {
  it('sends the picture with that id', async () => {
    const { app } = makeApp();

    const response = await request(app).get('/api/pictures/7');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
  });

  it('answers 404 for an id that does not exist', async () => {
    const { app } = makeApp();

    const response = await request(app).get('/api/pictures/8');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found', message: 'There is no picture with id 8.' });
  });

  it('answers 400 for an id that is not a number', async () => {
    const { app } = makeApp();

    const response = await request(app).get('/api/pictures/seven');

    expect(response.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('reports ok when the database answers', async () => {
    const { app } = makeApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('reports degraded with 503 when the database does not answer', async () => {
    const { app } = makeApp({ databaseUp: false });

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'degraded', database: 'down' });
  });
});

describe('unknown addresses', () => {
  it('answer 404 in the same JSON shape as other errors', async () => {
    const { app } = makeApp();

    const response = await request(app).get('/api/nothing');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found', message: 'There is nothing at GET /api/nothing.' });
  });
});

describe('errors', () => {
  /** An app whose service fails every fetch with the given error. */
  function makeFailingApp(error: Error) {
    const service = {
      async fetchAndSave() {
        throw error;
      },
    } as unknown as PictureService;
    return createApp({ pictureService: service, checkDatabase: async () => {} });
  }

  it('turn a picture service failure into 502 Bad Gateway', async () => {
    const app = makeFailingApp(new BadGatewayError('The cat picture service answered with HTTP 521.'));

    const response = await request(app).post('/api/pictures');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Bad Gateway', message: 'The cat picture service answered with HTTP 521.' });
  });

  it('hide the details of unexpected errors behind a generic 500', async () => {
    const app = makeFailingApp(new Error('password authentication failed for user "animal_picture_user"'));
    // The details are logged on purpose; keep them out of the test output.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app).post('/api/pictures');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Internal Server Error',
      message: 'Something went wrong on the server. Please try again later.',
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('query parameters', () => {
  it('use the first value when a parameter is given twice', async () => {
    const { app, calls } = makeApp();

    await request(app).post('/api/pictures?animal=bear&animal=cat&count=2&count=5');

    expect(calls).toEqual([['fetchAndSave', 'bear', 2]]);
  });

  it('treat an empty value as not given', async () => {
    const { app, calls } = makeApp();

    await request(app).post('/api/pictures?animal=&count=%20');

    expect(calls).toEqual([['fetchAndSave', undefined, 1]]);
  });
});
