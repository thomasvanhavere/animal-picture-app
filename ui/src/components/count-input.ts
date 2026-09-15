/**
 * count-input.ts : the "How many" box, which only accepts whole numbers of 1 or more
 *
 * A number box (<input type="number" min="1">) alone isn't strict enough:
 * browsers still let you type "-", "e" or ".", paste "-5", or leave it
 * empty. This file adds the missing rules:
 *   - keys that aren't digits are ignored while typing,
 *   - pasted or dropped text is cleaned up to a whole, positive number,
 *   - an empty box or 0 becomes 1 again as soon as you leave the box.
 */

/** The number of pictures fetched when nothing else is filled in. */
export const DEFAULT_COUNT = 1;

/** Adds the rules above to the box. */
export function setupCountInput(input: HTMLInputElement): void {
  input.value = String(DEFAULT_COUNT);

  input.addEventListener('keydown', (event) => {
    // Single characters are what the key would type. Longer names are keys
    // like "Backspace", "Tab" or "ArrowUp", which must keep working, and so
    // must shortcuts such as Ctrl+V.
    const typesCharacter = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (typesCharacter && !/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  });

  // Runs after every change to the text, including pasting and dropping.
  input.addEventListener('input', () => {
    const cleaned = cleanCount(input.value);
    if (cleaned !== input.value) {
      input.value = cleaned;
    }
  });

  // Runs when the user leaves the box (and before a click on the button).
  input.addEventListener('change', () => {
    input.value = String(readCount(input));
  });
}

/**
 * Reads the number in the box, never less than 1. Also writes that number
 * back into the box, so what's shown matches what's fetched.
 */
export function readCount(input: HTMLInputElement): number {
  const count = Number(cleanCount(input.value));
  const valid = Number.isInteger(count) && count >= 1 ? count : DEFAULT_COUNT;
  input.value = String(valid);
  return valid;
}

/**
 * Turns any text into the digits of a whole, positive number, or into empty
 * text. Empty is allowed while typing, so the box can be cleared to type a
 * new number.
 *   "3" -> "3",  "-5" -> "5",  "2.7" -> "2",  "007" -> "7",  "abc" -> ""
 */
export function cleanCount(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') {
    return '';
  }
  const number = Number(trimmed);
  if (!Number.isFinite(number)) {
    return '';
  }
  return String(Math.trunc(Math.abs(number)));
}
