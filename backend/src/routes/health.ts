import { Router } from 'express';
import { prisma } from '../db/prisma';
import { redisConnection } from '../queue/connection';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const checks = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redisConnection.ping(),
  ]);
  const healthy = checks.every((check) => check.status === 'fulfilled');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    dependencies: {
      postgres: checks[0]?.status === 'fulfilled' ? 'ok' : 'error',
      redis: checks[1]?.status === 'fulfilled' ? 'ok' : 'error',
    },
  });
});
