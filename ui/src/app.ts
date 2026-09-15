/**
 * app.ts : the behaviour of the page
 *
 * Connects the page's elements to the API:
 *   - when the page opens, the latest saved picture is shown,
 *   - the button fetches as many random pictures as the "How many" box
 *     says, shows them (in a carousel when there are several), and then
 *     updates the latest picture.
 *
 * It receives the elements and the API client from outside, instead of
 * finding or creating them itself. main.ts passes in the real ones; the
 * tests pass in a fake API, so they don't need a server.
 */
import { ApiError, type PictureApi, type PictureDetails } from './api/picture-api';
import { createCarousel } from './components/carousel';
import { readCount, setupCountInput } from './components/count-input';
import { element } from './components/dom';
import { createPictureCard } from './components/picture-card';

/** The elements of index.html that the code works with. */
export interface PageElements {
  form: HTMLFormElement;
  countInput: HTMLInputElement;
  fetchButton: HTMLButtonElement;
  status: HTMLElement;
  fetchedPictures: HTMLElement;
  latestPicture: HTMLElement;
}

/** Finds the elements in the page by their ids, and complains clearly if one is missing. */
export function findPageElements(root: Document): PageElements {
  function find<T extends HTMLElement>(id: string, type: new () => T): T {
    const found = root.getElementById(id);
    if (!(found instanceof type)) {
      throw new Error(`index.html has no <${type.name}> with id "${id}".`);
    }
    return found;
  }

  return {
    form: find('fetch-form', HTMLFormElement),
    countInput: find('count-input', HTMLInputElement),
    fetchButton: find('fetch-button', HTMLButtonElement),
    status: find('fetch-status', HTMLElement),
    fetchedPictures: find('fetched-pictures', HTMLElement),
    latestPicture: find('latest-picture', HTMLElement),
  };
}

/** Starts the page. */
export function startApp(page: PageElements, api: PictureApi): void {
  setupCountInput(page.countInput);
  updateButtonText(page);
  page.countInput.addEventListener('input', () => updateButtonText(page));
  page.countInput.addEventListener('change', () => updateButtonText(page));

  showNothingFetchedYet(page.fetchedPictures);
  void loadLatestPicture(page, api);

  page.form.addEventListener('submit', (event) => {
    // A form normally reloads the page when sent; the code handles it instead.
    event.preventDefault();
    void fetchPictures(page, api);
  });
}

// ---------------------------------------------------------------------------
// Fetching new pictures
// ---------------------------------------------------------------------------

async function fetchPictures(page: PageElements, api: PictureApi): Promise<void> {
  const count = readCount(page.countInput);
  updateButtonText(page);
  setBusy(page, true);
  showStatus(page, `Fetching ${pluralize(count, 'random picture')}…`);

  try {
    const pictures = await api.fetchRandomPictures(count);
    showFetchedPictures(page.fetchedPictures, pictures);
    showStatus(page, `Fetched ${pluralize(pictures.length, 'new picture')}.`);
    // The newest of these is now the latest saved picture. Ask the API
    // rather than assume, in case someone else fetched one meanwhile.
    await loadLatestPicture(page, api);
  } catch (error) {
    showStatus(page, messageOf(error), { isError: true });
  } finally {
    setBusy(page, false);
  }
}

/** One picture is shown on its own; several go in a carousel. */
function showFetchedPictures(container: HTMLElement, pictures: PictureDetails[]): void {
  const [first] = pictures;
  if (!first) {
    showNothingFetchedYet(container);
  } else if (pictures.length === 1) {
    container.replaceChildren(createPictureCard(first));
  } else {
    container.replaceChildren(createCarousel(pictures));
  }
}

function showNothingFetchedYet(container: HTMLElement): void {
  container.replaceChildren(
    element('p', { class: 'placeholder' }, 'Pictures you fetch will appear here.'),
  );
}

/** While fetching, the button can't be pressed again, and says what's going on. */
function setBusy(page: PageElements, busy: boolean): void {
  page.fetchButton.disabled = busy;
  page.countInput.disabled = busy;
  page.fetchedPictures.setAttribute('aria-busy', String(busy));
  if (busy) {
    page.fetchButton.textContent = 'Fetching…';
  } else {
    updateButtonText(page);
  }
}

/** The button says how many pictures it will fetch: "Fetch 3 random pictures". */
function updateButtonText(page: PageElements): void {
  const count = Number(page.countInput.value) >= 1 ? Number(page.countInput.value) : 1;
  page.fetchButton.textContent = `Fetch ${pluralize(count, 'random picture')}`;
}

function showStatus(page: PageElements, message: string, options: { isError?: boolean } = {}): void {
  page.status.textContent = message;
  page.status.classList.toggle('status-error', options.isError ?? false);
}

// ---------------------------------------------------------------------------
// The latest picture
// ---------------------------------------------------------------------------

async function loadLatestPicture(page: PageElements, api: PictureApi): Promise<void> {
  const container = page.latestPicture;
  // Keep showing the old picture while loading, if there is one.
  if (container.childElementCount === 0) {
    container.replaceChildren(element('p', { class: 'placeholder' }, 'Loading…'));
  }

  try {
    const latest = await api.getLatestPicture();
    container.replaceChildren(
      latest
        ? createPictureCard(latest)
        : element('p', { class: 'placeholder' }, 'No picture has been saved yet. Fetch one to get started.'),
    );
  } catch (error) {
    container.replaceChildren(element('p', { class: 'placeholder status-error' }, messageOf(error)));
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** 1, "picture" -> "1 picture";  3, "picture" -> "3 pictures". */
function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** A message that can be shown to the user, whatever went wrong. */
function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}
