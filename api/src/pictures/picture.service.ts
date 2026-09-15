/**
 * picture.service.ts : the business logic for pictures
 *
 * A "service" holds the actual rules of the application, independent of how
 * it is reached (over HTTP today, maybe from a Camunda job worker later).
 * It decides which animal to fetch, asks the downloader for the pictures,
 * and asks the repository to save and find them.
 *
 * It never deals with HTTP requests or responses directly. That is the
 * controller's job.
 */
import { Animal, RANDOM_ANIMAL } from '../config/animals.js';
import type { Config } from '../config/config.js';
import type { AnimalPicture } from '../database/animal-picture.entity.js';
import { BadRequestError, NotFoundError } from '../errors/http-error.js';
import type { DownloadedPicture, PictureDownloader } from './picture-downloader.js';
import type { AnimalPictureDetails, PictureRepository } from './picture.repository.js';

/** The parts of the settings this class needs. */
type ServiceConfig = Pick<Config, 'enabledAnimals' | 'defaultAnimal' | 'maxPicturesPerRequest'>;

export class PictureService {
  constructor(
    private readonly config: ServiceConfig,
    private readonly downloader: PictureDownloader,
    private readonly repository: PictureRepository,
  ) {}

  /**
   * Downloads and saves one or more new pictures.
   *
   * @param animal  Which animal, "random", or undefined to use the
   *                DEFAULT_ANIMAL setting. With "random" (asked for, or as the
   *                setting), every picture gets its own random enabled animal,
   *                so asking for 3 pictures may give a cat, a bear and another cat.
   * @param count   How many pictures. Defaults to 1.
   * @returns The saved pictures (without their file contents), newest last.
   * @throws BadRequestError if the animal is unknown or disabled, or the count is out of range.
   * @throws BadGatewayError if any download fails. Nothing is saved in that case.
   */
  async fetchAndSave(
    animal: Animal | typeof RANDOM_ANIMAL | undefined,
    count = 1,
  ): Promise<AnimalPictureDetails[]> {
    if (count < 1 || count > this.config.maxPicturesPerRequest) {
      throw new BadRequestError(
        `count must be between 1 and ${this.config.maxPicturesPerRequest}, but it is ${count}.`,
      );
    }
    const choice = animal ?? this.config.defaultAnimal;
    if (choice !== RANDOM_ANIMAL) {
      this.assertEnabled(choice);
    }

    const downloaded: DownloadedPicture[] = [];
    // Pictures are fetched one after the other, on purpose: firing many
    // requests at once at a free public service is not polite, and it makes
    // the service more likely to refuse us.
    for (let i = 0; i < count; i++) {
      downloaded.push(await this.downloader.download(choice === RANDOM_ANIMAL ? this.pickRandomAnimal() : choice));
    }

    // Only save once every download has succeeded, and save them all in one
    // go, so a request either saves all its pictures or none. Otherwise a
    // caller who gets an error could still have added pictures without knowing.
    const saved = await this.repository.saveAll(
      downloaded.map((picture) => ({ ...picture, sizeBytes: picture.imageData.byteLength })),
    );
    return saved.map(withoutImageData);
  }

  /**
   * Returns the most recently saved picture, of any animal, with its file contents.
   * @throws NotFoundError if nothing has been saved yet.
   */
  async getLatest(): Promise<AnimalPicture> {
    const picture = await this.repository.findLatest();
    if (!picture) {
      throw new NotFoundError(NO_PICTURE_MESSAGE);
    }
    return picture;
  }

  /** Like getLatest, but without the file contents. */
  async getLatestDetails(): Promise<AnimalPictureDetails> {
    const details = await this.repository.findLatestDetails();
    if (!details) {
      throw new NotFoundError(NO_PICTURE_MESSAGE);
    }
    return details;
  }

  /**
   * Returns one specific picture by id, with its file contents.
   * @throws NotFoundError if there is no picture with that id.
   */
  async getById(id: number): Promise<AnimalPicture> {
    const picture = await this.repository.findById(id);
    if (!picture) {
      throw new NotFoundError(`There is no picture with id ${id}.`);
    }
    return picture;
  }

  /** Complains if the animal is not in ENABLED_ANIMALS. */
  private assertEnabled(animal: Animal): void {
    if (!this.config.enabledAnimals.includes(animal)) {
      throw new BadRequestError(
        `Pictures of "${animal}" are switched off. Enabled animals: ${this.config.enabledAnimals.join(', ')}.`,
      );
    }
  }

  /** One of the enabled animals, picked at random. */
  private pickRandomAnimal(): Animal {
    const animals = this.config.enabledAnimals;
    // enabledAnimals is never empty (config.ts makes sure), so the "!" is safe.
    return animals[Math.floor(Math.random() * animals.length)]!;
  }
}

/** Strips the file contents from a picture, leaving only its details. */
function withoutImageData(picture: AnimalPicture): AnimalPictureDetails {
  const { imageData: _imageData, ...details } = picture;
  return details;
}

const NO_PICTURE_MESSAGE = 'No picture has been saved yet.';
