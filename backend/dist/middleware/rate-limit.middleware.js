"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WINDOW_SECONDS = exports.PLAN_LIMITS = void 0;
exports.rateLimit = rateLimit;
exports.publicRateLimit = publicRateLimit;
const crypto_1 = require("crypto");
const ioredis_1 = __importDefault(require("ioredis"));
const WINDOW_SECONDS = 60;
exports.WINDOW_SECONDS = WINDOW_SECONDS;
const PLAN_LIMITS = {
    free: { generation: 3, upload: 10, quote: 15, feedback: 3 },
    starter: { generation: 10, upload: 30, quote: 30, feedback: 5 },
    creator: { generation: 20, upload: 45, quote: 45, feedback: 8 },
    pro: { generation: 40, upload: 60, quote: 60, feedback: 10 },
    studio: { generation: 80, upload: 120, quote: 120, feedback: 15 },
};
exports.PLAN_LIMITS = PLAN_LIMITS;
const redisUrl = process.env.REDIS_URL;
const redis = redisUrl
    ? new ioredis_1.default(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => Math.min(times * 200, 2_000),
    })
    : null;
redis?.on('error', () => undefined);
let warnedUnavailable = false;
const localBuckets = new Map();
function consumeLocally(keys) {
    const now = Date.now();
    const expiresAt = now + WINDOW_SECONDS * 1_000;
    let maximum = 0;
    let latestExpiry = expiresAt;
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
            if (bucket.expiresAt <= now)
                localBuckets.delete(key);
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
function limitFor(plan, bucket) {
    return (PLAN_LIMITS[String(plan || 'free').toLowerCase()] || PLAN_LIMITS.free)[bucket];
}
async function consume(keys) {
    if (!redis)
        return consumeLocally(keys);
    try {
        if (redis.status === 'wait')
            await redis.connect();
        if (redis.status !== 'ready')
            return consumeLocally(keys);
        const result = await redis.eval(CONSUME_SCRIPT, keys.length, ...keys, WINDOW_SECONDS);
        warnedUnavailable = false;
        return { count: Number(result[0]), ttl: Math.max(1, Number(result[1])) };
    }
    catch (error) {
        if (!warnedUnavailable) {
            warnedUnavailable = true;
            console.warn('Redis rate limiting unavailable; using the per-process fallback until Redis recovers:', error instanceof Error ? error.message : error);
        }
        return consumeLocally(keys);
    }
}
function rateLimit(bucket) {
    return async (req, res, next) => {
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
function publicRateLimit(bucket, limit, identity) {
    return async (req, res, next) => {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim() || req.ip || 'unknown';
        const suppliedIdentity = identity?.(req);
        const digest = (value) => (0, crypto_1.createHash)('sha256').update(value).digest('hex');
        const prefix = `marsfield:rate-limit:public:${bucket}`;
        const keys = [`${prefix}:ip:${digest(ip)}`];
        if (suppliedIdentity)
            keys.push(`${prefix}:identity:${digest(suppliedIdentity.toLowerCase())}`);
        const usage = await consume(keys);
        if (!usage) {
            next();
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
