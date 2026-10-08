import {
  courtListQuerySchema,
  createCourtBodySchema,
  dateQuerySchema,
  idParamSchema,
  updateCourtBodySchema,
} from '@courtly/shared';
import { Router } from 'express';
import type { AppDeps } from '../../app-deps.js';
import { authOf, requireRole } from '../../middleware/auth.js';
import { notFound } from '../../lib/errors.js';
import { createCourt, getAvailability, getCourt, listCourts, updateCourt } from './courts.service.js';

export function courtsRouter({ db, clock }: AppDeps): Router {
  const router = Router();

  // Inactive courts are only visible to admins (who manage them); users see what they can book.
  router.get('/', async (req, res) => {
    const { includeInactive } = courtListQuerySchema.parse(req.query);
    const isAdmin = authOf(req).role === 'admin';
    res.json(await listCourts(db, { includeInactive: isAdmin && includeInactive }));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const court = await getCourt(db, id);
    if (!court.isActive && authOf(req).role !== 'admin') throw notFound('Court');
    res.json(court);
  });

  router.get('/:id/availability', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { date } = dateQuerySchema.parse(req.query);
    res.json(await getAvailability(db, id, date, clock.now()));
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    const body = createCourtBodySchema.parse(req.body);
    res.status(201).json(await createCourt(db, body));
  });

  router.patch('/:id', requireRole('admin'), async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const patch = updateCourtBodySchema.parse(req.body);
    res.json(await updateCourt(db, id, patch));
  });

  return router;
}
