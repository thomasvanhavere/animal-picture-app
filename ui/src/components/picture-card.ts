/**
 * picture-card.ts : shows one picture with a short caption
 *
 *   ┌───────────────────────┐
 *   │                       │
 *   │       (picture)       │
 *   │                       │
 *   ├───────────────────────┤
 *   │ Cat  cataas · 73 KB   │
 *   │      15 Sep, 10:00    │
 *   └───────────────────────┘
 *
 * Used for the latest picture, for a single fetched picture, and for each
 * slide of the carousel.
 */
import type { PictureDetails } from '../api/picture-api';
import { element } from './dom';

/**
 * Builds the card for one picture: the picture with its caption below.
 * With lazy, the browser may wait to download the picture until it is about
 * to be seen.
 */
export function createPictureCard(picture: PictureDetails, options: { lazy?: boolean } = {}): HTMLElement {
  const image = element('img', {
    src: picture.url,
    alt: `A random ${picture.animal} picture from ${picture.provider}`,
    // Carousel slides that aren't shown yet can load later.
    loading: options.lazy ? 'lazy' : 'eager',
    // Lets the browser decode the picture in the background, instead of
    // holding up the rest of the page while it does.
    decoding: 'async',
  });

  const frame = element('div', { class: 'picture-frame' }, image);

  // If the file can't be loaded, say so instead of showing a broken image icon.
  image.addEventListener('error', () => {
    frame.replaceChildren(element('p', { class: 'picture-missing' }, 'This picture could not be loaded.'));
  });

  return element(
    'figure',
    { class: 'picture-card' },
    frame,
    element(
      'figcaption',
      { class: 'picture-caption' },
      element('span', { class: `animal-badge animal-${picture.animal}` }, capitalize(picture.animal)),
      element(
        'span',
        { class: 'picture-meta' },
        `${picture.provider} · ${formatBytes(picture.sizeBytes)} · `,
        element('time', { datetime: picture.createdAt }, formatTime(picture.createdAt)),
      ),
    ),
  );
}

/** 73262 -> "72 KB". Pictures are never big enough to need more than MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The save time in the visitor's own language and time zone, for example "15 Sep, 10:00". */
function formatTime(isoText: string): string {
  return new Date(isoText).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
