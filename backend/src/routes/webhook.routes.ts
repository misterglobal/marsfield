import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { createAssetForPrediction, createSupplementaryAssetForPrediction } from '../services/asset.service';
import { getPlan, getPlanByFreemiusPlanId, parseFreemiusDate, verifyFreemiusSignature } from '../services/freemius.service';
import { recordRiskSignal } from '../services/free-tier-risk.service';

const router = Router();
const prisma = new PrismaClient();
const REPLICATE_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function verifyReplicateWebhook(rawBody: Buffer, headers: Record<string, unknown>): boolean {
  const configuredSecret = process.env.REPLICATE_WEBHOOK_SIGNING_SECRET?.trim();
  if (!configuredSecret?.startsWith('whsec_')) return false;
  const webhookId = header(headers['webhook-id'] as string | string[] | undefined);
  const timestampValue = header(headers['webhook-timestamp'] as string | string[] | undefined);
  const signatureHeader = header(headers['webhook-signature'] as string | string[] | undefined);
  if (!webhookId || !timestampValue || !signatureHeader) return false;

  const timestamp = Number(timestampValue);
  if (!Number.isInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1_000) - timestamp) > REPLICATE_WEBHOOK_TOLERANCE_SECONDS) return false;

  let key: Buffer;
  try {
    key = Buffer.from(configuredSecret.slice('whsec_'.length), 'base64');
  } catch {
    return false;
  }
  if (key.length < 16) return false;
  const signedContent = `${webhookId}.${timestampValue}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', key).update(signedContent).digest();
  return signatureHeader.split(/\s+/).some((candidate) => {
    const [version, encoded] = candidate.split(',', 2);
    if (version !== 'v1' || !encoded) return false;
    try {
      const provided = Buffer.from(encoded, 'base64');
      return provided.length === expected.length && timingSafeEqual(provided, expected);
    } catch {
      return false;
    }
  });
}

function getString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function paymentCardFingerprint(event: any): string | undefined {
  return getString(
    event?.objects?.payment?.card?.fingerprint
    || event?.objects?.payment?.card_fingerprint
    || event?.payment?.card?.fingerprint
    || event?.payment?.card_fingerprint
    || event?.objects?.subscription?.card?.fingerprint,
  );
}

function getOutputUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return getOutputUrl(record.url || record.href);
  }
  return undefined;
}

function isCancellationEvent(type: string): boolean {
  return ['license.cancelled', 'license.expired', 'subscription.canceled', 'subscription.cancelled'].includes(type);
}

function shouldResetCredits(type: string): boolean {
  return ['license.created', 'license.plan.changed', 'payment.created', 'subscription.created', 'subscription.renewed'].includes(type);
}

// POST /api/v1/webhooks/replicate
router.post('/replicate', async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    if (!verifyReplicateWebhook(rawBody, req.headers)) {
      console.warn('Rejected Replicate webhook with missing or invalid signature');
      res.status(401).send('Invalid signature');
      return;
    }
    const { id, status, output, error } = JSON.parse(rawBody.toString('utf8'));
    if (!id || !status) {
       res.status(400).json({ error: 'Missing replicate event properties' });
       return;
    }

    const prediction = await prisma.prediction.findFirst({
      where: { replicatePredictionId: id },
    });

    if (!prediction) {
       res.status(404).json({ error: 'Associated prediction not found in database' });
       return;
    }

    // Replicate retries deliveries and may deliver them out of order. Never let
    // a late callback regress or replace an already-terminal prediction.
    if (['succeeded', 'failed'].includes(prediction.status)) {
      res.status(200).send('OK');
      return;
    }

    const finalStatus = status === 'succeeded' ? 'succeeded' : ['failed', 'canceled'].includes(status) ? 'failed' : 'processing';
    const outputUrl = getOutputUrl(Array.isArray(output) ? output[0] : output);

    const updatedPrediction = await prisma.prediction.update({
        where: { id: prediction.id },
        data: {
          status: finalStatus,
          outputUrl: outputUrl || null,
          errorMessage: error || null,
          completedAt: finalStatus === 'succeeded' || finalStatus === 'failed' ? new Date() : null,
        },
    });

    if (finalStatus === 'succeeded' && outputUrl) {
      await createAssetForPrediction(updatedPrediction, outputUrl);
      const transcriptUrl = Array.isArray(output) ? getOutputUrl(output[1]) : undefined;
      if (prediction.workflow === 'video-caption' && transcriptUrl) {
        await createSupplementaryAssetForPrediction(updatedPrediction, transcriptUrl, 'document');
      }
    }

    console.log(`Webhook Event processed for prediction ${prediction.id}. Status: ${finalStatus}`);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook routing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// POST /api/v1/webhooks/freemius
router.post('/freemius', async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    if (!verifyFreemiusSignature(rawBody, req.headers['x-signature'])) {
      console.warn('Rejected Freemius webhook with invalid signature');
      res.status(401).send('Invalid signature');
      return;
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    const eventType = getString(event.type) || 'unknown';
    const fsUser = event.objects?.user || event.user || {};
    const fsLicense = event.objects?.license || event.license || {};
    const fsEmail = getString(fsUser.email);
    const fsLicenseId = getString(fsLicense.id);
    const fsPlanId = getString(fsLicense.plan_id || fsLicense.planId);
    const fsPricingId = getString(fsLicense.pricing_id || fsLicense.pricingId);
    const fsUserId = getString(fsLicense.user_id || fsUser.id);
    const licenseType = getString(fsLicense.type);
    const expiration = parseFreemiusDate(fsLicense.expiration || fsLicense.expires || fsLicense.expiration_date);
    const licenseSaysCanceled = Boolean(fsLicense.is_canceled || fsLicense.isCancelled || fsLicense.cancelled);
    const isCanceled = licenseSaysCanceled || isCancellationEvent(eventType);
    const providerEventId = getString(event.id)
      || `${eventType}:${fsLicenseId || fsUserId || 'unknown'}:${createHash('sha256').update(rawBody).digest('hex')}`;
    const cardFingerprint = paymentCardFingerprint(event);

    const user = fsEmail
      ? await prisma.user.findUnique({ where: { email: fsEmail.toLowerCase() }, select: { id: true } })
      : null;

    if (!user || !fsLicenseId) {
      await prisma.billingEvent.upsert({
        where: { providerEventId },
        create: {
          userId: user?.id,
          providerEventId,
          eventType,
          payload: event,
        },
        update: {},
      });
      console.warn(`Stored Freemius event ${eventType}, but no matching Marsfield user/license was found`);
      res.status(200).send('OK');
      return;
    }

    const now = new Date();
    const entitlementIsActive = !isCanceled && (!expiration || expiration > now);
    const plan = entitlementIsActive ? getPlanByFreemiusPlanId(fsPlanId) || getPlan('free') : getPlan('free');
    const updateUserData = {
      plan: plan.tier,
      creditsLimit: plan.creditsLimit,
      storageLimitBytes: plan.storageLimitBytes,
      ...(shouldResetCredits(eventType) ? { creditsUsed: 0 } : {}),
    };

    const processed = await prisma.$transaction(async (tx) => {
      // Claim the provider event once. The grant and entitlement changes are in
      // the same transaction, so a failed attempt remains safe to retry.
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO billing_events (
          id, user_id, provider, provider_event_id, event_type, payload, created_at
        )
        VALUES (
          ${randomUUID()}, ${user.id}, 'freemius', ${providerEventId},
          ${eventType}, CAST(${JSON.stringify(event)} AS jsonb), NOW()
        )
        ON CONFLICT (provider_event_id) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              payload = EXCLUDED.payload
          WHERE billing_events.user_id IS NULL
        RETURNING id
      `;
      if (inserted.length === 0) return false;

      await tx.freemiusEntitlement.upsert({
        where: { fsLicenseId },
        create: {
          userId: user.id,
          fsLicenseId,
          fsPlanId,
          fsPricingId,
          fsUserId,
          type: licenseType,
          expiration,
          isCanceled,
        },
        update: {
          userId: user.id,
          fsPlanId,
          fsPricingId,
          fsUserId,
          type: licenseType,
          expiration,
          isCanceled,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: updateUserData,
      });
      await recordRiskSignal(user.id, 'card', cardFingerprint, tx);

      if (shouldResetCredits(eventType)) {
        await tx.usageEvent.create({
          data: {
            userId: user.id,
            eventType: 'billing_credit_grant',
            credits: plan.creditsLimit,
            metadata: {
              provider: 'freemius',
              provider_event_id: providerEventId,
              freemius_event_type: eventType,
              plan: plan.tier,
              license_id: fsLicenseId,
            },
          },
        });
      }
      return true;
    });

    if (!processed) {
      console.log(`Ignored duplicate Freemius event ${providerEventId}`);
      res.status(200).send('OK');
      return;
    }

    console.log(`Freemius event processed. Type: ${eventType}; User: ${user.id}; Plan: ${plan.tier}`);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Freemius webhook error:', error);
    res.status(500).json({ error: 'Freemius webhook processing failed' });
  }
});

export default router;
