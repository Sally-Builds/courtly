import type { Role } from '@courtly/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { verifyToken, type AuthContext } from '../modules/auth/auth.service.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/** Requires a valid `Authorization: Bearer <jwt>` header and attaches `req.auth`. */
export function authenticate(jwtSecret: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header');
    }
    try {
      req.auth = verifyToken(token, jwtSecret);
    } catch {
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
    }
    next();
  };
}

/** Role check enforced server-side; the UI hiding admin links is only a convenience. */
export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (req.auth?.role !== role) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action');
    }
    next();
  };
}

/** Narrowing helper for handlers mounted behind `authenticate`. */
export function authOf(req: Request): AuthContext {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  return req.auth;
}
