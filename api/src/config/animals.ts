/**
 * animals.ts : the lists of allowed animals and picture services
 *
 * These are the "enums" of the application: fixed lists of allowed values.
 * Everything else in the app (settings, requests, database rows) is checked
 * against these lists, so a misspelled animal like "cta" is caught early and
 * reported clearly instead of causing a confusing error later.
 *
 * To add a picture service, extend PROVIDERS_BY_ANIMAL below and add the
 * matching lines to .env.defaults. A new animal also goes in Animal below,
 * and the web page has its own list: ANIMAL_CHOICES in
 * ui/src/api/picture-api.ts, a radio button in ui/index.html, and
 * --color-<animal> and .animal-<animal> in ui/src/styles.css. The end of
 * .env.defaults has the step-by-step.
 */

/**
 * The kinds of animals the app can fetch pictures of.
 *
 * This is written as a plain object instead of a TypeScript "enum" keyword
 * because the values are lowercase strings that appear as-is in web
 * addresses (?animal=cat) and in the database, and a plain object keeps that
 * one-to-one relationship obvious.
 *
 * "as const" makes TypeScript remember the exact values ("cat", not just any
 * string) and forbids changing them. The Animal type below is built from
 * those exact values, so it needs this.
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
 * settings in .env.defaults, in lowercase. For example the setting
 * CAT_PROVIDER_CATAAS_URL belongs to the "cataas" provider.
 */
export const PROVIDERS_BY_ANIMAL: Readonly<Record<Animal, readonly string[]>> = {
  cat: ['cataas'],
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
  // The cast is only for TypeScript: on a list of Animals, includes() refuses
  // a plain string, and checking any text is the whole point here.
  return (ALL_ANIMALS as readonly string[]).includes(value);
}
