/**
 * app.test.ts : tests for the whole page
 *
 * These tests load the real index.html into a fake browser page (jsdom),
 * start the app with a fake API, and then use the page like a person would:
 * type a number, press the button, look at what appears.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError, type AnimalChoice, type PictureApi, type PictureDetails } from '../src/api/picture-api';
import { findPageElements, startApp } from '../src/app';

function picture(id: number, animal = 'cat'): PictureDetails {
  return {
    id,
    animal,
    provider: 'fake',
    sourceUrl: `https://fake.example/${id}`,
    contentType: 'image/jpeg',
    sizeBytes: 1000,
    createdAt: '2026-09-15T10:00:00.000Z',
    url: `/api/pictures/${id}`,
  };
}

/**
 * A fake API that keeps its "saved" pictures in a list. Tests can make the
 * next fetch fail, or hold it back to look at the page while it's busy.
 */
function fakeApi(initialPictures: PictureDetails[] = []) {
  const saved = [...initialPictures];
  /** Every fetch asked for, as [animal, count]. */
  const fetchRequests: [AnimalChoice, number][] = [];
  let nextError: Error | null = null;
  let holdBack: Promise<void> | null = null;

  const api: PictureApi = {
    async fetchPictures(animal, count) {
      fetchRequests.push([animal, count]);
      if (holdBack) await holdBack;
      if (nextError) {
        const error = nextError;
        nextError = null;
        throw error;
      }
      const animals = ['cat', 'dog', 'bear'];
      const created = Array.from({ length: count }, (_, i) =>
        picture(saved.length + i + 1, animal === 'random' ? animals[(saved.length + i) % animals.length] : animal),
      );
      saved.push(...created);
      return created;
    },
    async getLatestPicture() {
      return saved.at(-1) ?? null;
    },
  };

  return {
    api,
    fetchRequests,
    failNextFetch(error: Error) {
      nextError = error;
    },
    /** Makes fetches wait until the returned function is called. */
    holdBackFetches() {
      let release!: () => void;
      holdBack = new Promise((resolve) => (release = resolve));
      return () => {
        holdBack = null;
        release();
      };
    },
  };
}

/** Loads the real page and starts the app on it. */
function openPage(api: PictureApi) {
  const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  const page = findPageElements(document);
  startApp(page, api);

  return {
    ...page,
    /** Fills in the "#Pictures" box the way typing does. */
    typeCount(value: string) {
      page.countInput.value = value;
      page.countInput.dispatchEvent(new Event('input'));
      page.countInput.dispatchEvent(new Event('change'));
    },
    /** Clicks one of the animal choices. */
    chooseAnimal(animal: AnimalChoice) {
      document.getElementById(`animal-${animal}`)!.click();
    },
    selectedAnimal: () => document.querySelector<HTMLInputElement>('input[name="animal"]:checked')?.value,
    pressFetch() {
      page.fetchButton.click();
    },
    latestImageSrc: () => page.latestPicture.querySelector('img')?.getAttribute('src') ?? null,
    fetchedImageSrcs: () =>
      [...page.fetchedPictures.querySelectorAll('img')].map((image) => image.getAttribute('src')),
    carousel: () => page.fetchedPictures.querySelector('.carousel'),
  };
}

describe('when the page opens', () => {
  it('shows the latest saved picture', async () => {
    const page = openPage(fakeApi([picture(1), picture(2, 'dog')]).api);

    await vi.waitFor(() => expect(page.latestImageSrc()).toBe('/api/pictures/2'));
    expect(page.latestPicture.textContent).toContain('Dog');
  });

  it('says so when nothing has been saved yet', async () => {
    const page = openPage(fakeApi().api);

    await vi.waitFor(() => expect(page.latestPicture.textContent).toContain('No picture has been saved yet.'));
  });

  it('shows the error when the latest picture cannot be loaded', async () => {
    const { api } = fakeApi();
    api.getLatestPicture = async () => {
      throw new ApiError(502, 'The picture API is not available right now.');
    };

    const page = openPage(api);

    await vi.waitFor(() =>
      expect(page.latestPicture.textContent).toBe('The picture API is not available right now.'),
    );
  });

  it('is ready to fetch 1 picture', () => {
    const page = openPage(fakeApi().api);

    expect(page.selectedAnimal()).toBe('random');
    expect(page.countInput.value).toBe('1');
    expect(page.fetchButton.textContent).toBe('Fetch 1 random picture');
    expect(page.fetchedPictures.textContent).toBe('Pictures you fetch will appear here.');
  });

  it('says under the "#Pictures" box that at most 10 pictures can be fetched', () => {
    const page = openPage(fakeApi().api);

    const hintId = page.countInput.getAttribute('aria-describedby')!;

    expect(document.getElementById(hintId)?.textContent).toBe('Max. 10 pictures');
  });
});

