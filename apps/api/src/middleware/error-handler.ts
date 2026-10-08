import type { ApiErrorBody } from '@courtly/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req) => {
  throw new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
};

/** Single place that turns any thrown error into the `{ error: { code, message, details? } }` shape. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
  } else if (isBodyParserError(err)) {
    status = 400;
    body = { error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' } };
  } else {
    console.error('[api] unhandled error', err);
  }

  res.status(status).json(body);
};

const isBodyParserError = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { type?: unknown }).type === 'entity.parse.failed';
