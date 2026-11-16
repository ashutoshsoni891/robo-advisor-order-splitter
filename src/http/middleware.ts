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
