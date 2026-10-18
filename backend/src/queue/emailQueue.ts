import { Queue } from 'bullmq';
import { redisConnection } from './connection';

export const EMAIL_QUEUE = 'scheduled-emails';
export interface EmailJobData {
  emailId: string;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 8,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
    removeOnFail: { age: 30 * 24 * 60 * 60, count: 50_000 },
  },
});
