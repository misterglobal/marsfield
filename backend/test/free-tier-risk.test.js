const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET ||= 'test-secret-with-more-than-thirty-two-characters';
const {
  assertGenerationPolicy,
  estimateCostMicros,
  GenerationGateError,
  hashRiskSignal,
} = require('../dist/services/free-tier-risk.service.js');

const verifiedFreeUser = {
  id: 'free-user', email: 'free@example.com', plan: 'free', creditsUsed: 0,
  creditsLimit: 15, emailVerifiedAt: new Date(), phoneVerifiedAt: null,
};

test('free policy requires verified email', () => {
  assert.throws(
    () => assertGenerationPolicy({ user: { ...verifiedFreeUser, emailVerifiedAt: null }, workflow: 'text-to-image', model: 'model', params: {}, credits: 1, variationCount: 1 }),
    (error) => error instanceof GenerationGateError && error.code === 'email_verification_required',
  );
});

test('free policy blocks expensive workflows and oversized jobs', () => {
  assert.throws(
    () => assertGenerationPolicy({ user: verifiedFreeUser, workflow: 'video-enhance', model: 'model', params: { duration: 5 }, credits: 1, variationCount: 1 }),
    (error) => error.code === 'paid_feature_required',
  );
  assert.throws(
    () => assertGenerationPolicy({ user: verifiedFreeUser, workflow: 'text-to-video', model: 'model', params: { duration: 5 }, credits: 6, variationCount: 1 }),
    (error) => error.code === 'trial_job_cost_limit',
  );
});

test('free policy caps duration and variations while paid jobs use the platform cap', () => {
  assert.throws(
    () => assertGenerationPolicy({ user: verifiedFreeUser, workflow: 'text-to-video', model: 'model', params: { duration: 11 }, credits: 3, variationCount: 1 }),
    (error) => error.code === 'trial_duration_limit',
  );
  assert.throws(
    () => assertGenerationPolicy({ user: verifiedFreeUser, workflow: 'text-to-image', model: 'model', params: {}, credits: 2, variationCount: 2 }),
    (error) => error.code === 'trial_variation_limit',
  );
  assert.doesNotThrow(() => assertGenerationPolicy({ user: { ...verifiedFreeUser, plan: 'starter' }, workflow: 'video-enhance', model: 'model', params: { duration: 60 }, credits: 100, variationCount: 2 }));
});

test('cost estimates and risk hashes are stable without retaining raw values', () => {
  assert.equal(estimateCostMicros(5), 160000n);
  assert.equal(hashRiskSignal('phone', '+14165551234'), hashRiskSignal('phone', '+14165551234'));
  assert.notEqual(hashRiskSignal('phone', '+14165551234'), hashRiskSignal('phone', '+14165550000'));
});
