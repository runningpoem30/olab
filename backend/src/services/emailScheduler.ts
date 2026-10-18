import { Queue } from 'bullmq';
import { EmailJobData } from '../queue/emailQueue';

export async function enqueueScheduledEmail(queue: Queue<EmailJobData>, emailId: string, scheduledAt: Date): Promise<void> {
  await queue.add('send-email', { emailId }, {
    jobId: emailId,
    delay: Math.max(0, scheduledAt.getTime() - Date.now()),
  });
}
