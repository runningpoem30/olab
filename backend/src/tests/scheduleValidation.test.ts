import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const requestSchema = z.object({
  sender: z.string().email(),
  subject: z.string().trim().min(1).max(998),
  body: z.string().min(1).max(100_000),
  recipients: z.array(z.string().email()).min(1).max(10_000),
  startAt: z.string().datetime({ offset: true }),
  delayBetweenEmailsMs: z.number().int().min(0).max(86_400_000).default(2_000),
  hourlyLimit: z.number().int().positive().max(100_000).optional(),
  idempotencyKey: z.string().min(8).max(200),
});

describe('schedule request validation', () => {
  it('accepts valid requests and supplies the default pacing delay', () => {
    const result = requestSchema.parse({
      sender: 'sender@example.com', subject: 'Hello', body: 'Hi there',
      recipients: ['one@example.com'], startAt: '2030-01-01T12:00:00.000Z',
      idempotencyKey: 'request-key-123',
    });
    expect(result.delayBetweenEmailsMs).toBe(2_000);
  });

  it('rejects malformed addresses and a missing idempotency key', () => {
    expect(requestSchema.safeParse({ sender: 'invalid', recipients: ['invalid'] }).success).toBe(false);
  });

  it('bounds batches before they can become unbounded database transactions', () => {
    expect(requestSchema.safeParse({
      sender: 'sender@example.com', subject: 'Hi', body: 'Body',
      recipients: Array.from({ length: 10_001 }, (_, index) => `person${index}@example.com`),
      startAt: '2030-01-01T12:00:00.000Z', idempotencyKey: 'request-key-123',
    }).success).toBe(false);
  });
});
