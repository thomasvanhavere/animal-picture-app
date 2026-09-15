/**
 * config.ts : reads and checks all settings
 *
 * All settings come from environment variables, which are described in
 * .env.example at the root of the project. This file reads them once when
 * the app starts, checks that every value makes sense, and turns them into
 * one typed "Config" object that the rest of the app uses.
 *
 * Why check everything up front? A wrong setting (a misspelled provider
 * name, a missing password) would otherwise only show up later, at the
 * moment that setting is first used, with an unclear error. Checking at
 * start-up means the app either starts correctly, or stops right away with
 * a message that names the exact setting to fix.
 */
import {
  ALL_ANIMALS,
  Animal,
  isAnimal,
  PROVIDERS_BY_ANIMAL,
  RANDOM_ANIMAL,
} from './animals.js';

/** Settings for one animal: which service to use, its address, and the picture size. */
export interface AnimalConfig {
  /** Name of the selected picture service, for example "cataas". */
  provider: string;
  /** Web address of the selected service, still containing {width}/{height} placeholders. */
  providerUrlTemplate: string;
  /** Wanted picture width in pixels. */
  width: number;
  /** Wanted picture height in pixels. */
  height: number;
}

/** Settings for connecting to the PostgreSQL database. */
export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
}

/** All settings of the application, checked and typed. */
export interface Config {
  /** The network port the API listens on. */
  port: number;
  /** Which animals may be fetched. */
  enabledAnimals: Animal[];
  /** Animal used when a request doesn't pick one, or "random". */
  defaultAnimal: Animal | typeof RANDOM_ANIMAL;
  /** How many random pixels may be added to a picture size (see .env.example). */
  pictureSizeVariation: number;
  /** The most pictures one request may fetch. */
  maxPicturesPerRequest: number;
  /** How long to wait for a picture service before giving up, in milliseconds. */
  downloadTimeoutMs: number;
  /** Settings per animal, only for the enabled ones. */
  animals: Partial<Record<Animal, AnimalConfig>>;
  database: DatabaseConfig;
}

/**
 * Thrown when a setting is missing or has a bad value. The message always
 * names the setting, so the user knows what to fix.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** The raw environment variables, as Node.js gives them to us: text or nothing. */
type Env = Record<string, string | undefined>;

/**
 * Builds the Config from environment variables.
 *
 * @param env  The environment to read from. Defaults to the real process
 *             environment; tests pass in their own values instead.
 * @throws ConfigError if any setting is missing or invalid.
 */
export function loadConfig(env: Env = process.env): Config {
  const enabledAnimals = readEnabledAnimals(env);

  // Read the settings of every enabled animal. Animals that are switched off
  // are skipped, so their settings don't even have to exist.
  const animals: Partial<Record<Animal, AnimalConfig>> = {};
  for (const animal of enabledAnimals) {
    animals[animal] = readAnimalConfig(env, animal);
  }

  return {
    port: readInteger(env, 'API_PORT', { fallback: 3000, min: 1, max: 65535 }),
    enabledAnimals,
    defaultAnimal: readDefaultAnimal(env, enabledAnimals),
    pictureSizeVariation: readInteger(env, 'PICTURE_SIZE_VARIATION', { fallback: 0, min: 0 }),
    maxPicturesPerRequest: readInteger(env, 'MAX_PICTURES_PER_REQUEST', { fallback: 10, min: 1 }),
    downloadTimeoutMs: readInteger(env, 'DOWNLOAD_TIMEOUT_MS', { fallback: 10_000, min: 1 }),
    animals,
    database: {
      host: readText(env, 'DATABASE_HOST'),
      port: readInteger(env, 'DATABASE_PORT', { fallback: 5432, min: 1, max: 65535 }),
      name: readText(env, 'DATABASE_NAME'),
      user: readText(env, 'DATABASE_USER'),
      password: readText(env, 'DATABASE_PASSWORD'),
    },
  };
}

// ---------------------------------------------------------------------------
// Readers for the animal-related settings
// ---------------------------------------------------------------------------

