/**
 * config.test.ts : tests for reading and checking the settings
 *
 * Each test builds a small set of environment variables, hands it to
 * loadConfig, and checks that either the right Config comes out or the
 * right error message is raised.
 */
import { ConfigError, loadConfig } from '../src/config/config.js';

/** A complete, valid set of settings that each test can tweak. */
function validEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    ENABLED_ANIMALS: 'cat,dog,bear',
    DEFAULT_ANIMAL: 'random',
    PICTURE_SIZE_VARIATION: '50',
    CAT_PROVIDER: 'cataas',
    CAT_PROVIDER_CATAAS_URL: 'https://cataas.com/cat?width={width}',
    CAT_PICTURE_WIDTH: '500',
    CAT_PICTURE_HEIGHT: '400',
    DOG_PROVIDER: 'placedog',
    DOG_PROVIDER_PLACEDOG_URL: 'https://place.dog/{width}/{height}',
    DOG_PICTURE_WIDTH: '500',
    DOG_PICTURE_HEIGHT: '400',
    BEAR_PROVIDER: 'placebear',
    BEAR_PROVIDER_PLACEBEAR_URL: 'https://placebear.com/{width}/{height}',
    BEAR_PICTURE_WIDTH: '500',
    BEAR_PICTURE_HEIGHT: '400',
    DATABASE_HOST: 'localhost',
    DATABASE_NAME: 'animal_picture_database',
    DATABASE_USER: 'animal_picture_user',
    DATABASE_PASSWORD: 'secret',
    ...overrides,
  };
}

describe('loadConfig', () => {
  it('reads a complete, valid set of settings', () => {
    const config = loadConfig(validEnv());

    expect(config.enabledAnimals).toEqual(['cat', 'dog', 'bear']);
    expect(config.defaultAnimal).toBe('random');
    expect(config.pictureSizeVariation).toBe(50);
    expect(config.animals.dog).toEqual({
      provider: 'placedog',
      providerUrlTemplate: 'https://place.dog/{width}/{height}',
      width: 500,
      height: 400,
    });
    expect(config.database).toEqual({
      host: 'localhost',
      port: 5432, // the fallback, because DATABASE_PORT wasn't set
      name: 'animal_picture_database',
      user: 'animal_picture_user',
      password: 'secret',
    });
  });

  it('uses fallbacks for optional settings', () => {
    const config = loadConfig(validEnv());
    expect(config.port).toBe(3000);
    expect(config.maxPicturesPerRequest).toBe(10);
    expect(config.downloadTimeoutMs).toBe(10_000);
  });

  it('only reads the settings of enabled animals', () => {
    // Bear settings are missing, but bears are switched off, so that's fine.
    const env = validEnv({ ENABLED_ANIMALS: 'cat, dog', BEAR_PROVIDER: undefined });
    const config = loadConfig(env);
    expect(config.enabledAnimals).toEqual(['cat', 'dog']);
    expect(config.animals.bear).toBeUndefined();
  });

  it('rejects an unknown animal in ENABLED_ANIMALS', () => {
    expect(() => loadConfig(validEnv({ ENABLED_ANIMALS: 'cat,fox' }))).toThrow(
      new ConfigError('ENABLED_ANIMALS contains "fox", which is not a known animal. Allowed: cat, dog, bear.'),
    );
  });

  it('rejects a DEFAULT_ANIMAL that is not enabled', () => {
    expect(() => loadConfig(validEnv({ ENABLED_ANIMALS: 'cat', DEFAULT_ANIMAL: 'dog' }))).toThrow(
      /DEFAULT_ANIMAL is "dog"/,
    );
  });

  it('rejects an unknown picture service', () => {
    expect(() => loadConfig(validEnv({ CAT_PROVIDER: 'catapi' }))).toThrow(
      new ConfigError(
        'CAT_PROVIDER is "catapi", which is not a known cat picture service. Allowed: cataas, placecats, placekitten.',
      ),
    );
  });

  it('requires the URL of the selected picture service', () => {
    expect(() => loadConfig(validEnv({ CAT_PROVIDER: 'placecats' }))).toThrow(
      /CAT_PROVIDER_PLACECATS_URL is not set/,
    );
  });

  it('rejects a picture service URL that is not a web address', () => {
    expect(() => loadConfig(validEnv({ DOG_PROVIDER_PLACEDOG_URL: 'place.dog/{width}' }))).toThrow(
      /DOG_PROVIDER_PLACEDOG_URL must be a web address/,
    );
  });

  it('rejects numbers that are not whole numbers', () => {
    expect(() => loadConfig(validEnv({ CAT_PICTURE_WIDTH: '50.5' }))).toThrow(
      new ConfigError('CAT_PICTURE_WIDTH must be a whole number, but it is "50.5".'),
    );
  });

  it('rejects numbers outside their allowed range', () => {
    expect(() => loadConfig(validEnv({ PICTURE_SIZE_VARIATION: '-1' }))).toThrow(
      /PICTURE_SIZE_VARIATION must be at least 0/,
    );
    expect(() => loadConfig(validEnv({ API_PORT: '70000' }))).toThrow(/API_PORT must be at most 65535/);
  });

  it('names the missing setting', () => {
    expect(() => loadConfig(validEnv({ DATABASE_PASSWORD: '' }))).toThrow(
      new ConfigError('DATABASE_PASSWORD is not set. See .env.example for a description.'),
    );
  });
});

describe('loadConfig with loosely written values', () => {
  it('ignores case, spaces and duplicates in ENABLED_ANIMALS', () => {
    const config = loadConfig(validEnv({ ENABLED_ANIMALS: ' Cat , DOG,cat,, ', DEFAULT_ANIMAL: 'Dog' }));

    expect(config.enabledAnimals).toEqual(['cat', 'dog']);
    expect(config.defaultAnimal).toBe('dog');
  });

  it('uses "random" when DEFAULT_ANIMAL is not set', () => {
    expect(loadConfig(validEnv({ DEFAULT_ANIMAL: undefined })).defaultAnimal).toBe('random');
  });

  it('rejects an ENABLED_ANIMALS list with nothing in it', () => {
    expect(() => loadConfig(validEnv({ ENABLED_ANIMALS: ' , ' }))).toThrow(
      /ENABLED_ANIMALS must list at least one animal/,
    );
  });
});
