import { NextFunction, Request, Response } from 'express';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { clientIp } from '../services/free-tier-risk.service';
import { AuthenticatedRequest } from './auth.middleware';

type RateLimitBucket = 'generation' | 'upload' | 'quote' | 'feedback' | 'verification';

const WINDOW_SECONDS = 60;
const PLAN_LIMITS: Record<string, Record<RateLimitBucket, number>> = {
  free: { generation: 3, upload: 10, quote: 15, feedback: 3, verification: 3 },
  starter: { generation: 10, upload: 30, quote: 30, feedback: 5, verification: 3 },
  creator: { generation: 20, upload: 45, quote: 45, feedback: 8, verification: 3 },
  pro: { generation: 40, upload: 60, quote: 60, feedback: 10, verification: 3 },
  studio: { generation: 80, upload: 120, quote: 120, feedback: 15, verification: 3 },
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
const localBuckets = new Map<string, { count: number; expiresAt: number }>();

function consumeLocally(keys: string[], windowSeconds: number): { count: number; ttl: number } {
  const now = Date.now();
  const expiresAt = now + windowSeconds * 1_000;
  let maximum = 0;
  let latestExpiry = now;
  for (const key of keys) {
    const current = localBuckets.get(key);
    const bucket = !current || current.expiresAt <= now
      ? { count: 1, expiresAt }
      : { count: current.count + 1, expiresAt: current.expiresAt };
    localBuckets.set(key, bucket);
    maximum = Math.max(maximum, bucket.count);
    latestExpiry = Math.max(latestExpiry, bucket.expiresAt);
  }
  if (localBuckets.size > 10_000) {
    for (const [key, bucket] of localBuckets) {
      if (bucket.expiresAt <= now) localBuckets.delete(key);
    }
  }
  return { count: maximum, ttl: Math.max(1, Math.ceil((latestExpiry - now) / 1_000)) };
}

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

async function consume(keys: string[], windowSeconds = WINDOW_SECONDS): Promise<{ count: number; ttl: number } | null> {
  if (!redis) return process.env.NODE_ENV === 'production' ? null : consumeLocally(keys, windowSeconds);
  try {
    if (redis.status === 'wait') await redis.connect();
    if (redis.status !== 'ready') return process.env.NODE_ENV === 'production' ? null : consumeLocally(keys, windowSeconds);
    const result = await redis.eval(CONSUME_SCRIPT, keys.length, ...keys, windowSeconds) as [number, number];
    warnedUnavailable = false;
    return { count: Number(result[0]), ttl: Math.max(1, Number(result[1])) };
  } catch (error) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('Redis rate limiting unavailable:', error instanceof Error ? error.message : error);
    }
    return process.env.NODE_ENV === 'production' ? null : consumeLocally(keys, windowSeconds);
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
      res.setHeader('Retry-After', '30');
      res.status(503).json({ error: 'Request limiting is temporarily unavailable. Please try again later.' });
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

export function publicRateLimit(
  bucket: string,
  limit: number,
  identity?: (req: Request) => string | undefined,
  windowSeconds = WINDOW_SECONDS,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = clientIp(req) || 'unknown';
    const suppliedIdentity = identity?.(req);
    const digest = (value: string) => createHash('sha256').update(value).digest('hex');
    const prefix = `marsfield:rate-limit:public:${bucket}:${windowSeconds}`;
    const keys = [`${prefix}:ip:${digest(ip)}`];
    if (suppliedIdentity) keys.push(`${prefix}:identity:${digest(suppliedIdentity.trim().toLowerCase())}`);
    const usage = await consume(keys, windowSeconds);
    if (!usage) {
      res.setHeader('Retry-After', '30');
      res.status(503).json({ error: 'Request limiting is temporarily unavailable. Please try again later.' });
      return;
    }
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - usage.count)));
    res.setHeader('RateLimit-Reset', String(usage.ttl));
    if (usage.count > limit) {
      res.setHeader('Retry-After', String(usage.ttl));
      res.status(429).json({ error: 'Too many requests. Please try again later.', retry_after_seconds: usage.ttl });
      return;
    }
    next();
  };
}

export { PLAN_LIMITS, WINDOW_SECONDS };