/** Reads ENABLED_ANIMALS, a comma-separated list such as "cat,dog,bear". */
function readEnabledAnimals(env: Env): Animal[] {
  const raw = readText(env, 'ENABLED_ANIMALS');
  const names = raw.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);

  if (names.length === 0) {
    throw new ConfigError(`ENABLED_ANIMALS must list at least one animal (${ALL_ANIMALS.join(', ')}).`);
  }

  const animals: Animal[] = [];
  for (const name of names) {
    if (!isAnimal(name)) {
      throw new ConfigError(
        `ENABLED_ANIMALS contains "${name}", which is not a known animal. Allowed: ${ALL_ANIMALS.join(', ')}.`,
      );
    }
    // Ignore duplicates such as "cat,cat".
    if (!animals.includes(name)) {
      animals.push(name);
    }
  }
  return animals;
}

/** Reads DEFAULT_ANIMAL, which must be an enabled animal or "random". */
function readDefaultAnimal(env: Env, enabledAnimals: Animal[]): Animal | typeof RANDOM_ANIMAL {
  const value = (env['DEFAULT_ANIMAL'] ?? RANDOM_ANIMAL).trim().toLowerCase();

  if (value === RANDOM_ANIMAL) {
    return RANDOM_ANIMAL;
  }
  if (!isAnimal(value) || !enabledAnimals.includes(value)) {
    throw new ConfigError(
      `DEFAULT_ANIMAL is "${value}", but it must be "${RANDOM_ANIMAL}" or one of the enabled animals: ${enabledAnimals.join(', ')}.`,
    );
  }
  return value;
}

/**
 * Reads the settings of one animal, for example for "cat":
 *   CAT_PROVIDER, CAT_PROVIDER_<NAME>_URL, CAT_PICTURE_WIDTH, CAT_PICTURE_HEIGHT
 */
function readAnimalConfig(env: Env, animal: Animal): AnimalConfig {
  const prefix = animal.toUpperCase(); // "cat" -> "CAT"
  const allowedProviders = PROVIDERS_BY_ANIMAL[animal];

  const provider = readText(env, `${prefix}_PROVIDER`).toLowerCase();
  if (!allowedProviders.includes(provider)) {
    throw new ConfigError(
      `${prefix}_PROVIDER is "${provider}", which is not a known ${animal} picture service. Allowed: ${allowedProviders.join(', ')}.`,
    );
  }

  const urlSetting = `${prefix}_PROVIDER_${provider.toUpperCase()}_URL`;
  const providerUrlTemplate = readText(env, urlSetting);
  if (!providerUrlTemplate.startsWith('http://') && !providerUrlTemplate.startsWith('https://')) {
    throw new ConfigError(`${urlSetting} must be a web address starting with http:// or https://.`);
  }

  return {
    provider,
    providerUrlTemplate,
    width: readInteger(env, `${prefix}_PICTURE_WIDTH`, { min: 1 }),
    height: readInteger(env, `${prefix}_PICTURE_HEIGHT`, { min: 1 }),
  };
}

// ---------------------------------------------------------------------------
// Small general-purpose readers
// ---------------------------------------------------------------------------

/** Reads a setting that must be present and not empty. */
function readText(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`${name} is not set. See .env.example for a description.`);
  }
  return value;
}

/**
 * Reads a whole number, with optional limits and an optional fallback for
 * when the setting is absent. Empty or non-numeric values are rejected.
 */
function readInteger(
  env: Env,
  name: string,
  options: { fallback?: number; min?: number; max?: number } = {},
): number {
  const raw = env[name]?.trim();

  if (raw === undefined || raw === '') {
    if (options.fallback !== undefined) {
      return options.fallback;
    }
    throw new ConfigError(`${name} is not set. See .env.example for a description.`);
  }

  // Number() accepts things like "1e3" or " 12 ", so we check the text is
  // made of digits only (with an optional minus sign) to be strict.
  if (!/^-?\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be a whole number, but it is "${raw}".`);
  }
  const value = Number(raw);

  if (options.min !== undefined && value < options.min) {
    throw new ConfigError(`${name} must be at least ${options.min}, but it is ${value}.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new ConfigError(`${name} must be at most ${options.max}, but it is ${value}.`);
  }
  return value;
}