describe('fetching pictures', () => {
  it('fetches one picture and shows it on its own', async () => {
    const fake = fakeApi();
    const page = openPage(fake.api);

    page.pressFetch();

    await vi.waitFor(() => expect(page.fetchedImageSrcs()).toEqual(['/api/pictures/1']));
    expect(fake.fetchRequests).toEqual([['random', 1]]);
    expect(page.carousel()).toBeNull();
    expect(page.status.textContent).toBe('Fetched 1 new picture.');
  });

  it('fetches as many pictures as the box says, and shows them in a carousel', async () => {
    const fake = fakeApi();
    const page = openPage(fake.api);

    page.typeCount('3');
    expect(page.fetchButton.textContent).toBe('Fetch 3 random pictures');
    page.pressFetch();

    await vi.waitFor(() => expect(page.carousel()).not.toBeNull());
    expect(fake.fetchRequests).toEqual([['random', 3]]);
    expect(page.fetchedImageSrcs()).toEqual(['/api/pictures/1', '/api/pictures/2', '/api/pictures/3']);
    expect(page.status.textContent).toBe('Fetched 3 new pictures.');
  });

  it.each(['cat', 'dog', 'bear'] as const)('fetches pictures of the chosen animal: %s', async (animal) => {
    const fake = fakeApi();
    const page = openPage(fake.api);

    page.chooseAnimal(animal);
    page.typeCount('2');
    expect(page.fetchButton.textContent).toBe(`Fetch 2 ${animal} pictures`);
    page.pressFetch();

    await vi.waitFor(() => expect(page.carousel()).not.toBeNull());
    expect(fake.fetchRequests).toEqual([[animal, 2]]);
    expect(page.status.textContent).toBe('Fetched 2 new pictures.');
  });

  it('lets the user switch back to random', async () => {
    const fake = fakeApi();
    const page = openPage(fake.api);

    page.chooseAnimal('bear');
    expect(page.fetchButton.textContent).toBe('Fetch 1 bear picture');
    page.chooseAnimal('random');
    expect(page.fetchButton.textContent).toBe('Fetch 1 random picture');
    page.pressFetch();

    await vi.waitFor(() => expect(fake.fetchRequests).toEqual([['random', 1]]));
  });

  it('updates the latest picture afterwards', async () => {
    const page = openPage(fakeApi([picture(1)]).api);
    await vi.waitFor(() => expect(page.latestImageSrc()).toBe('/api/pictures/1'));

    page.typeCount('2');
    page.pressFetch();

    await vi.waitFor(() => expect(page.latestImageSrc()).toBe('/api/pictures/3'));
  });

  it('fetches 1 picture when the box was left empty or at 0', async () => {
    const fake = fakeApi();
    const page = openPage(fake.api);

    page.typeCount('');
    page.pressFetch();
    await vi.waitFor(() => expect(fake.fetchRequests).toEqual([['random', 1]]));

    page.typeCount('0');
    // The first fetch may still be finishing, and a press on the disabled
    // button would do nothing. Wait until it can be pressed again.
    await vi.waitFor(() => expect(page.fetchButton.disabled).toBe(false));
    page.pressFetch();
    await vi.waitFor(() =>
      expect(fake.fetchRequests).toEqual([
        ['random', 1],
        ['random', 1],
      ]),
    );
    expect(page.countInput.value).toBe('1');
  });

  it('disables the button while fetching, so it cannot be pressed twice', async () => {
    const fake = fakeApi();
    const release = fake.holdBackFetches();
    const page = openPage(fake.api);

    page.typeCount('2');
    page.pressFetch();

    await vi.waitFor(() => expect(page.fetchButton.disabled).toBe(true));
    expect(page.fetchButton.textContent).toBe('Fetching…');
    expect(page.countInput.disabled).toBe(true);
    expect(page.animalPicker.disabled).toBe(true);
    expect(page.status.textContent).toBe('Fetching 2 random pictures…');
    page.pressFetch();

    release();
    await vi.waitFor(() => expect(page.fetchButton.disabled).toBe(false));
    expect(fake.fetchRequests).toEqual([['random', 2]]);
    expect(page.fetchButton.textContent).toBe('Fetch 2 random pictures');
  });

  it('shows the error message and keeps the earlier pictures when a fetch fails', async () => {
    const fake = fakeApi();
    const page = openPage(fake.api);
    page.pressFetch();
    await vi.waitFor(() => expect(page.fetchedImageSrcs()).toEqual(['/api/pictures/1']));

    fake.failNextFetch(new ApiError(502, 'The cat picture service answered with HTTP 503.'));
    page.pressFetch();

    await vi.waitFor(() => expect(page.status.textContent).toBe('The cat picture service answered with HTTP 503.'));
    expect(page.status.classList.contains('status-error')).toBe(true);
    expect(page.fetchedImageSrcs()).toEqual(['/api/pictures/1']);
    expect(page.fetchButton.disabled).toBe(false);
  });
});
