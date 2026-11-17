import { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, validationError } from '../errors';

/** Logs "METHOD path status - X.XX ms" for every request once the response is sent. */
export const responseTimer =
  (log: (line: string) => void = console.log): RequestHandler =>
  (req, res, next) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
      log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${elapsedMs.toFixed(2)} ms`);
    });

    next();
  };

/**
 * Rejects requests that carry a body that is not JSON with 415.
 * Without this, express.json() skips the body and the caller would get a
 * confusing "validation failed" error instead.
 */
export const requireJsonBody: RequestHandler = (req, _res, next) => {
  // An empty body has no type to check; the validation step reports what is missing.
  if (req.headers['content-length'] === '0') return next();

  // req.is() returns null when there is no body, false when the type doesn't match
  if (req.is('json') === false) {
    return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
  }
  next();
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `route ${req.method} ${req.path} not found`));
};

/** Turns any error into the same JSON shape: { error: { code, message, details? } }. */
export const errorHandler =
  (logError: (...args: unknown[]) => void = console.error): ErrorRequestHandler =>
  (err, _req, res, next) => {
    if (res.headersSent) return next(err);

    const apiError = toAppError(err);
    if (apiError.status >= 500) logError(err);

    res.status(apiError.status).json({
      error: { code: apiError.code, message: apiError.message, details: apiError.details },
    });
  };

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return validationError('request validation failed', details);
  }

  // body-parser errors (malformed JSON, payload too large) carry a status and a type
  const parserError = err as { type?: string; status?: number };
  if (parserError?.type === 'entity.parse.failed') {
    return validationError('request body is not valid JSON');
  }
  if (parserError?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'request body is too large');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'something went wrong');
}
