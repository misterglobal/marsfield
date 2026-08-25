import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { Request } from 'express';

const prisma = new PrismaClient();

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com',
]);
const RISK_WEIGHTS: Record<string, number> = {
  card: 100,
  phone: 80,
  device: 60,
  content: 20,
  ip: 15,
  company_domain: 10,
};

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function csvEnv(name: string, fallback: string[]): Set<string> {
  const configured = process.env[name];
  return new Set((configured ? configured.split(',') : fallback).map((value) => value.trim()).filter(Boolean));
}

function signalPepper(): string {
  const pepper = process.env.RISK_SIGNAL_PEPPER || process.env.JWT_SECRET;
  if (!pepper && process.env.NODE_ENV === 'production') {
    throw new Error('RISK_SIGNAL_PEPPER is required in production');
  }
  return pepper || 'marsfield-development-risk-pepper';
}

export function hashRiskSignal(type: string, value: string): string {
  return createHash('sha256').update(`${signalPepper()}:${type}:${value.trim().toLowerCase()}`).digest('hex');
}

export function normalizePromptForRisk(prompt: unknown): string | undefined {
  if (typeof prompt !== 'string') return undefined;
  const normalized = prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized.length >= 20 ? normalized.slice(0, 4_000) : undefined;
}

export function companyDomain(email: string): string | undefined {
  const domain = email.trim().toLowerCase().split('@')[1];
  return domain && !PUBLIC_EMAIL_DOMAINS.has(domain) ? domain : undefined;
}

export function clientIp(req: Request): string | undefined {
  const value = req.ip || req.socket.remoteAddress;
  if (!value) return undefined;
  return value.replace(/^::ffff:/, '').trim().toLowerCase();
}

function deviceId(req: Request): string | undefined {
  const value = req.get('x-device-id') || (typeof req.body?.device_fingerprint === 'string' ? req.body.device_fingerprint : '');
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_-]{16,128}$/.test(normalized) ? normalized : undefined;
}

export async function recordRiskSignal(
  userId: string,
  type: 'card' | 'phone' | 'device' | 'content' | 'ip' | 'company_domain',
  rawValue: string | undefined,
  client: any = prisma,
): Promise<void> {
  if (!rawValue) return;
  const valueHash = hashRiskSignal(type, rawValue);
  const signal = await client.riskSignal.upsert({
    where: { type_valueHash: { type, valueHash } },
    create: { type, valueHash },
    update: { lastSeenAt: new Date() },
    select: { id: true },
  });
  await client.userRiskSignal.upsert({
    where: { userId_signalId: { userId, signalId: signal.id } },
    create: { userId, signalId: signal.id },
    update: { lastSeenAt: new Date() },
  });
}

export async function recordRegistrationSignals(userId: string, email: string, req: Request, client: any = prisma): Promise<void> {
  await recordRiskSignal(userId, 'ip', clientIp(req), client);
  await recordRiskSignal(userId, 'device', deviceId(req), client);
  await recordRiskSignal(userId, 'company_domain', companyDomain(email), client);
}

export async function recordGenerationSignals(userId: string, prompt: unknown, req: Request): Promise<void> {
  await Promise.all([
    recordRiskSignal(userId, 'ip', clientIp(req)),
    recordRiskSignal(userId, 'device', deviceId(req)),
    recordRiskSignal(userId, 'content', normalizePromptForRisk(prompt)),
  ]);
}

interface SharedSignalRow {
  type: string;
  signalId: string;
  otherAccounts: bigint;
}

export interface RiskContext {
  score: number;
  groupUserIds: string[];
  sharedSignalTypes: string[];
}

