/**
 * picture.repository.ts : all database reads and writes for pictures
 *
 * A "repository" is the only place that talks to the database for a given
 * table. The rest of the app calls these plainly named methods and never
 * writes queries itself. That keeps the database details in one file, and
 * lets tests replace this class with a fake one.
 */
import type { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import type { Animal } from '../config/animals.js';
import { AnimalPicture } from '../database/animal-picture.entity.js';

/**
 * A picture without its file contents: everything a caller may want to know
 * about a picture, minus the (large) bytes.
 */
export type AnimalPictureDetails = Omit<AnimalPicture, 'imageData'>;

/** The columns that make up AnimalPictureDetails, i.e. everything except image_data. */
const DETAIL_COLUMNS = {
  id: true,
  animal: true,
  provider: true,
  sourceUrl: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
} as const;

export class PictureRepository {
  private readonly repository: Repository<AnimalPicture>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(AnimalPicture);
  }

  /**
   * Saves new pictures and returns them with their database-assigned ids and
   * timestamps, in the same order.
   *
   * All pictures are saved in one transaction: either every picture is
   * saved, or (if anything goes wrong) none of them are.
   */
  async saveAll(pictures: Omit<AnimalPicture, 'id' | 'createdAt'>[]): Promise<AnimalPicture[]> {
    return this.repository.manager.transaction((manager) =>
      manager.save(pictures.map((picture) => manager.create(AnimalPicture, picture))),
    );
  }

  /**
   * Finds the most recently saved picture, including its file contents.
   *
   * @param animal  Limit the search to one animal. Leave out to search all animals.
   * @returns The picture, or null if nothing has been saved yet.
   */
  async findLatest(animal?: Animal): Promise<AnimalPicture | null> {
    return this.repository.findOne({
      where: whereAnimal(animal),
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  /** Like findLatest, but leaves the file contents out, which is much cheaper. */
  async findLatestDetails(animal?: Animal): Promise<AnimalPictureDetails | null> {
    return this.repository.findOne({
      select: DETAIL_COLUMNS,
      where: whereAnimal(animal),
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  /** Finds one picture by its id, including its file contents. Returns null if there is none. */
  async findById(id: number): Promise<AnimalPicture | null> {
    return this.repository.findOne({ where: { id } });
  }

  /** Counts the saved pictures, for one animal or for all of them. */
  async count(animal?: Animal): Promise<number> {
    return this.repository.count({ where: whereAnimal(animal) });
  }
}

/** Builds the "where" part of a query: filter on the animal if one is given, otherwise no filter. */
function whereAnimal(animal?: Animal): FindOptionsWhere<AnimalPicture> {
  return animal ? { animal } : {};
}
