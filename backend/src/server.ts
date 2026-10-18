import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import passport from 'passport';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { emailQueue } from './queue/emailQueue';
import { redisConnection } from './queue/connection';
import { emailsRouter } from './routes/emails';
import { healthRouter } from './routes/health';
import { slackRouter } from './routes/slack';
import { authRouter } from './routes/auth';

const app = express();
const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath('/admin/queues');
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });

app.set('trust proxy', 1);
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  store: new RedisStore({ client: redisConnection, prefix: 'session:' }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
  if (req.path.startsWith('/auth/google')) { next(); return; }
  const token = req.get('x-csrf-token');
  const expected = req.session.csrfToken;
  if (!token || !expected) { res.status(403).json({ error: 'CSRF token required' }); return; }
  const supplied = Buffer.from(token);
  const stored = Buffer.from(expected);
  if (supplied.length !== stored.length || !timingSafeEqual(supplied, stored)) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }
  next();
});

passport.serializeUser((user, done) => done(null, (user as { id: string }).id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, avatarUrl: true } });
    done(null, user ?? false);
  } catch (error) {
    done(error);
  }
});

app.use('/api', healthRouter);
app.use('/auth', authRouter);
app.use('/auth/slack', slackRouter);
app.use('/auth/csrf', (req, res) => {
  req.session.csrfToken ??= randomBytes(32).toString('base64url');
  res.json({ token: req.session.csrfToken });
});
app.get('/auth/me', async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.session.csrfToken ??= randomBytes(32).toString('base64url');
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { id: true, name: true, email: true, avatarUrl: true } });
  if (!user) {
    req.session.destroy(() => undefined);
    res.status(401).json({ error: 'Session user no longer exists' });
    return;
  }
  res.json({ ...user, csrfToken: req.session.csrfToken, defaultSender: env.ETHEREAL_USER ?? null });
});
app.post('/auth/logout', (req, res, next) => {
  req.logout((error) => {
    if (error) return next(error);
    req.session.destroy((destroyError) => {
      if (destroyError) return next(destroyError);
      res.clearCookie('connect.sid');
      res.status(204).end();
    });
  });
});
app.use('/api/emails', emailsRouter);
app.use('/admin/queues', (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}, boardAdapter.getRouter());
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(env.PORT, () => console.info(`API listening on :${env.PORT}`));

async function shutdown(signal: string) {
  console.info(`${signal} received; shutting down API`);
  server.close(async () => {
    await Promise.allSettled([emailQueue.close(), prisma.$disconnect(), redisConnection.quit()]);
    process.exit(0);
  });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