export async function getRiskContext(userId: string, client: any = prisma): Promise<RiskContext> {
  const shared: SharedSignalRow[] = await client.$queryRaw`
    SELECT rs.type,
           rs.id AS "signalId",
           COUNT(DISTINCT other.user_id)::bigint AS "otherAccounts"
      FROM user_risk_signals mine
      JOIN risk_signals rs ON rs.id = mine.signal_id
      JOIN user_risk_signals other ON other.signal_id = mine.signal_id AND other.user_id <> mine.user_id
     WHERE mine.user_id = ${userId}
     GROUP BY rs.type, rs.id
  `;

  const contentScore = shared.filter((row) => row.type === 'content').reduce((sum, row) => sum + Number(row.otherAccounts) * RISK_WEIGHTS.content, 0);
  const score = shared
    .filter((row) => row.type !== 'content')
    .reduce((sum, row) => sum + Number(row.otherAccounts) * (RISK_WEIGHTS[row.type] || 0), Math.min(40, contentScore));

  const grouped: Array<{ userId: string }> = await client.$queryRaw`
    WITH RECURSIVE related(user_id) AS (
      SELECT ${userId}::text
      UNION
      SELECT other.user_id
        FROM related current_account
        JOIN user_risk_signals mine ON mine.user_id = current_account.user_id
        JOIN risk_signals rs ON rs.id = mine.signal_id
        JOIN user_risk_signals other ON other.signal_id = mine.signal_id
       WHERE rs.type IN ('card', 'phone', 'device')
    )
    SELECT user_id AS "userId" FROM related
  `;
  const groupUserIds = [...new Set([userId, ...grouped.map((row) => row.userId)])].sort();
  return { score, groupUserIds, sharedSignalTypes: [...new Set(shared.map((row) => row.type))] };
}

export class GenerationGateError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface GateUser {
  id: string;
  email: string;
  plan: string;
  creditsUsed: number;
  creditsLimit: number;
  emailVerifiedAt?: Date | null;
  phoneVerifiedAt?: Date | null;
}

export interface GenerationGateInput {
  user: GateUser;
  req: Request;
  workflow: string;
  model: string;
  prompt?: unknown;
  params?: Record<string, unknown>;
  credits: number;
  variationCount: number;
}

export interface GenerationReservation {
  id: string;
  budgetDate: Date;
  estimatedCostMicros: bigint;
  credits: number;
  isFree: boolean;
}

function effectiveDuration(params: Record<string, unknown> | undefined): number | undefined {
  const candidate = params?.output_duration ?? params?.duration;
  if (candidate === undefined || candidate === null) return undefined;
  const duration = Number(candidate);
  if (duration === -1) return 15;
  return Number.isFinite(duration) ? duration : undefined;
}

export function assertGenerationPolicy(input: Omit<GenerationGateInput, 'req' | 'prompt'>): void {
  const isFree = input.user.plan.toLowerCase() === 'free';
  const duration = effectiveDuration(input.params);
  const platformMaxDuration = numberEnv('PLATFORM_MAX_GENERATION_DURATION_SECONDS', 180);
  if (duration !== undefined && duration > platformMaxDuration) {
    throw new GenerationGateError(`Generation duration is limited to ${platformMaxDuration} seconds`, 400, 'duration_limit');
  }
  if (!isFree) return;

  if (!input.user.emailVerifiedAt) {
    throw new GenerationGateError('Verify your email before using free generation credits.', 403, 'email_verification_required');
  }
  const blockedWorkflows = csvEnv('FREE_TRIAL_DISABLED_WORKFLOWS', ['influencer-video', 'character-replace', 'video-edit', 'video-enhance']);
  const blockedModels = csvEnv('FREE_TRIAL_DISABLED_MODELS', []);
  if (blockedWorkflows.has(input.workflow) || blockedModels.has(input.model)) {
    throw new GenerationGateError('This feature is available on paid plans.', 403, 'paid_feature_required');
  }
  const maxCredits = numberEnv('FREE_TRIAL_MAX_CREDITS_PER_JOB', 5);
  if (input.credits > maxCredits) {
    throw new GenerationGateError(`Free trial jobs are limited to ${maxCredits} credits.`, 403, 'trial_job_cost_limit');
  }
  const maxVariations = numberEnv('FREE_TRIAL_MAX_VARIATIONS', 1);
  if (input.variationCount > maxVariations) {
    throw new GenerationGateError(`Free trial jobs are limited to ${maxVariations} output at a time.`, 403, 'trial_variation_limit');
  }
  const freeMaxDuration = numberEnv('FREE_TRIAL_MAX_DURATION_SECONDS', 10);
  if (duration !== undefined && duration > freeMaxDuration) {
    throw new GenerationGateError(`Free trial generations are limited to ${freeMaxDuration} seconds.`, 403, 'trial_duration_limit');
  }
}

