import { NextFunction, Response } from 'express';
import Redis from 'ioredis';
import { AuthenticatedRequest } from './auth.middleware';

type RateLimitBucket = 'generation' | 'upload';

const WINDOW_SECONDS = 60;
const PLAN_LIMITS: Record<string, Record<RateLimitBucket, number>> = {
  free: { generation: 3, upload: 10 },
  starter: { generation: 10, upload: 30 },
  creator: { generation: 20, upload: 45 },
  pro: { generation: 40, upload: 60 },
  studio: { generation: 80, upload: 120 },
};

const redisUrl = process.env.REDIS_URL;
const redis = redisUrl
  ? new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 2_000),
    })
  : null;
redis?.on('error', () => undefined);
let warnedUnavailable = false;

const CONSUME_SCRIPT = `
local maximum = 0
local ttl = 0
for _, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then redis.call('EXPIRE', key, ARGV[1]) end
  local keyttl = redis.call('TTL', key)
  if count > maximum then maximum = count end
  if keyttl > ttl then ttl = keyttl end
end
return {maximum, ttl}
`;

function limitFor(plan: string | undefined, bucket: RateLimitBucket): number {
  return (PLAN_LIMITS[String(plan || 'free').toLowerCase()] || PLAN_LIMITS.free)[bucket];
}

async function consume(keys: string[]): Promise<{ count: number; ttl: number } | null> {
  if (!redis) return null;
  try {
    if (redis.status === 'wait') await redis.connect();
    if (redis.status !== 'ready') return null;
    const result = await redis.eval(CONSUME_SCRIPT, keys.length, ...keys, WINDOW_SECONDS) as [number, number];
    warnedUnavailable = false;
    return { count: Number(result[0]), ttl: Math.max(1, Number(result[1])) };
  } catch (error) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('Rate limiting unavailable; allowing requests until Redis recovers:', error instanceof Error ? error.message : error);
    }
    return null;
  }
}

export function rateLimit(bucket: RateLimitBucket) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const limit = limitFor(req.user.plan, bucket);
    const prefix = `marsfield:rate-limit:${bucket}`;
    const keys = [`${prefix}:account:${req.user.id}`];
    if (req.authType === 'api_key' && req.credentialId) {
      keys.push(`${prefix}:api-key:${req.credentialId}`);
    }
    const usage = await consume(keys);
    if (!usage) {
      next();
      return;
    }
    const remaining = Math.max(0, limit - usage.count);
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(usage.ttl));
    if (usage.count > limit) {
      res.setHeader('Retry-After', String(usage.ttl));
      res.status(429).json({
        error: `Too many ${bucket} requests. Try again in ${usage.ttl} seconds.`,
        retry_after_seconds: usage.ttl,
      });
      return;
    }
    next();
  };
}

export { PLAN_LIMITS, WINDOW_SECONDS };
