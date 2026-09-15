/**
 * picture-downloader.test.ts : tests for downloading a picture
 *
 * These tests never touch the internet. They give the downloader a fake
 * "fetch" function that answers however the test wants, and then check what
 * the downloader does with that answer.
 */
import { BadGatewayError } from '../src/errors/http-error.js';
import { PictureDownloader } from '../src/pictures/picture-downloader.js';

/** Settings with a fixed size and no random variation, so URLs are predictable. */
const config = {
  pictureSizeVariation: 0,
  downloadTimeoutMs: 1000,
  animals: {
    dog: { provider: 'placedog', providerUrlTemplate: 'https://place.dog/{width}/{height}', width: 500, height: 400 },
    cat: { provider: 'cataas', providerUrlTemplate: 'https://cataas.com/cat?width={width}', width: 300, height: 200 },
  },
};

/** Builds a fake fetch that always returns the given answer, and remembers what it was asked. */
function fakeFetch(response: Response) {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return response;
  }) as typeof fetch;
  return { fetchFn, calls };
}

const fakeJpeg = Buffer.from('not really a jpeg, but good enough for a test');

describe('PictureDownloader', () => {
  it('fills in the width and height and returns the picture', async () => {
    const { fetchFn, calls } = fakeFetch(
      new Response(fakeJpeg, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );
    const downloader = new PictureDownloader(config, fetchFn);

    const picture = await downloader.download('dog');

    expect(calls).toEqual(['https://place.dog/500/400']);
    expect(picture).toEqual({
      animal: 'dog',
      provider: 'placedog',
      sourceUrl: 'https://place.dog/500/400',
      contentType: 'image/jpeg',
      imageData: fakeJpeg,
    });
  });

  it('only fills in the placeholders the address uses', async () => {
    const { fetchFn, calls } = fakeFetch(new Response(fakeJpeg, { headers: { 'content-type': 'image/png' } }));

    await new PictureDownloader(config, fetchFn).download('cat');

    expect(calls).toEqual(['https://cataas.com/cat?width=300']);
  });

  it('adds up to PICTURE_SIZE_VARIATION pixels to the size', async () => {
    const { fetchFn, calls } = fakeFetch(new Response(fakeJpeg, { headers: { 'content-type': 'image/jpeg' } }));
    const downloader = new PictureDownloader({ ...config, pictureSizeVariation: 50 }, fetchFn);

    await downloader.download('dog');

    const match = calls[0]!.match(/^https:\/\/place\.dog\/(\d+)\/(\d+)$/);
    expect(match).not.toBeNull();
    const [, width, height] = match!;
    expect(Number(width)).toBeGreaterThanOrEqual(500);
    expect(Number(width)).toBeLessThanOrEqual(550);
    expect(Number(height)).toBeGreaterThanOrEqual(400);
    expect(Number(height)).toBeLessThanOrEqual(450);
  });

  it('strips extras like "; charset=..." from the content type', async () => {
    const { fetchFn } = fakeFetch(new Response(fakeJpeg, { headers: { 'content-type': 'image/jpeg; charset=binary' } }));

    const picture = await new PictureDownloader(config, fetchFn).download('dog');

    expect(picture.contentType).toBe('image/jpeg');
  });

  it('reports a service that answers with an error status', async () => {
    const { fetchFn } = fakeFetch(new Response('down', { status: 521 }));

    await expect(new PictureDownloader(config, fetchFn).download('dog')).rejects.toThrow(
      new BadGatewayError('The dog picture service at https://place.dog/500/400 answered with HTTP 521.'),
    );
  });

  it('reports a service that sends something other than a picture', async () => {
    const { fetchFn } = fakeFetch(new Response('<html>oops</html>', { headers: { 'content-type': 'text/html' } }));

    await expect(new PictureDownloader(config, fetchFn).download('dog')).rejects.toThrow(
      new BadGatewayError(
        'The dog picture service at https://place.dog/500/400 did not send a picture (it sent "text/html").',
      ),
    );
  });

  it('reports a service that cannot be reached', async () => {
    const failingFetch = (async () => {
      throw new Error('getaddrinfo ENOTFOUND place.dog');
    }) as typeof fetch;

    await expect(new PictureDownloader(config, failingFetch).download('dog')).rejects.toThrow(
      new BadGatewayError(
        'Could not reach the dog picture service at https://place.dog/500/400: getaddrinfo ENOTFOUND place.dog',
      ),
    );
  });
});
