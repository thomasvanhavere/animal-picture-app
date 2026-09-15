/**
 * application.ts : builds the complete API from the settings and a database
 *
 * This connects the real pieces together, from the bottom up: repository,
 * downloader, service, and finally the Express app.
 *
 * It lives in its own file (instead of inside main.ts) so the integration
 * tests can build exactly the same app that runs in production, just with a
 * test database and a fake picture service. main.ts only adds what a
 * running server needs on top: connecting, listening and shutting down.
 */
import type { Express } from 'express';
import type { DataSource } from 'typeorm';
import { createApp } from './app.js';
import type { Config } from './config/config.js';
import { PictureDownloader } from './pictures/picture-downloader.js';
import { PictureRepository } from './pictures/picture.repository.js';
import { PictureService } from './pictures/picture.service.js';

/**
 * Builds the app. The data source must already be connected (initialized),
 * and its migrations applied.
 */
export function createApplication(config: Config, dataSource: DataSource): Express {
  const repository = new PictureRepository(dataSource);
  const downloader = new PictureDownloader(config);
  const pictureService = new PictureService(config, downloader, repository);

  return createApp({
    pictureService,
    // The health check runs the simplest possible query to see if the database answers.
    checkDatabase: async () => {
      await dataSource.query('SELECT 1');
    },
  });
}
