/**
 * health.routes.ts : the "are you alive?" endpoint
 *
 * GET /health answers whether the API is running and can reach its
 * database. Docker uses it to decide whether the container is healthy, and
 * it's a quick way for a person to check that everything is up.
 *
 * Answers:
 *   200 { "status": "ok",   "database": "up" }
 *   503 { "status": "degraded", "database": "down" }   (API up, database not)
 */
import { Router } from 'express';

/** A function that resolves if the database answers, and throws if it doesn't. */
export type DatabaseCheck = () => Promise<void>;

export function createHealthRouter(checkDatabase: DatabaseCheck): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ok', database: 'up' });
    } catch (error) {
      console.error('Health check: the database is not reachable:', error);
      // 503 "Service Unavailable" tells Docker (and anyone else) that the
      // service can't do its job right now.
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  return router;
}
