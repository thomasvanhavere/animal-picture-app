/**
 * carousel.test.ts : tests for the carousel of fetched pictures
 */
import type { PictureDetails } from '../src/api/picture-api';
import { createCarousel } from '../src/components/carousel';

/** A picture with the given id and animal; the other details don't matter here. */
function picture(id: number, animal = 'cat'): PictureDetails {
  return {
    id,
    animal,
    provider: 'cataas',
    sourceUrl: 'https://cataas.com/cat?width=500',
    contentType: 'image/jpeg',
    sizeBytes: 2048,
    createdAt: '2026-09-15T10:00:00.000Z',
    url: `/api/pictures/${id}`,
  };
}

/** Builds a carousel in the page, with handy ways to look at and use it. */
function makeCarousel(pictures: PictureDetails[]) {
  const carousel = createCarousel(pictures);
  document.body.replaceChildren(carousel);

  const slides = [...carousel.querySelectorAll<HTMLElement>('.carousel-slide')];
  return {
    carousel,
    slides,
    /** The position (0 = first) of the one slide that is shown. */
    shownIndex: () => slides.findIndex((slide) => !slide.hasAttribute('inert')),
    counter: () => carousel.querySelector('.carousel-counter')!.textContent,
    track: () => carousel.querySelector<HTMLElement>('.carousel-track')!,
    click: (selector: string) => carousel.querySelector<HTMLButtonElement>(selector)!.click(),
    dots: () => [...carousel.querySelectorAll<HTMLButtonElement>('.carousel-dot')],
    press: (key: string) => carousel.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true })),
  };
}

describe('createCarousel', () => {
  it('shows one slide per picture, starting with the first', () => {
    const view = makeCarousel([picture(1), picture(2, 'dog'), picture(3, 'bear')]);

    expect(view.slides).toHaveLength(3);
    expect(view.slides.map((slide) => slide.querySelector('img')!.getAttribute('src'))).toEqual([
      '/api/pictures/1',
      '/api/pictures/2',
      '/api/pictures/3',
    ]);
    expect(view.shownIndex()).toBe(0);
    expect(view.counter()).toBe('1 / 3');
  });

  it('hides the slides that are not shown from keyboards and screen readers', () => {
    const view = makeCarousel([picture(1), picture(2)]);

    expect(view.slides[0]!.getAttribute('aria-hidden')).toBe('false');
    expect(view.slides[1]!.getAttribute('aria-hidden')).toBe('true');
    expect(view.slides[1]!.hasAttribute('inert')).toBe(true);
  });

  it('moves forward and back with the arrow buttons, sliding the track', () => {
    const view = makeCarousel([picture(1), picture(2), picture(3)]);

    view.click('.carousel-next');
    expect(view.shownIndex()).toBe(1);
    expect(view.counter()).toBe('2 / 3');
    expect(view.track().style.transform).toBe('translateX(-100%)');

    view.click('.carousel-previous');
    expect(view.shownIndex()).toBe(0);
    expect(view.track().style.transform).toBe('translateX(-0%)');
  });

  it('wraps around at both ends', () => {
    const view = makeCarousel([picture(1), picture(2), picture(3)]);

    view.click('.carousel-previous');
    expect(view.counter()).toBe('3 / 3');

    view.click('.carousel-next');
    expect(view.counter()).toBe('1 / 3');
  });

  it('jumps to a picture with its dot, and marks that dot as current', () => {
    const view = makeCarousel([picture(1), picture(2), picture(3)]);

    view.dots()[2]!.click();

    expect(view.shownIndex()).toBe(2);
    expect(view.dots().map((dot) => dot.getAttribute('aria-current'))).toEqual([null, null, 'true']);
  });

  it('moves with the left and right arrow keys', () => {
    const view = makeCarousel([picture(1), picture(2), picture(3)]);

    view.press('ArrowRight');
    view.press('ArrowRight');
    expect(view.shownIndex()).toBe(2);

    view.press('ArrowLeft');
    expect(view.shownIndex()).toBe(1);
  });

  it('moves with a swipe', () => {
    const view = makeCarousel([picture(1), picture(2), picture(3)]);
    const swipe = (fromX: number, toX: number) => {
      view.track().dispatchEvent(new MouseEvent('pointerdown', { clientX: fromX }));
      view.track().dispatchEvent(new MouseEvent('pointerup', { clientX: toX }));
    };

    swipe(300, 100); // finger moves left: next picture
    expect(view.shownIndex()).toBe(1);

    swipe(100, 300); // finger moves right: previous picture
    expect(view.shownIndex()).toBe(0);

    swipe(200, 190); // too small to count as a swipe
    expect(view.shownIndex()).toBe(0);
  });

  it('shows each picture with its animal, provider and size', () => {
    const view = makeCarousel([picture(1, 'bear'), picture(2)]);

    const caption = view.slides[0]!.querySelector('figcaption')!.textContent;

    expect(caption).toContain('Bear');
    expect(caption).toContain('cataas · 2 KB');
    expect(view.slides[0]!.querySelector('img')!.getAttribute('alt')).toBe('A random bear picture from cataas');
  });
});
