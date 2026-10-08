import { loginBodySchema } from '@courtly/shared';
import { Router } from 'express';
import type { AppDeps } from '../../app-deps.js';
import { authOf, authenticate } from '../../middleware/auth.js';
import { getUser, login } from './auth.service.js';

export function authRouter({ db, jwtSecret }: AppDeps): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const body = loginBodySchema.parse(req.body);
    res.json(await login(db, body, jwtSecret));
  });

  router.get('/me', authenticate(jwtSecret), async (req, res) => {
    res.json(await getUser(db, authOf(req).userId));
  });

  return router;
}
