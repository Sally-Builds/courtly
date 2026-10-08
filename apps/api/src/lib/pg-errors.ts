export const PG_UNIQUE_VIOLATION = '23505';
export const PG_EXCLUSION_VIOLATION = '23P01';

interface PgErrorLike {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

/**
 * Drizzle wraps driver errors (DrizzleQueryError) and keeps the original `pg` error in `cause`,
 * so walk the cause chain to find the SQLSTATE.
 */
function findPgError(err: unknown): PgErrorLike | undefined {
  let current: unknown = err;
  for (let depth = 0; current && typeof current === 'object' && depth < 5; depth++) {
    const candidate = current as PgErrorLike;
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) return candidate;
    current = candidate.cause;
  }
  return undefined;
}

export function isPgError(err: unknown, code: string, constraint?: string): boolean {
  const pgErr = findPgError(err);
  if (!pgErr || pgErr.code !== code) return false;
  return constraint === undefined || pgErr.constraint === constraint;
}
