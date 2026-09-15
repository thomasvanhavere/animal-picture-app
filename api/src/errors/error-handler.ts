/**
 * error-handler.ts : turns errors into HTTP answers
 *
 * Express lets us register one function that receives every error thrown
 * while handling a request. This is it. Having one place for this means the
 * controllers can simply "throw" and don't each need their own try/catch.
 *
 * Every error answer has the same JSON shape, so callers (and the web page)
 * can always read it the same way:
 *
 *   { "error": "Not Found", "message": "No cat picture has been saved yet." }
 */
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './http-error.js';

/** Human-readable names for the status codes we use. */
const STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
};

/**
 * The error handler itself. Express recognises it as one because it takes
 * four parameters; the last one is required even though it isn't used.
 */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    // An error we threw on purpose: the status and message are meant for the caller.
    res.status(error.status).json({
      error: STATUS_NAMES[error.status] ?? 'Error',
      message: error.message,
    });
    return;
  }

  // Anything else is unexpected. Log the full details for us, but give the
  // caller only a generic message.
  console.error('Unexpected error while handling a request:', error);
  res.status(500).json({
    error: STATUS_NAMES[500],
    message: 'Something went wrong on the server. Please try again later.',
  });
}

/** Answers requests for addresses that don't exist, in the same JSON shape. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: STATUS_NAMES[404],
    message: `There is nothing at ${req.method} ${req.path}.`,
  });
}
