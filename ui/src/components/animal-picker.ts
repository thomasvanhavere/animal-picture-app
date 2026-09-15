/**
 * animal-picker.ts : the "Animal" choice (Random, Cat, Dog or Bear)
 *
 * The choice itself is a group of radio buttons in index.html, so the
 * browser already handles clicking, the arrow keys and "only one at a time".
 * This file only reads which one is selected.
 */
import { ANIMAL_CHOICES, type AnimalChoice } from '../api/picture-api';

/** The choice used when nothing (valid) is selected. */
export const DEFAULT_ANIMAL_CHOICE: AnimalChoice = 'random';

/** Which animal is selected in the picker. */
export function readAnimalChoice(picker: HTMLFieldSetElement): AnimalChoice {
  const selected = picker.querySelector<HTMLInputElement>('input[name="animal"]:checked')?.value;
  return ANIMAL_CHOICES.find((choice) => choice === selected) ?? DEFAULT_ANIMAL_CHOICE;
}
