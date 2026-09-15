/**
 * animals.ts : the lists of allowed animals and picture services
 *
 * These are the "enums" of the application: fixed lists of allowed values.
 * Everything else in the app (settings, requests, database rows) is checked
 * against these lists, so a misspelled animal like "cta" is caught early and
 * reported clearly instead of causing a confusing error later.
 *
 * To add a new animal or picture service, extend the lists in this file and
 * add the matching lines to .env.example.
 */

/**
 * The kinds of animals the app can fetch pictures of.
 *
 * This is written as a plain object instead of a TypeScript "enum" keyword
 * because the values are lowercase strings that appear as-is in web
 * addresses (?animal=cat) and in the database, and a plain object keeps that
 * one-to-one relationship obvious.
 */
export const Animal = {
  Cat: 'cat',
  Dog: 'dog',
  Bear: 'bear',
} as const;

/** The type of one animal value: "cat" | "dog" | "bear". */
export type Animal = (typeof Animal)[keyof typeof Animal];

/** All animals as a list, handy for checking values and for error messages. */
export const ALL_ANIMALS: readonly Animal[] = Object.values(Animal);

/**
 * The picture services that exist for each animal.
 *
 * The keys must match the <NAME> part of the <ANIMAL>_PROVIDER_<NAME>_URL
 * settings in .env.example, in lowercase. For example the setting
 * CAT_PROVIDER_CATAAS_URL belongs to the "cataas" provider.
 */
export const PROVIDERS_BY_ANIMAL: Readonly<Record<Animal, readonly string[]>> = {
  cat: ['cataas', 'placecats', 'placekitten'],
  dog: ['placedog'],
  bear: ['placebear'],
};

/** Special value for DEFAULT_ANIMAL that means "pick one of the enabled animals". */
export const RANDOM_ANIMAL = 'random';

/**
 * Checks whether a piece of text is one of the known animals.
 *
 * Besides returning true/false, this tells TypeScript that the value can be
 * treated as an Animal afterwards (a "type guard").
 */
export function isAnimal(value: string): value is Animal {
  return (ALL_ANIMALS as readonly string[]).includes(value);
}