function dollarsToMicros(name: string, fallback: number): bigint {
  return BigInt(Math.round(numberEnv(name, fallback) * 1_000_000));
}

export function estimateCostMicros(credits: number): bigint {
  return BigInt(Math.ceil(credits * numberEnv('GENERATION_COST_PER_CREDIT_USD', 0.032) * 1_000_000));
}

function maxConcurrentJobs(plan: string): number {
  const defaults: Record<string, number> = { free: 1, starter: 3, creator: 5, pro: 10, studio: 20 };
  return Math.max(1, Math.floor(numberEnv(`MAX_CONCURRENT_JOBS_${plan.toUpperCase()}`, defaults[plan] || 2)));
}

function utcBudgetDate(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

async function reserveInTransaction(input: GenerationGateInput, risk: RiskContext): Promise<GenerationReservation> {
  const isFree = input.user.plan.toLowerCase() === 'free';
  const estimatedCostMicros = estimateCostMicros(input.credits);
  const freeBudgetMicros = dollarsToMicros('FREE_TIER_DAILY_BUDGET_USD', 25);
  const totalBudgetMicros = dollarsToMicros('PLATFORM_DAILY_SAFETY_BUDGET_USD', 500);
  const requestKey = randomUUID();
  const budgetDate = utcBudgetDate();
  const subjectIds = isFree ? risk.groupUserIds : [input.user.id];

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`generation:${subjectIds.join(':')}`}))`;

    const concurrencyRows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT (
        (SELECT COUNT(*) FROM predictions
          WHERE user_id IN (${Prisma.join(subjectIds)})
            AND status IN ('pending', 'processing', 'starting'))
        +
        (SELECT COUNT(*) FROM free_tier_reservations
          WHERE user_id IN (${Prisma.join(subjectIds)})
            AND status = 'reserved' AND expires_at > NOW())
      )::bigint AS count
    `;
    const activeJobs = Number(concurrencyRows[0]?.count || 0n);
    const concurrencyLimit = maxConcurrentJobs(isFree ? 'free' : input.user.plan.toLowerCase());
    if (activeJobs + input.variationCount > concurrencyLimit) {
      throw new GenerationGateError('Too many generation jobs are already running.', 429, 'concurrent_job_limit', {
        active_jobs: activeJobs,
        concurrent_job_limit: concurrencyLimit,
      });
    }

    if (isFree) {
      const lifetimeRows = await tx.$queryRaw<Array<{ used: bigint; limit: number }>>`
        SELECT COALESCE(SUM(free_credits_used_lifetime), 0)::bigint AS used,
               COALESCE(MIN(credits_limit), 0)::int AS limit
          FROM users
         WHERE id IN (${Prisma.join(subjectIds)})
      `;
      const groupUsed = Number(lifetimeRows[0]?.used || 0n);
      const groupLimit = Math.min(input.user.creditsLimit, lifetimeRows[0]?.limit || input.user.creditsLimit);
      if (groupUsed + input.credits > groupLimit) {
        throw new GenerationGateError('The free trial credit allowance has already been used by this account group.', 403, 'risk_group_quota_exceeded', {
          credits_required: input.credits,
          credits_remaining: Math.max(0, groupLimit - groupUsed),
        });
      }
      await tx.user.update({
        where: { id: input.user.id },
        data: { creditsUsed: { increment: input.credits }, freeCreditsUsedLifetime: { increment: input.credits } },
      });
    } else {
      const updated = await tx.$executeRaw`
        UPDATE users SET credits_used = credits_used + ${input.credits}
         WHERE id = ${input.user.id}
           AND credits_used + ${input.credits} <= credits_limit
      `;
      if (updated !== 1) {
        throw new GenerationGateError('Generation quota exceeded. Please upgrade plan.', 403, 'generation_quota_exceeded', {
          credits_required: input.credits,
          credits_remaining: Math.max(0, input.user.creditsLimit - input.user.creditsUsed),
        });
      }
    }

    const budgetRows = await tx.$queryRaw<Array<{ budgetDate: Date }>>`
      INSERT INTO platform_daily_budgets (budget_date, free_reserved_micros, total_reserved_micros, updated_at)
      SELECT ${budgetDate}, ${isFree ? estimatedCostMicros : 0n}, ${estimatedCostMicros}, NOW()
       WHERE ${estimatedCostMicros} <= ${totalBudgetMicros}
         AND (${!isFree} OR ${estimatedCostMicros} <= ${freeBudgetMicros})
      ON CONFLICT (budget_date) DO UPDATE SET
        free_reserved_micros = platform_daily_budgets.free_reserved_micros + ${isFree ? estimatedCostMicros : 0n},
        total_reserved_micros = platform_daily_budgets.total_reserved_micros + ${estimatedCostMicros},
        updated_at = NOW()
      WHERE platform_daily_budgets.total_reserved_micros + ${estimatedCostMicros} <= ${totalBudgetMicros}
        AND (${!isFree} OR platform_daily_budgets.free_reserved_micros + ${estimatedCostMicros} <= ${freeBudgetMicros})
      RETURNING budget_date AS "budgetDate"
    `;
    if (budgetRows.length !== 1) {
      throw new GenerationGateError(
        isFree ? 'Today\'s free generation budget has been reached. Free usage resumes at 00:00 UTC.' : 'The platform generation safety limit has been reached.',
        503,
        isFree ? 'free_daily_budget_exhausted' : 'platform_safety_budget_exhausted',
      );
    }

    const reservation = await tx.freeTierReservation.create({
      data: {
        requestKey,
        userId: input.user.id,
        budgetDate,
        estimatedCostMicros,
        isFree,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
      select: { id: true },
    });
    return { id: reservation.id, budgetDate, estimatedCostMicros, credits: input.credits, isFree };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reserveGeneration(input: GenerationGateInput): Promise<GenerationReservation> {
  assertGenerationPolicy(input);
  await recordGenerationSignals(input.user.id, input.prompt, input.req);
  const risk = await getRiskContext(input.user.id);
  const riskThreshold = numberEnv('FREE_TRIAL_PHONE_RISK_THRESHOLD', 50);
  if (input.user.plan.toLowerCase() === 'free' && risk.score >= riskThreshold && !input.user.phoneVerifiedAt) {
    throw new GenerationGateError('Additional phone verification is required for this free trial.', 403, 'phone_verification_required', {
      verification_path: '/api/v1/account/phone/start',
    });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await reserveInTransaction(input, risk);
    } catch (error) {
      if (error instanceof GenerationGateError) throw error;
      if ((error as { code?: string })?.code !== 'P2034' || attempt === 2) throw error;
    }
  }
  throw new Error('Could not reserve generation capacity');
}

