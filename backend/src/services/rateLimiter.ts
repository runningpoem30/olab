import { redisConnection } from '../queue/connection';

const RESERVE_SEND_SLOT = `
local existing = redis.call('GET', KEYS[1])
if existing then return { tonumber(existing), 0, '' } end
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local hourlyLimit = tonumber(ARGV[3])
local sender = ARGV[4]
local grantPrefix = ARGV[5]
local requestedAt = tonumber(ARGV[6])
local nextAt = tonumber(redis.call('GET', KEYS[2]) or now)
local assigned = math.max(now, nextAt, requestedAt)
local window = math.floor(assigned / 3600000) * 3600000
local countKey = grantPrefix .. ':hour:' .. sender .. ':' .. window
local count = tonumber(redis.call('GET', countKey) or '0')
local notificationWindow = ''
local limitedWindow = nil
while count >= hourlyLimit do
  if not limitedWindow then limitedWindow = window end
  window = window + 3600000
  assigned = math.max(assigned, window)
  countKey = grantPrefix .. ':hour:' .. sender .. ':' .. window
  count = tonumber(redis.call('GET', countKey) or '0')
end
if limitedWindow then notificationWindow = tostring(limitedWindow) end
redis.call('INCR', countKey)
redis.call('PEXPIRE', countKey, 172800000)
redis.call('SET', KEYS[2], assigned + interval, 'PX', 172800000)
redis.call('SET', KEYS[1], assigned, 'PX', 604800000)
return { assigned, 1, notificationWindow }
`;

export interface SendSlot {
  sendAt: number;
  newlyReserved: boolean;
  rateLimitedWindow: number | null;
}

export async function reserveSendSlot(emailId: string, senderId: string, intervalMs: number, hourlyLimit: number, requestedAt: number): Promise<SendSlot> {
  const result = await redisConnection.eval(
    RESERVE_SEND_SLOT,
    2,
    `email:slot:${emailId}`,
    `sender:next-slot:${senderId}`,
    Date.now(),
    intervalMs,
    hourlyLimit,
    senderId,
    'rate-limit',
    requestedAt,
  ) as [number, number, string];
  return {
    sendAt: Number(result[0]),
    newlyReserved: Number(result[1]) === 1,
    rateLimitedWindow: result[2] ? Number(result[2]) : null,
  };
}

export async function claimRateLimitNotification(senderId: string, windowStart: number): Promise<boolean> {
  const result = await redisConnection.set(
    `rate-notice:${senderId}:${windowStart}`,
    '1',
    'PX',
    48 * 60 * 60 * 1000,
    'NX',
  );
  return result === 'OK';
}
