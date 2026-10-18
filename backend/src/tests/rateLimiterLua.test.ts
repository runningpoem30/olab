import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rateLimiterSource = readFileSync(resolve(__dirname, '../services/rateLimiter.ts'), 'utf8');
const lua = rateLimiterSource.match(/const RESERVE_SEND_SLOT = `([\s\S]*?)`;/)?.[1] ?? '';

describe('Redis send slot Lua invariants', () => {
  it('returns an existing reservation without incrementing sender counters again', () => {
    const existingCheck = lua.indexOf("if existing then return { tonumber(existing), 0, '' } end");
    const increment = lua.indexOf("redis.call('INCR', countKey)");
    expect(existingCheck).toBeGreaterThanOrEqual(0);
    expect(existingCheck).toBeLessThan(increment);
  });

  it('reserves hourly quota and spacing atomically in Redis', () => {
    expect(lua).toContain("redis.call('INCR', countKey)");
    expect(lua).toContain("redis.call('SET', KEYS[2], assigned + interval, 'PX', 172800000)");
    expect(lua).toContain('local assigned = math.max(now, nextAt, requestedAt)');
    expect(lua).toContain('while count >= hourlyLimit do');
    expect(lua).toContain("redis.call('SET', KEYS[1], assigned, 'PX', 604800000)");
  });
});
