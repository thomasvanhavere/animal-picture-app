/**
 * picture-api.test.ts : tests for the API client
 *
 * The client is given a fake fetch function, so no server is needed. The
 * tests check which requests it sends, and how it reads the answers.
 */
import { ApiError, createPictureApi, type PictureDetails } from '../src/api/picture-api';

const details: PictureDetails = {
  id: 7,
  animal: 'dog',
  provider: 'placedog',
  sourceUrl: 'https://place.dog/500/400',
  contentType: 'image/jpeg',
  sizeBytes: 1234,
  createdAt: '2026-09-15T10:00:00.000Z',
  url: '/api/pictures/7',
};

/** A fetch that always gives the same answer, and remembers what it was asked. */
function fakeFetch(response: Response) {
  const calls: { url: string; method: string | undefined }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method });
    return response;
  }) as typeof fetch;
  return { fetchFn, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('fetchPictures', () => {
  it('asks the API for that many pictures of the chosen animal', async () => {
    const { fetchFn, calls } = fakeFetch(json({ count: 1, pictures: [details] }, 201));

    const pictures = await createPictureApi(fetchFn).fetchPictures('dog', 3);

    expect(calls).toEqual([{ url: '/api/pictures?animal=dog&count=3', method: 'POST' }]);
    expect(pictures).toEqual([details]);
  });

  it('asks for random animals with animal=random', async () => {
    const { fetchFn, calls } = fakeFetch(json({ count: 1, pictures: [details] }, 201));

    await createPictureApi(fetchFn).fetchPictures('random', 1);

    expect(calls).toEqual([{ url: '/api/pictures?animal=random&count=1', method: 'POST' }]);
  });

  it("passes the API's own error message on", async () => {
    const { fetchFn } = fakeFetch(
      json({ error: 'Bad Request', message: 'count must be between 1 and 10, but it is 11.' }, 400),
    );

    await expect(createPictureApi(fetchFn).fetchPictures('random', 11)).rejects.toThrow(
      new ApiError(400, 'count must be between 1 and 10, but it is 11.'),
    );
  });

  it('explains when the API is down and Nginx answers with a web page instead', async () => {
    const { fetchFn } = fakeFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    await expect(createPictureApi(fetchFn).fetchPictures('random', 1)).rejects.toThrow(
      'The picture API is not available right now. Please try again in a moment.',
    );
  });

  it('explains when the server cannot be reached at all', async () => {
    const failingFetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    await expect(createPictureApi(failingFetch).fetchPictures('random', 1)).rejects.toThrow(
      new ApiError(0, 'Could not reach the server. Check your connection and try again.'),
    );
  });
});

describe('getLatestPicture', () => {
  it('returns the details of the latest picture', async () => {
    const { fetchFn, calls } = fakeFetch(json(details));

    expect(await createPictureApi(fetchFn).getLatestPicture()).toEqual(details);
    expect(calls).toEqual([{ url: '/api/pictures/latest/details', method: 'GET' }]);
  });

  it('returns null when nothing has been saved yet', async () => {
    const { fetchFn } = fakeFetch(json({ error: 'Not Found', message: 'No picture has been saved yet.' }, 404));

    expect(await createPictureApi(fetchFn).getLatestPicture()).toBeNull();
  });

  it('reports other errors', async () => {
    const { fetchFn } = fakeFetch(new Response('oops', { status: 500 }));

    await expect(createPictureApi(fetchFn).getLatestPicture()).rejects.toThrow(
      'The server answered with an unexpected error (HTTP 500).',
    );
  });
});
