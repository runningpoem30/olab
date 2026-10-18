import { describe, expect, it, vi } from 'vitest';
import { Queue } from 'bullmq';
import { enqueueScheduledEmail } from '../services/emailScheduler';

const queue = { add: vi.fn().mockResolvedValue(undefined) } as unknown as Queue<{ emailId: string }>;

describe('BullMQ email scheduling', () => {
  it('uses a deterministic BullMQ job id and future delay', async () => {
    const now = Date.now();
    await enqueueScheduledEmail(queue, 'email-123', new Date(now + 60_000));
    expect(queue.add).toHaveBeenCalledWith('send-email', { emailId: 'email-123' }, expect.objectContaining({
      jobId: 'email-123',
      delay: expect.any(Number),
    }));
    const delay = vi.mocked(queue.add).mock.calls[0]?.[2]?.delay;
    expect(delay).toBeGreaterThan(59_000);
    expect(delay).toBeLessThanOrEqual(60_000);
  });
});
