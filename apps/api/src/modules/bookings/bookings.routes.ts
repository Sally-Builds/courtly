import { createBookingBodySchema, idParamSchema } from '@courtly/shared';
import { Router } from 'express';
import type { AppDeps } from '../../app-deps.js';
import { authOf } from '../../middleware/auth.js';
import { cancelBooking, createBooking, listMyBookings } from './bookings.service.js';

export function bookingsRouter({ db, clock }: AppDeps): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const body = createBookingBodySchema.parse(req.body);
    const booking = await createBooking(db, { userId: authOf(req).userId, body, now: clock.now() });
    res.status(201).json(booking);
  });

  router.get('/me', async (req, res) => {
    res.json(await listMyBookings(db, authOf(req).userId, clock.now()));
  });

  // POST rather than DELETE: cancelling is a state transition, the booking is kept as history.
  router.post('/:id/cancel', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(await cancelBooking(db, { bookingId: id, userId: authOf(req).userId, now: clock.now() }));
  });

  return router;
}
