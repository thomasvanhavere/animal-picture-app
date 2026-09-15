/**
 * carousel.ts : shows several pictures one at a time
 *
 *        ┌───────────────────────────┐
 *     ‹  │         (picture)         │  ›
 *        └───────────────────────────┘
 *               ●  ○  ○    1 / 3
 *
 * The pictures sit side by side in a long strip (the "track"), and only one
 * fits in the visible window at a time. Moving to another picture slides the
 * strip left or right. The user can move with:
 *   - the ‹ and › buttons,
 *   - the dots below (one per picture),
 *   - the left and right arrow keys, once the carousel has keyboard focus,
 *   - a swipe, on a touch screen.
 * Going past the last picture wraps around to the first, and the other way round.
 *
 * Screen readers are told this is a carousel, and each slide is named
 * "Picture 2 of 3". The counter ("2 / 3") is read out whenever the picture
 * changes.
 */
import type { PictureDetails } from '../api/picture-api';
import { element } from './dom';
import { createPictureCard } from './picture-card';

/** How far (in pixels) a finger must move sideways to count as a swipe. */
const SWIPE_DISTANCE = 40;

/**
 * Builds a carousel of the given pictures, showing the first one.
 * Needs at least one picture. app.ts only uses it for two or more, and shows
 * a single picture as a plain card.
 */
export function createCarousel(pictures: PictureDetails[]): HTMLElement {
  let current = 0;

  const slides = pictures.map((picture, index) =>
    element(
      'li',
      {
        class: 'carousel-slide',
        'aria-roledescription': 'slide',
        'aria-label': `Picture ${index + 1} of ${pictures.length}`,
      },
      // Only the first picture is visible straight away; the others may load later.
      createPictureCard(picture, { lazy: index > 0 }),
    ),
  );
  const track = element('ul', { class: 'carousel-track' }, ...slides);

  const previousButton = element(
    'button',
    { type: 'button', class: 'carousel-arrow carousel-previous', 'aria-label': 'Previous picture' },
    '‹',
  );
  const nextButton = element(
    'button',
    { type: 'button', class: 'carousel-arrow carousel-next', 'aria-label': 'Next picture' },
    '›',
  );

  const dots = pictures.map((_, index) =>
    element('button', { type: 'button', class: 'carousel-dot', 'aria-label': `Show picture ${index + 1}` }),
  );
  const counter = element('p', { class: 'carousel-counter', 'aria-live': 'polite' });

  const carousel = element(
    'div',
    {
      class: 'carousel',
      role: 'region',
      'aria-roledescription': 'carousel',
      'aria-label': 'Fetched pictures',
      // Makes the carousel focusable, so the arrow keys work.
      tabindex: '0',
    },
    element('div', { class: 'carousel-viewport' }, track, previousButton, nextButton),
    element('div', { class: 'carousel-footer' }, element('div', { class: 'carousel-dots' }, ...dots), counter),
  );

  /** Shows the picture at the given position, wrapping around at both ends. */
  function show(index: number): void {
    // In JavaScript, % can give a negative result (-1 % 3 is -1), so the
    // length is added first: -1 becomes the last picture, and one past the
    // last becomes 0.
    current = (index + pictures.length) % pictures.length;

    track.style.transform = `translateX(-${current * 100}%)`;
    slides.forEach((slide, i) => {
      // Hidden slides can't be reached with the Tab key or read by screen readers.
      slide.toggleAttribute('inert', i !== current);
      slide.setAttribute('aria-hidden', String(i !== current));
    });
    dots.forEach((dot, i) => {
      if (i === current) {
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }
    });
    counter.textContent = `${current + 1} / ${pictures.length}`;
  }

  previousButton.addEventListener('click', () => show(current - 1));
  nextButton.addEventListener('click', () => show(current + 1));
  dots.forEach((dot, index) => dot.addEventListener('click', () => show(index)));

  carousel.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(current - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(current + 1);
    }
  });

  // Swiping: remember where the finger went down, and compare where it lifts.
  let swipeStartX: number | null = null;
  track.addEventListener('pointerdown', (event) => {
    swipeStartX = event.clientX;
  });
  track.addEventListener('pointerup', (event) => {
    if (swipeStartX === null) {
      return;
    }
    const distance = event.clientX - swipeStartX;
    swipeStartX = null;
    if (distance > SWIPE_DISTANCE) {
      show(current - 1);
    } else if (distance < -SWIPE_DISTANCE) {
      show(current + 1);
    }
  });

  show(0);
  return carousel;
}
