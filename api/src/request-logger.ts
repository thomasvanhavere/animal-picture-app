/**
 * request-logger.ts : writes one line to the log for every request
 *
 * Example line:   POST /api/pictures?animal=cat 201 (843 ms)
 *
 * This is a "middleware": a function Express runs for every request before
 * the actual handler. It notes the time, lets the request continue, and
 * writes the line once the answer has been sent.
 */
import type { NextFunction, Request, Response } from 'express';

/**
 * The middleware itself. app.ts registers it before the routes, because
 * Express runs them in order and a route that answers ends the chain.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    // originalUrl, not url: while a router mounted at /api/pictures handles
    // the request, Express cuts that part off req.url. originalUrl keeps the
    // full address, as the caller sent it.
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} (${durationMs} ms)`);
  });

  next();
}
