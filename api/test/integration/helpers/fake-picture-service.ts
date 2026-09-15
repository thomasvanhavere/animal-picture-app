/**
 * fake-picture-service.ts : a small picture website running inside the tests
 *
 * The real picture services (Cataas, Place.dog, ...) are on the internet,
 * change their pictures and are sometimes offline, so tests can't rely on
 * them. Instead, the tests start this tiny web server on the local machine
 * and point the <ANIMAL>_PROVIDER_<NAME>_URL settings at it.
 *
 * The app downloads from it over real HTTP, exactly as it would from a real
 * service. The tests can tell it to misbehave (answer with an error, or send
 * a web page instead of a picture) and check which pictures it sent.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** How the service answers one request. */
export type FakeAnswer = 'picture' | 'error' | 'not-a-picture';

export interface FakePictureService {
  /** The address of the service, for example "http://127.0.0.1:53124". */
  baseUrl: string;
  /** The path of every request received, in order, for example "/dog/500/400". */
  requests: string[];
  /** The contents of every picture sent, in order. */
  sentPictures: Buffer[];
  /** Plans the answers to the next requests. Once they're used up, it sends pictures again. */
  answerNextWith(...answers: FakeAnswer[]): void;
  /** Forgets all requests, sent pictures and planned answers. */
  reset(): void;
  /** Stops the server. */
  close(): Promise<void>;
}

/** The first bytes of every JPEG file. */
const JPEG_START = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

export async function startFakePictureService(): Promise<FakePictureService> {
  const requests: string[] = [];
  const sentPictures: Buffer[] = [];
  let plannedAnswers: FakeAnswer[] = [];

  const server = createServer((req, res) => {
    requests.push(req.url ?? '');
    const answer = plannedAnswers.shift() ?? 'picture';

    if (answer === 'error') {
      res.writeHead(503, { 'Content-Type': 'text/plain' }).end('Service Unavailable');
      return;
    }
    if (answer === 'not-a-picture') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<html>Oops</html>');
      return;
    }

    // Every picture is different, and contains bytes that aren't text (like
    // 0x00), so the tests notice if the database changes even one byte.
    const picture = Buffer.concat([
      JPEG_START,
      Buffer.from(`picture ${sentPictures.length + 1} from ${req.url}`),
      Buffer.from([0x00, 0x7f, 0x80, 0xff]),
    ]);
    sentPictures.push(picture);
    res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(picture);
  });

  // Port 0 means "any free port"; the real one is read back after starting.
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    sentPictures,
    answerNextWith(...answers) {
      plannedAnswers.push(...answers);
    },
    reset() {
      requests.length = 0;
      sentPictures.length = 0;
      plannedAnswers = [];
    },
    close() {
      return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}
