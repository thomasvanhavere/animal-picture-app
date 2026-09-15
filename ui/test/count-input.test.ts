/**
 * count-input.test.ts : tests for the "#Pictures" box
 *
 * Checks that only whole numbers of 1 or more can end up in the box, however
 * the user tries: typing, pasting, or clearing it.
 */
import { cleanCount, readCount, setupCountInput } from '../src/components/count-input';

/** A fresh number box with the rules applied. */
function makeInput(): HTMLInputElement {
  document.body.innerHTML = '<input type="number" min="1" step="1" />';
  const input = document.querySelector('input')!;
  setupCountInput(input);
  return input;
}

/** Presses a key; returns false if the box refused it. */
function pressKey(input: HTMLInputElement, key: string, options: KeyboardEventInit = {}): boolean {
  return input.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...options }));
}

/** Puts text in the box the way pasting does, then lets the rules react. */
function pasteText(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

describe('the count input', () => {
  it('starts at 1', () => {
    expect(makeInput().value).toBe('1');
  });

  it('accepts digits', () => {
    const input = makeInput();

    for (const digit of '0123456789') {
      expect(pressKey(input, digit)).toBe(true);
    }
  });

  it.each(['-', '+', 'e', 'E', '.', ',', 'a', ' '])('refuses to type "%s"', (key) => {
    expect(pressKey(makeInput(), key)).toBe(false);
  });

  it('keeps editing keys and shortcuts working', () => {
    const input = makeInput();

    for (const key of ['Backspace', 'Delete', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'Enter']) {
      expect(pressKey(input, key)).toBe(true);
    }
    expect(pressKey(input, 'v', { ctrlKey: true })).toBe(true);
    expect(pressKey(input, 'v', { metaKey: true })).toBe(true);
  });

  it('turns a pasted negative number into a positive one', () => {
    const input = makeInput();

    pasteText(input, '-5');

    expect(input.value).toBe('5');
  });

  it('can be cleared while typing, and becomes 1 when the user leaves it empty', () => {
    const input = makeInput();

    pasteText(input, '');
    expect(input.value).toBe('');

    input.dispatchEvent(new Event('change'));
    expect(input.value).toBe('1');
  });

  it('becomes 1 when the user leaves it at 0', () => {
    const input = makeInput();

    pasteText(input, '0');
    input.dispatchEvent(new Event('change'));

    expect(input.value).toBe('1');
  });
});

describe('readCount', () => {
  it.each([
    ['4', 4],
    ['', 1],
    ['0', 1],
  ])('reads "%s" as %i, and shows that number in the box', (value, expected) => {
    const input = document.createElement('input');
    input.value = value;

    expect(readCount(input)).toBe(expected);
    expect(input.value).toBe(String(expected));
  });
});

describe('cleanCount', () => {
  it.each([
    ['3', '3'],
    ['-5', '5'],
    ['2.7', '2'],
    ['007', '7'],
    [' 12 ', '12'],
    ['abc', ''],
    ['', ''],
  ])('turns "%s" into "%s"', (text, expected) => {
    expect(cleanCount(text)).toBe(expected);
  });
});
