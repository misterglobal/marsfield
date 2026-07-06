import { createHmac, timingSafeEqual } from 'crypto';

export type PlanTier = 'free' | 'starter' | 'creator' | 'pro' | 'studio';

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  priceUsd: number;
  creditsLimit: number;
  storageLimitBytes: bigint;
  retentionDays?: number;
  freemiusPlanId?: string;
  freemiusPricingId?: string;
}

const GB = 1024n * 1024n * 1024n;

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function planEnv(prefix: string, suffix: string): string | undefined {
  return env(`FREEMIUS_${prefix}_${suffix}`);
}

export const PLAN_CONFIG: Record<PlanTier, PlanConfig> = {
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

export function serializePlan(plan: PlanConfig) {
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

export function getPlan(tier: string | undefined | null): PlanConfig {
  return PLAN_CONFIG[(tier?.toLowerCase() as PlanTier) || 'free'] || PLAN_CONFIG.free;
}

export function getPlanByFreemiusPlanId(planId: string | number | undefined | null): PlanConfig | undefined {
  if (planId === undefined || planId === null) return undefined;
  const normalized = String(planId);
  return Object.values(PLAN_CONFIG).find((plan) => plan.freemiusPlanId === normalized);
}

export function buildFreemiusCheckoutUrl(input: {
  tier: PlanTier;
  email: string;
  userId: string;
  successUrl?: string;
  cancelUrl?: string;
}): string {
  const productId = env('FREEMIUS_PRODUCT_ID');
  if (!productId) throw new Error('FREEMIUS_PRODUCT_ID is not configured');

  const plan = PLAN_CONFIG[input.tier];
  if (!plan || plan.tier === 'free') throw new Error('Free plan does not require checkout');
  if (!plan.freemiusPlanId) throw new Error(`FREEMIUS_${input.tier.toUpperCase()}_PLAN_ID is not configured`);

  const params = new URLSearchParams({
    user_email: input.email,
    readonly_user: 'true',
    billing_cycle: 'monthly',
    external_id: input.userId,
  });

  if (plan.freemiusPricingId) params.set('pricing_id', plan.freemiusPricingId);
  if (input.successUrl) params.set('success_url', input.successUrl);
  if (input.cancelUrl) params.set('cancel_url', input.cancelUrl);

  return `https://checkout.freemius.com/product/${encodeURIComponent(productId)}/plan/${encodeURIComponent(plan.freemiusPlanId)}/?${params.toString()}`;
}

export function verifyFreemiusSignature(rawBody: Buffer, signature: string | string[] | undefined): boolean {
  const productSecret = env('FREEMIUS_PRODUCT_SECRET_KEY');
  const provided = Array.isArray(signature) ? signature[0] : signature;
  if (!productSecret || !provided) return false;

  const expected = createHmac('sha256', productSecret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(provided, 'hex');

  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export function parseFreemiusDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
