import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSearchIndexer } from '../services/searchIndexer';
import { ensureEmailIndex } from '../services/emailSearch';

vi.mock('../db/prisma', () => ({
  prisma: {
    email: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
  },
}));

vi.mock('../services/emailSearch', () => ({
  ensureEmailIndex: vi.fn(),
  indexEmail: vi.fn(),
}));

afterEach(() => vi.useRealTimers());

describe('search indexer recovery', () => {
  it('retries index initialization after Elasticsearch is temporarily unavailable', async () => {
    vi.useFakeTimers();
    vi.mocked(ensureEmailIndex)
      .mockRejectedValueOnce(new Error('Elasticsearch unavailable'))
      .mockResolvedValue(undefined);

    const stop = await runSearchIndexer();
    expect(ensureEmailIndex).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(ensureEmailIndex).toHaveBeenCalledTimes(2);
    stop();
  });
});
