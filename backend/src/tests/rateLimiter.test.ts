import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimRateLimitNotification, reserveSendSlot } from '../services/rateLimiter';
import { redisConnection } from '../queue/connection';

vi.mock('../queue/connection', () => ({
  redisConnection: {
    eval: vi.fn(),
    set: vi.fn(),
  },
}));

describe('Redis-backed send slot reservations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps an atomic send slot reservation to a timestamp', async () => {
    vi.mocked(redisConnection.eval).mockResolvedValue([1_800_000_000_000, 1, ''] as never);
    await expect(reserveSendSlot('email-1', 'sender-1', 2_000, 200, 1_799_999_999_000)).resolves.toEqual({
      sendAt: 1_800_000_000_000,
      newlyReserved: true,
      rateLimitedWindow: null,
    });
  });

  it('returns the hour window that exceeded capacity', async () => {
    vi.mocked(redisConnection.eval).mockResolvedValue([1_800_003_600_000, 1, '1800000000000'] as never);
    await expect(reserveSendSlot('email-2', 'sender-1', 2_000, 1, 1_799_999_999_000)).resolves.toMatchObject({
      sendAt: 1_800_003_600_000,
      rateLimitedWindow: 1_800_000_000_000,
    });
  });

  it('only claims each notification once using Redis NX', async () => {
    vi.mocked(redisConnection.set).mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    await expect(claimRateLimitNotification('sender-1', 1_800_000_000_000)).resolves.toBe(true);
    await expect(claimRateLimitNotification('sender-1', 1_800_000_000_000)).resolves.toBe(false);
  });
});
