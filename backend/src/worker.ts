import { Worker, Job } from 'bullmq';

import { EmailStatus } from '@prisma/client';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { redisConnection } from './queue/connection';
import { EMAIL_QUEUE, EmailJobData, emailQueue } from './queue/emailQueue';
import { runOutboxDispatcher } from './services/outboxDispatcher';
import { reserveSendSlot, claimRateLimitNotification } from './services/rateLimiter';
import { notifyRateLimitReached } from './services/slack';
import { getSmtpTransport } from './services/smtp';
import { runSearchIndexer } from './services/searchIndexer';
import { ensureEmailIndex } from './services/emailSearch';

async function processEmail(job: Job<EmailJobData>): Promise<void> {
  const email = await prisma.email.findUnique({
    where: { id: job.data.emailId },
    include: { sender: true },
  });
  if (!email || email.status === EmailStatus.SENT || email.status === EmailStatus.FAILED) return;
  if (email.status === EmailStatus.SENDING && email.sendingLeaseUntil && email.sendingLeaseUntil > new Date()) {
    await emailQueue.add('send-email', { emailId: email.id }, {
      jobId: `lease-recovery-${email.id}-${job.id}-${email.sendingLeaseUntil.getTime()}`,
      delay: email.sendingLeaseUntil.getTime() - Date.now(),
    });
    return;
  }

  const hourlyLimit = email.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  const slot = await reserveSendSlot(email.id, email.senderId, Math.max(env.MIN_SEND_INTERVAL_MS, email.delayBetweenEmailsMs), hourlyLimit, email.scheduledAt.getTime());
  if (slot.rateLimitedWindow !== null && await claimRateLimitNotification(email.senderId, slot.rateLimitedWindow)) {
    try {
      await notifyRateLimitReached(email.senderId, slot.rateLimitedWindow);
    } catch (error) {
      console.error('Slack rate-limit notification failed', error);
    }
  }

  const waitMs = slot.sendAt - Date.now();
  if (waitMs > 0) {
    await emailQueue.add('send-email', { emailId: email.id }, {
      jobId: `rescheduled-${email.id}-${job.id}-${slot.sendAt}`,
      delay: waitMs,
    });
    return;
  }

  const leaseUntil = new Date(Date.now() + 5 * 60_000);
  const claimed = await prisma.email.updateMany({
    where: {
      id: email.id,
      OR: [
        { status: EmailStatus.SCHEDULED },
        { status: EmailStatus.SENDING, sendingLeaseUntil: { lte: new Date() } },
      ],
    },
    data: { status: EmailStatus.SENDING, sendingLeaseUntil: leaseUntil },
  });
  if (claimed.count === 0) return;

  try {
    await getSmtpTransport().sendMail({
      from: email.sender.address,
      to: email.recipient,
      subject: email.subject,
      text: email.body,
      headers: { 'X-ReachInbox-Email-ID': email.id },
    });
    const sent = await prisma.email.update({
      where: { id: email.id },
      data: { status: EmailStatus.SENT, sentAt: new Date(), failureReason: null, sendingLeaseUntil: null },
      include: { sender: { select: { address: true } } },
    });
    console.info('Email delivered via SMTP', { emailId: sent.id, sentAt: sent.sentAt });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const terminalFailure = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await prisma.email.update({
      where: { id: email.id },
      data: terminalFailure
        ? { status: EmailStatus.FAILED, failedAt: new Date(), failureReason: reason.slice(0, 4_000), sendingLeaseUntil: null }
        : { status: EmailStatus.SCHEDULED, failureReason: reason.slice(0, 4_000), sendingLeaseUntil: null },
    });
    throw error;
  }
}


const worker = new Worker<EmailJobData>(EMAIL_QUEUE, processEmail, {
  connection: redisConnection,
  concurrency: env.WORKER_CONCURRENCY,
  lockDuration: 60_000,
  stalledInterval: 30_000,
  maxStalledCount: 1,
});

worker.on('failed', (job, error) => console.error('Email job failed', { jobId: job?.id, attemptsMade: job?.attemptsMade, error }));
worker.on('error', (error) => console.error('BullMQ worker error', error));

let stopDispatcher: (() => void) | undefined;
let stopIndexer: (() => void) | undefined;
void runOutboxDispatcher(emailQueue).then((stop) => { stopDispatcher = stop; });
void ensureEmailIndex()
  .then(() => runSearchIndexer())
  .then((stop) => { stopIndexer = stop; })
  .catch((error) => console.error('Search indexer initialization failed', error));

async function shutdown(signal: string) {
  console.info(`${signal} received; shutting down worker`);
  stopDispatcher?.();
  stopIndexer?.();
  await Promise.allSettled([worker.close(), emailQueue.close(), prisma.$disconnect(), redisConnection.quit()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
