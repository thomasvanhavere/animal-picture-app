/**
 * picture.repository.ts : all database reads and writes for pictures
 *
 * A "repository" is the only place that talks to the database for a given
 * table. The rest of the app calls these plainly named methods and never
 * writes queries itself. That keeps the database details in one file, and
 * lets tests replace this class with a fake one.
 */
import type { DataSource, Repository } from 'typeorm';
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

/**
 * Newest first. Pictures saved in the same request share their creation
 * time, so the id (handed out in order) decides between those.
 */
const NEWEST_FIRST = { createdAt: 'DESC', id: 'DESC' } as const;

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
    // create() turns each plain object into an AnimalPicture, so save() knows
    // which table the rows belong to. Plain objects alone don't say that.
    return this.repository.manager.transaction((manager) =>
      manager.save(pictures.map((picture) => manager.create(AnimalPicture, picture))),
    );
  }

  /**
   * Finds the most recently saved picture, of any animal, including its file contents.
   * @returns The picture, or null if nothing has been saved yet.
   */
  async findLatest(): Promise<AnimalPicture | null> {
    return this.repository.findOne({
      // TypeORM's findOne() refuses to run without a "where", to prevent
      // accidental "any row" queries. Here any row is fine (the order picks
      // the newest), so an empty one is passed on purpose.
      where: {},
      order: NEWEST_FIRST,
    });
  }

  /** Like findLatest, but leaves the file contents out, which is much cheaper. */
  async findLatestDetails(): Promise<AnimalPictureDetails | null> {
    return this.repository.findOne({
      select: DETAIL_COLUMNS,
      // Empty on purpose, see findLatest.
      where: {},
      order: NEWEST_FIRST,
    });
  }

  /** Finds one picture by its id, including its file contents. Returns null if there is none. */
  async findById(id: number): Promise<AnimalPicture | null> {
    return this.repository.findOne({ where: { id } });
  }
}