export async function finalizeGenerationReservation(
  reservation: GenerationReservation,
  acceptedCredits: number,
): Promise<void> {
  const acceptedCostMicros = reservation.credits > 0
    ? (reservation.estimatedCostMicros * BigInt(Math.max(0, acceptedCredits))) / BigInt(reservation.credits)
    : 0n;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.freeTierReservation.updateMany({
      where: { id: reservation.id, status: 'reserved' },
      data: {
        status: acceptedCredits > 0 ? 'accepted' : 'released',
        acceptedCostMicros,
        finalizedAt: new Date(),
      },
    });
    if (claimed.count !== 1) return;
    const release = reservation.estimatedCostMicros - acceptedCostMicros;
    if (release > 0n) {
      await tx.platformDailyBudget.update({
        where: { budgetDate: reservation.budgetDate },
        data: {
          totalReservedMicros: { decrement: release },
          ...(reservation.isFree ? { freeReservedMicros: { decrement: release } } : {}),
        },
      });
    }
  });
}

export async function refundUnacceptedCredits(userId: string, isFree: boolean, credits: number): Promise<void> {
  if (credits <= 0) return;
  await prisma.user.update({
    where: { id: userId },
    data: {
      creditsUsed: { decrement: credits },
      ...(isFree ? { freeCreditsUsedLifetime: { decrement: credits } } : {}),
    },
  });
}

export async function initializeFreeTierRiskControls(): Promise<void> {
  // `prisma db push` adds the lifetime counter with zero for existing rows.
  // Preserve already-consumed free credits the first time the new schema boots.
  await prisma.$executeRaw`
    UPDATE users
       SET free_credits_used_lifetime = credits_used
     WHERE plan = 'free'
       AND free_credits_used_lifetime = 0
       AND credits_used > 0
  `;
}
