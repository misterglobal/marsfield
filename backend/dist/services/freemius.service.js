"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_CONFIG = void 0;
exports.serializePlan = serializePlan;
exports.getPlan = getPlan;
exports.getPlanByFreemiusPlanId = getPlanByFreemiusPlanId;
exports.buildFreemiusCheckoutUrl = buildFreemiusCheckoutUrl;
exports.verifyFreemiusSignature = verifyFreemiusSignature;
exports.parseFreemiusDate = parseFreemiusDate;
const crypto_1 = require("crypto");
const GB = 1024n * 1024n * 1024n;
function env(name) {
    const value = process.env[name];
    return value && value.trim() ? value.trim() : undefined;
}
function planEnv(prefix, suffix) {
    return env(`FREEMIUS_${prefix}_${suffix}`);
}
exports.PLAN_CONFIG = {
    free: {
        tier: 'free',
        name: 'Free',
        priceUsd: 0,
        creditsLimit: 15,
        storageLimitBytes: 1n * GB,
        retentionDays: 7,
    },
    starter: {
        tier: 'starter',
        name: 'Starter',
        priceUsd: 15,
        creditsLimit: 150,
        storageLimitBytes: 10n * GB,
        freemiusPlanId: planEnv('STARTER', 'PLAN_ID'),
        freemiusPricingId: planEnv('STARTER', 'PRICING_ID') || planEnv('STARTER', 'MONTHLY_PRICING_ID'),
    },
    creator: {
        tier: 'creator',
        name: 'Creator',
        priceUsd: 39,
        creditsLimit: 450,
        storageLimitBytes: 50n * GB,
        freemiusPlanId: planEnv('CREATOR', 'PLAN_ID'),
        freemiusPricingId: planEnv('CREATOR', 'PRICING_ID') || planEnv('CREATOR', 'MONTHLY_PRICING_ID'),
    },
    pro: {
        tier: 'pro',
        name: 'Pro',
        priceUsd: 99,
        creditsLimit: 1200,
        storageLimitBytes: 200n * GB,
        freemiusPlanId: planEnv('PRO', 'PLAN_ID'),
        freemiusPricingId: planEnv('PRO', 'PRICING_ID') || planEnv('PRO', 'MONTHLY_PRICING_ID'),
    },
    studio: {
        tier: 'studio',
        name: 'Studio',
        priceUsd: 249,
        creditsLimit: 3200,
        storageLimitBytes: 500n * GB,
        freemiusPlanId: planEnv('STUDIO', 'PLAN_ID'),
        freemiusPricingId: planEnv('STUDIO', 'PRICING_ID') || planEnv('STUDIO', 'MONTHLY_PRICING_ID'),
    },
};
function serializePlan(plan) {
    return {
        tier: plan.tier,
        name: plan.name,
        price_usd: plan.priceUsd,
        credits_limit: plan.creditsLimit,
        storage_limit_bytes: plan.storageLimitBytes.toString(),
        retention_days: plan.retentionDays,
        freemius_configured: Boolean(plan.freemiusPlanId),
    };
}
function getPlan(tier) {
    return exports.PLAN_CONFIG[tier?.toLowerCase() || 'free'] || exports.PLAN_CONFIG.free;
}
function getPlanByFreemiusPlanId(planId) {
    if (planId === undefined || planId === null)
        return undefined;
    const normalized = String(planId);
    return Object.values(exports.PLAN_CONFIG).find((plan) => plan.freemiusPlanId === normalized);
}
function buildFreemiusCheckoutUrl(input) {
    const productId = env('FREEMIUS_PRODUCT_ID');
    if (!productId)
        throw new Error('FREEMIUS_PRODUCT_ID is not configured');
    const plan = exports.PLAN_CONFIG[input.tier];
    if (!plan || plan.tier === 'free')
        throw new Error('Free plan does not require checkout');
    if (!plan.freemiusPlanId)
        throw new Error(`FREEMIUS_${input.tier.toUpperCase()}_PLAN_ID is not configured`);
    const params = new URLSearchParams({
        user_email: input.email,
        readonly_user: 'true',
        billing_cycle: 'monthly',
        external_id: input.userId,
    });
    if (plan.freemiusPricingId)
        params.set('pricing_id', plan.freemiusPricingId);
    if (input.successUrl)
        params.set('success_url', input.successUrl);
    if (input.cancelUrl)
        params.set('cancel_url', input.cancelUrl);
    return `https://checkout.freemius.com/product/${encodeURIComponent(productId)}/plan/${encodeURIComponent(plan.freemiusPlanId)}/?${params.toString()}`;
}
function verifyFreemiusSignature(rawBody, signature) {
    const productSecret = env('FREEMIUS_PRODUCT_SECRET_KEY');
    const provided = Array.isArray(signature) ? signature[0] : signature;
    if (!productSecret || !provided)
        return false;
    const expected = (0, crypto_1.createHmac)('sha256', productSecret).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(provided, 'hex');
    return expectedBuffer.length === providedBuffer.length && (0, crypto_1.timingSafeEqual)(expectedBuffer, providedBuffer);
}
function parseFreemiusDate(value) {
    if (!value || typeof value !== 'string')
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
