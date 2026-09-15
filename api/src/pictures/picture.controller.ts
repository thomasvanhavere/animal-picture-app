/**
 * picture.controller.ts : translates HTTP requests into service calls
 *
 * A "controller" sits between the web and the service. For each endpoint
 * it reads the request (query parameters, path), checks that the input
 * makes sense, calls the service, and turns the result into an HTTP answer.
 * It contains no business rules of its own.
 *
 * All endpoints answer with JSON, except the ones that return the picture
 * file itself; those send the raw bytes with the right content type, so a
 * browser shows the picture directly.
 */
import type { Request, Response } from 'express';
import { ALL_ANIMALS, isAnimal, RANDOM_ANIMAL, type Animal } from '../config/animals.js';
import type { AnimalPicture } from '../database/animal-picture.entity.js';
import { BadRequestError } from '../errors/http-error.js';
import type { AnimalPictureDetails } from './picture.repository.js';
import type { PictureService } from './picture.service.js';

/**
 * The handlers are arrow functions, not ordinary methods: picture.routes.ts
 * hands them to Express on their own (controller.fetchAndSave), and an
 * ordinary method would lose "this" that way.
 *
 * They simply "throw" when something is wrong: Express 5 passes errors from
 * async handlers on to error-handler.ts, which picks the status code.
 */
export class PictureController {
  constructor(private readonly service: PictureService) {}

  /**
   * POST /api/pictures?animal=cat&count=3
   * Downloads and saves new pictures. Both parameters are optional, and
   * animal may also be "random".
   */
  fetchAndSave = async (req: Request, res: Response): Promise<void> => {
    const animal = readAnimalParam(req);
    const count = readCountParam(req);

    const pictures = await this.service.fetchAndSave(animal, count);

    // 201 "Created" is the usual answer when a request made something new.
    res.status(201).json({
      count: pictures.length,
      pictures: pictures.map(toJson),
    });
  };

  /**
   * GET /api/pictures/latest
   * Sends the newest saved picture, of any animal, as a file.
   */
  getLatest = async (_req: Request, res: Response): Promise<void> => {
    sendPictureFile(res, await this.service.getLatest());
  };

  /**
   * GET /api/pictures/latest/details
   * Sends the newest saved picture's details as JSON, without the file.
   */
  getLatestDetails = async (_req: Request, res: Response): Promise<void> => {
    res.json(toJson(await this.service.getLatestDetails()));
  };

  /**
   * GET /api/pictures/:id
   * Sends one specific picture as a file.
   */
  getById = async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params['id'];
    if (typeof rawId !== 'string' || !/^\d+$/.test(rawId)) {
      throw new BadRequestError(`The picture id must be a whole number, but it is "${rawId}".`);
    }
    const picture = await this.service.getById(Number(rawId));
    sendPictureFile(res, picture);
  };
}

// ---------------------------------------------------------------------------
// Reading query parameters
//
// Express gives query parameters as text, and allows the same parameter to
// appear twice (?animal=cat&animal=dog), in which case it becomes a list.
// These helpers turn that into the one clean value the service expects.
// ---------------------------------------------------------------------------

/**
 * Takes the first value of a query parameter, trimmed, or undefined if it
 * isn't there. A blank value (?count=) counts as not there, so it gets the
 * default instead of an error.
 */
function readQueryParam(req: Request, name: string): string | undefined {
  const value = req.query[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.trim() !== '' ? first.trim() : undefined;
}

/** Reads ?animal=..., which must be a known animal or "random" if present. */
function readAnimalParam(req: Request): Animal | typeof RANDOM_ANIMAL | undefined {
  const raw = readQueryParam(req, 'animal');
  if (raw === undefined) {
    return undefined;
  }
  const animal = raw.toLowerCase();
  if (animal === RANDOM_ANIMAL) {
    return RANDOM_ANIMAL;
  }
  if (!isAnimal(animal)) {
    throw new BadRequestError(
      `"${raw}" is not a known animal. Choose one of: ${[...ALL_ANIMALS, RANDOM_ANIMAL].join(', ')}.`,
    );
  }
  return animal;
}

/** Reads ?count=..., which must be a whole number if present. Defaults to 1. */
function readCountParam(req: Request): number {
  const raw = readQueryParam(req, 'count');
  if (raw === undefined) {
    return 1;
  }
  if (!/^\d+$/.test(raw)) {
    throw new BadRequestError(`count must be a whole number, but it is "${raw}".`);
  }
  return Number(raw);
}

// ---------------------------------------------------------------------------
// Building answers
// ---------------------------------------------------------------------------

/** Sends a picture as a file, so a browser shows it directly. */
function sendPictureFile(res: Response, picture: AnimalPicture): void {
  res
    .status(200)
    .type(picture.contentType)
    .setHeader('Content-Length', picture.sizeBytes)
    .send(picture.imageData);
}

/** The JSON shape of a picture's details, as callers see it. */
function toJson(details: AnimalPictureDetails) {
  return {
    id: details.id,
    animal: details.animal,
    provider: details.provider,
    sourceUrl: details.sourceUrl,
    contentType: details.contentType,
    sizeBytes: details.sizeBytes,
    createdAt: details.createdAt.toISOString(),
    // Where to get the picture file itself.
    url: `/api/pictures/${details.id}`,
  };
}
