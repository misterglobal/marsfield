const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET ||= 'test-secret-with-more-than-thirty-two-characters';
process.env.REDIS_URL = '';
process.env.NODE_ENV = 'test';
const { publicRateLimit } = require('../dist/middleware/rate-limit.middleware');
const { isDisposableEmail } = require('../dist/services/signup-policy.service');
const { assertTrialEscalation } = require('../dist/services/free-tier-risk.service');

function response() {
  return { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k] = v; }, status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; } };
}

test('changing forwarded headers cannot evade the resolved IP limit', async () => {
  const limit = publicRateLimit('spoof-test', 2, undefined, 3600);
  let allowed = 0;
  for (let i = 0; i < 3; i++) {
    const res = response();
    await limit({ ip: '192.0.2.1', headers: { 'x-forwarded-for': `198.51.100.${i}` } }, res, () => allowed++);
    if (i === 2) { assert.equal(res.statusCode, 429); assert.ok(Number(res.headers['Retry-After']) > 3500); }
  }
  assert.equal(allowed, 2);
});

test('production fails closed without shared Redis', async () => {
  process.env.NODE_ENV = 'production';
  try {
    const res = response();
    await publicRateLimit('outage-test', 5)({ ip: '192.0.2.2' }, res, () => assert.fail('must not continue'));
    assert.equal(res.statusCode, 503);
  } finally { process.env.NODE_ENV = 'test'; }
});

test('disposable domains include subdomains without blocking lookalike permanent domains', () => {
  assert.equal(isDisposableEmail('Bot@MAILINATOR.com'), true);
  assert.equal(isDisposableEmail('bot@sub.airhemp.com'), true);
  assert.equal(isDisposableEmail('person@gmail.com'), false);
  assert.equal(isDisposableEmail('person@notmailinator.com'), false);
});

test('trial escalation checks cumulative spend and accepts verified phones', () => {
  process.env.FREE_TRIAL_EMAIL_CREDITS = '5';
  assert.doesNotThrow(() => assertTrialEscalation(4, 1, false));
  assert.throws(() => assertTrialEscalation(4, 2, false), { code: 'phone_verification_required' });
  assert.throws(() => assertTrialEscalation(10, 1, false), { code: 'phone_verification_required' });
  assert.doesNotThrow(() => assertTrialEscalation(5, 5, true));
});


test('hour and day counters persist independently', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const hour = publicRateLimit('window-test', 1, undefined, 3600);
    const day = publicRateLimit('window-test', 1, undefined, 86400);
    const req = { ip: '192.0.2.30' };
    await hour(req, response(), () => {});
    await day(req, response(), () => {});
    now += 3601 * 1000;
    let allowed = false;
    await hour(req, response(), () => { allowed = true; });
    assert.equal(allowed, true);
    const res = response();
    await day(req, res, () => assert.fail('daily bucket must remain exhausted'));
    assert.equal(res.statusCode, 429);
  } finally { Date.now = originalNow; }
});
