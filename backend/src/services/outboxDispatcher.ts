import { Queue } from 'bullmq';
import { prisma } from '../db/prisma';
import { EmailJobData } from '../queue/emailQueue';
import { enqueueScheduledEmail } from './emailScheduler';

const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 1_000;

export async function dispatchPendingOutbox(queue: Queue<EmailJobData>): Promise<number> {
  const entries = await prisma.queueOutbox.findMany({
    where: { enqueuedAt: null, availableAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true, emailId: true, email: { select: { scheduledAt: true } } },
  });

  let enqueued = 0;
  for (const entry of entries) {
    try {
      // Stable IDs plus BullMQ's atomic add make a retry safe if the process dies before DB ack.
      await enqueueScheduledEmail(queue, entry.emailId, entry.email.scheduledAt);
      await prisma.queueOutbox.updateMany({
        where: { id: entry.id, enqueuedAt: null },
        data: { enqueuedAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
      enqueued += 1;
    } catch (error) {
      await prisma.queueOutbox.update({
        where: { id: entry.id },
        data: { attempts: { increment: 1 }, lastError: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return enqueued;
}

export async function runOutboxDispatcher(queue: Queue<EmailJobData>): Promise<() => void> {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await dispatchPendingOutbox(queue);
    } catch (error) {
      console.error('Queue outbox dispatch failed', error);
    } finally {
      running = false;
    }
  };
  await tick();
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
