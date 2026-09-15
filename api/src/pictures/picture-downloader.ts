/**
 * picture-downloader.ts : downloads one picture from a picture service
 *
 * This is the only part of the app that talks to the outside world. Given an
 * animal, it:
 *   1. takes that animal's settings (which service, which size),
 *   2. builds the web address by filling in {width} and {height},
 *   3. downloads the file and checks that it really is a picture.
 *
 * It knows nothing about the database or about HTTP requests coming in; it
 * only fetches. Tests replace the "fetch" function with a fake one, so they
 * never touch the real internet.
 */
import type { Animal } from '../config/animals.js';
import type { AnimalConfig, Config } from '../config/config.js';
import { BadGatewayError } from '../errors/http-error.js';

/** A picture that was just downloaded, before it is saved. */
export interface DownloadedPicture {
  animal: Animal;
  provider: string;
  /** The exact address the picture was downloaded from. */
  sourceUrl: string;
  /** The kind of file, for example "image/jpeg". */
  contentType: string;
  /** The file contents. */
  imageData: Buffer;
}

/** The parts of the settings this class needs. */
type DownloaderConfig = Pick<Config, 'animals' | 'pictureSizeVariation' | 'downloadTimeoutMs'>;

export class PictureDownloader {
  constructor(
    private readonly config: DownloaderConfig,
    /** The function used to make web requests. Node's built-in fetch by default; tests pass a fake. */
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /**
   * Downloads one random picture of the given animal.
   *
   * @throws BadGatewayError if the picture service can't be reached, answers
   *         with an error, or sends back something that isn't a picture.
   */
  async download(animal: Animal): Promise<DownloadedPicture> {
    const animalConfig = this.config.animals[animal];
    if (!animalConfig) {
      // Can't happen when the service checks ENABLED_ANIMALS first, but a
      // clear message is better than a crash if it ever does.
      throw new Error(`No picture service is configured for "${animal}".`);
    }

    const sourceUrl = this.buildUrl(animalConfig);
    const response = await this.request(sourceUrl, animal);

    // Some services answer errors with a web page (HTML) instead of a
    // picture. Checking the content type catches that.
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw new BadGatewayError(
        `The ${animal} picture service at ${sourceUrl} did not send a picture (it sent "${contentType || 'nothing'}").`,
      );
    }

    return {
      animal,
      provider: animalConfig.provider,
      sourceUrl,
      // Keep only the type itself ("image/jpeg"), without extras like "; charset=...".
      contentType: contentType.split(';')[0]!.trim(),
      imageData: Buffer.from(await response.arrayBuffer()),
    };
  }

  /**
   * Fills the {width} and {height} placeholders of the service address.
   *
   * A random number of extra pixels (up to PICTURE_SIZE_VARIATION) is added
   * to each, because some services return the same picture for the same
   * size. See .env.defaults for the full explanation.
   */
  private buildUrl(animalConfig: AnimalConfig): string {
    const width = animalConfig.width + this.randomVariation();
    const height = animalConfig.height + this.randomVariation();
    return animalConfig.providerUrlTemplate
      .replaceAll('{width}', String(width))
      .replaceAll('{height}', String(height));
  }

  /** A whole number between 0 and PICTURE_SIZE_VARIATION, both included. */
  private randomVariation(): number {
    return Math.floor(Math.random() * (this.config.pictureSizeVariation + 1));
  }

  /** Makes the web request, giving up after DOWNLOAD_TIMEOUT_MS, and checks the answer's status. */
  private async request(url: string, animal: Animal): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        signal: AbortSignal.timeout(this.config.downloadTimeoutMs),
        // Some services answer differently to requests without a browser-like
        // identity; a plain, honest one keeps them happy.
        headers: { 'User-Agent': 'animal-picture-app/0.1' },
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new BadGatewayError(`Could not reach the ${animal} picture service at ${url}: ${reason}`);
    }

    if (!response.ok) {
      throw new BadGatewayError(
        `The ${animal} picture service at ${url} answered with HTTP ${response.status}.`,
      );
    }
    return response;
  }
}
