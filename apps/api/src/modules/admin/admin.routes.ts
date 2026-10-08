import { dateQuerySchema } from '@courtly/shared';
import { Router } from 'express';
import type { AppDeps } from '../../app-deps.js';
import { requireRole } from '../../middleware/auth.js';
import { getDayView } from './admin.service.js';

export function adminRouter({ db }: AppDeps): Router {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/bookings', async (req, res) => {
    const { date } = dateQuerySchema.parse(req.query);
    res.json(await getDayView(db, date));
  });

  return router;
}
