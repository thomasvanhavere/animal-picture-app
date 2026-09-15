/**
 * picture-api.ts : talks to the animal-picture-api
 *
 * This is the only file that knows the API's addresses and answers. The
 * rest of the page calls these two plainly named functions and gets back
 * ready-to-use data, or an ApiError with a message that can be shown to the
 * user as it is.
 *
 * The addresses start with /api, without a server name. The page and the
 * API are reached through the same address (Nginx passes /api on to the
 * API), so the browser sends these requests to wherever the page came from.
 */

/** The details of one saved picture, as the API describes it. */
export interface PictureDetails {
  id: number;
  animal: string;
  provider: string;
  sourceUrl: string;
  contentType: string;
  sizeBytes: number;
  /** When it was saved, as ISO text, for example "2026-09-15T10:00:00.000Z". */
  createdAt: string;
  /** Where to load the picture file itself, for example "/api/pictures/7". */
  url: string;
}

/**
 * What can be asked for when fetching: one of the animals, or "random" for
 * a random animal per picture. These are the values the API accepts in ?animal=.
 */
export const ANIMAL_CHOICES = ['random', 'cat', 'dog', 'bear'] as const;
export type AnimalChoice = (typeof ANIMAL_CHOICES)[number];

/** Something went wrong talking to the API. The message is meant for the user. */
export class ApiError extends Error {
  constructor(
    /** The HTTP status code, or 0 if the API couldn't be reached at all. */
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface PictureApi {
  /**
   * Asks the API to download and save pictures.
   * @param animal  Which animal, or "random" for a random animal per picture.
   * @returns The saved pictures, oldest first.
   */
  fetchPictures(animal: AnimalChoice, count: number): Promise<PictureDetails[]>;

  /** The most recently saved picture of any animal, or null if nothing has been saved yet. */
  getLatestPicture(): Promise<PictureDetails | null>;
}

/**
 * Creates the API client.
 *
 * @param fetchFn  The function used to make requests. The browser's fetch by
 *                 default; tests pass a fake one.
 */
export function createPictureApi(fetchFn: typeof fetch = (input, init) => fetch(input, init)): PictureApi {
  /**
   * Sends a request, turning network failures and error answers into an
   * ApiError. With allowNotFound, a 404 answer is returned instead of thrown.
   */
  async function send(url: string, options: { method?: string; allowNotFound?: boolean } = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetchFn(url, { method: options.method ?? 'GET', headers: { Accept: 'application/json' } });
    } catch {
      throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
    }
    if (!response.ok && !(options.allowNotFound && response.status === 404)) {
      throw new ApiError(response.status, await readErrorMessage(response));
    }
    return response;
  }

  return {
    async fetchPictures(animal, count) {
      const query = new URLSearchParams({ animal, count: String(count) });
      const response = await send(`/api/pictures?${query}`, { method: 'POST' });
      const body = (await response.json()) as { pictures: PictureDetails[] };
      return body.pictures;
    },

    async getLatestPicture() {
      const response = await send('/api/pictures/latest/details', { allowNotFound: true });
      if (response.status === 404) {
        // Not an error: nothing has been saved yet.
        return null;
      }
      return (await response.json()) as PictureDetails;
    },
  };
}

/**
 * Finds the message in an error answer. The API always answers errors with
 * { "error": ..., "message": ... }, but when the API itself is down, Nginx
 * answers instead, with a web page, so there's a fallback.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // Not JSON; use the fallback below.
  }
  return response.status === 502 || response.status === 503 || response.status === 504
    ? 'The picture API is not available right now. Please try again in a moment.'
    : `The server answered with an unexpected error (HTTP ${response.status}).`;
}
