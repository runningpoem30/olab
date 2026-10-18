import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { reserveSendSlot } from '../services/rateLimiter';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const describeRedis = process.env.RUN_REDIS_INTEGRATION === '1' ? describe : describe.skip;

afterAll(async () => { await redis.quit(); });

describeRedis('Redis integration: sender reservations and BullMQ persistence', () => {
  it('atomically orders sends and moves quota overflow into the next hour', async () => {
    const suffix = randomUUID();
    const senderId = `integration-${suffix}`;
    const hourlyLimit = 1;
    const intervalMs = 2_000;
    const now = Date.now();
    const first = await reserveSendSlot(`email-a-${suffix}`, senderId, intervalMs, hourlyLimit, now);
    const duplicate = await reserveSendSlot(`email-a-${suffix}`, senderId, intervalMs, hourlyLimit, now);
    const limited = await reserveSendSlot(`email-b-${suffix}`, senderId, intervalMs, hourlyLimit, now);

    expect(first.newlyReserved).toBe(true);
    expect(duplicate.newlyReserved).toBe(false);
    expect(duplicate.sendAt).toBe(first.sendAt);
    expect(limited.rateLimitedWindow).not.toBeNull();
    expect(limited.sendAt).toBeGreaterThanOrEqual(Math.floor(now / 3_600_000) * 3_600_000 + 3_600_000);

    await redis.del(`email:slot:email-a-${suffix}`, `email:slot:email-b-${suffix}`, `sender:next-slot:${senderId}`);
    const keys = await redis.keys(`rate-limit:hour:${senderId}:*`);
    if (keys.length > 0) await redis.del(...keys);
  });

  it('retains delayed jobs after closing and recreating a BullMQ Queue', async () => {
    const queueName = `integration-delay-${randomUUID()}`;
    const queueConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const queue = new Queue<{ emailId: string }>(queueName, { connection: queueConnection });
    const jobId = `persist-${randomUUID()}`;
    try {
      await queue.add('send-email', { emailId: 'email-durable' }, { jobId, delay: 60_000 });
      await queue.close();
      await queueConnection.quit();

      const reopenedConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
      const reopenedQueue = new Queue<{ emailId: string }>(queueName, { connection: reopenedConnection });
      try {
        const job = await reopenedQueue.getJob(jobId);
        expect(job?.data).toEqual({ emailId: 'email-durable' });
        expect(await job?.getState()).toBe('delayed');
      } finally {
        await reopenedQueue.obliterate({ force: true });
        await reopenedQueue.close();
        await reopenedConnection.quit();
      }
    } finally {
      await queue.close().catch(() => undefined);
      await queueConnection.quit().catch(() => undefined);
    }
  });
});
