import type { LoginBody, LoginResponse, PublicUser, Role } from '@courtly/shared';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import type { Db } from '../../db/client.js';
import { users, type UserRow } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';

const TOKEN_TTL = '8h';
// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export interface AuthContext {
  userId: string;
  role: Role;
}

export const hashPassword = (password: string, rounds = 10) => bcrypt.hash(password, rounds);

const toPublicUser = (u: UserRow): PublicUser => ({ id: u.id, email: u.email, name: u.name, role: u.role });

export async function login(db: Db, body: LoginBody, jwtSecret: string): Promise<LoginResponse> {
  const [user] = await db.select().from(users).where(eq(users.email, body.email));
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  return { token: signToken({ userId: user.id, role: user.role }, jwtSecret), user: toPublicUser(user) };
}

export async function getUser(db: Db, userId: string): Promise<PublicUser> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw notFound('User');
  return toPublicUser(user);
}

export const signToken = (ctx: AuthContext, secret: string) =>
  jwt.sign({ role: ctx.role }, secret, { subject: ctx.userId, expiresIn: TOKEN_TTL, algorithm: 'HS256' });

export function verifyToken(token: string, secret: string): AuthContext {
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (typeof payload === 'string' || !payload.sub || (payload.role !== 'user' && payload.role !== 'admin')) {
    throw new Error('Malformed token payload');
  }
  return { userId: payload.sub, role: payload.role };
}
