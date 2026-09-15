/**
 * app.ts : assembles the web application
 *
 * This file wires the pieces together: it creates the Express app, plugs in
 * the request logger, mounts the routers at their addresses, and adds the
 * error handling at the end.
 *
 * It deliberately does NOT connect to the database or start listening on a
 * port. It receives the things it needs (the picture service, a database
 * check) from the outside. main.ts passes in the real ones; the tests pass
 * in fakes. This is called "dependency injection", and it's what makes the
 * HTTP layer testable without a database.
 */
import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './errors/error-handler.js';
import { createHealthRouter, type DatabaseCheck } from './health/health.routes.js';
import { PictureController } from './pictures/picture.controller.js';
import { createPictureRouter } from './pictures/picture.routes.js';
import type { PictureService } from './pictures/picture.service.js';
import { requestLogger } from './request-logger.js';

/** The parts createApp is given, instead of creating them itself. */
export interface AppDependencies {
  pictureService: PictureService;
  checkDatabase: DatabaseCheck;
}

/** Builds the Express app around the given dependencies. */
export function createApp({ pictureService, checkDatabase }: AppDependencies): Express {
  const app = express();

  // Don't advertise which framework we use; it's nobody's business.
  app.disable('x-powered-by');

  app.use(requestLogger);

  // The endpoints. The order matters: Express tries them top to bottom.
  app.use('/health', createHealthRouter(checkDatabase));
  app.use('/api/pictures', createPictureRouter(new PictureController(pictureService)));

  // Anything that didn't match above doesn't exist.
  app.use(notFoundHandler);

  // Must be last: catches errors thrown by anything above.
  app.use(errorHandler);

  return app;
}
