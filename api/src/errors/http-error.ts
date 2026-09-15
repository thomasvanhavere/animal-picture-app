/**
 * http-error.ts : an error that knows which HTTP status code it deserves
 *
 * When something goes wrong while handling a request, the code throws one of
 * these. The central error handler (error-handler.ts) catches it and sends
 * the right status code and message to the caller.
 *
 * Plain errors (bugs, database failures) are NOT HttpErrors. They become a
 * generic "500 Internal Server Error", and their details are only written
 * to the log, so that internal information never leaks to the outside.
 */
export class HttpError extends Error {
  constructor(
    /** The HTTP status code to answer with, for example 400 or 404. */
    public readonly status: number,
    /** A message that is safe to show to the caller. */
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 400: the caller sent something we can't work with (bad animal, bad count, ...). */
export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = 'BadRequestError';
  }
}

/** 404: the thing that was asked for doesn't exist (no picture saved yet, ...). */
export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

/** 502: an outside service (a picture website) failed or answered with nonsense. */
export class BadGatewayError extends HttpError {
  constructor(message: string) {
    super(502, message);
    this.name = 'BadGatewayError';
  }
}
