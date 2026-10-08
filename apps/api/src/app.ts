import express, { type Express } from 'express';
import type { AppDeps } from './app-deps.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { bookingsRouter } from './modules/bookings/bookings.routes.js';
import { courtsRouter } from './modules/courts/courts.routes.js';

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const requireAuth = authenticate(deps.jwtSecret);
  app.use('/api/auth', authRouter(deps));
  app.use('/api/courts', requireAuth, courtsRouter(deps));
  app.use('/api/bookings', requireAuth, bookingsRouter(deps));
  app.use('/api/admin', requireAuth, adminRouter(deps));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
