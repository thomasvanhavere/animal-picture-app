/**
 * picture.routes.ts : which web addresses lead to which controller methods
 *
 * This is the table of contents of the picture API. Each line pairs an HTTP
 * method and path with the controller method that handles it.
 *
 * The router is mounted at /api/pictures by app.ts, so the paths below are
 * relative to that.
 */
import { Router } from 'express';
import type { PictureController } from './picture.controller.js';

export function createPictureRouter(controller: PictureController): Router {
  const router = Router();

  // Download and save new pictures.
  router.post('/', controller.fetchAndSave);

  // The newest saved picture, as a file or as details.
  // These must come before "/:id", or Express would treat "latest" as an id.
  router.get('/latest', controller.getLatest);
  router.get('/latest/details', controller.getLatestDetails);

  // One specific picture, as a file.
  router.get('/:id', controller.getById);

  return router;
}
