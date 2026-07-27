"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const asset_service_1 = require("../services/asset.service");
const freemius_service_1 = require("../services/freemius.service");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
function getString(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    return String(value);
}
function getOutputUrl(value) {
    if (typeof value === 'string')
        return value;
    if (value && typeof value === 'object') {
        const record = value;
        return getOutputUrl(record.url || record.href);
    }
    return undefined;
}
function isCancellationEvent(type) {
    return ['license.cancelled', 'license.expired', 'subscription.canceled', 'subscription.cancelled'].includes(type);
}
function shouldResetCredits(type) {
    return ['license.created', 'license.plan.changed', 'payment.created', 'subscription.created', 'subscription.renewed'].includes(type);
}
// POST /api/v1/webhooks/replicate
router.post('/replicate', async (req, res) => {
    try {
        const { id, status, output, error } = req.body;
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
        const finalStatus = status === 'succeeded' ? 'succeeded' : status === 'failed' ? 'failed' : 'processing';
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
            await (0, asset_service_1.createAssetForPrediction)(updatedPrediction, outputUrl);
            const transcriptUrl = Array.isArray(output) ? getOutputUrl(output[1]) : undefined;
            if (prediction.workflow === 'video-caption' && transcriptUrl) {
                await (0, asset_service_1.createSupplementaryAssetForPrediction)(updatedPrediction, transcriptUrl, 'document');
            }
        }
        console.log(`Webhook Event processed for prediction ${prediction.id}. Status: ${finalStatus}`);
        res.status(200).send('OK');
    }
    catch (error) {
        console.error('Webhook routing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
// POST /api/v1/webhooks/freemius
router.post('/freemius', async (req, res) => {
    try {
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
        if (!(0, freemius_service_1.verifyFreemiusSignature)(rawBody, req.headers['x-signature'])) {
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
        const expiration = (0, freemius_service_1.parseFreemiusDate)(fsLicense.expiration || fsLicense.expires || fsLicense.expiration_date);
        const licenseSaysCanceled = Boolean(fsLicense.is_canceled || fsLicense.isCancelled || fsLicense.cancelled);
        const isCanceled = licenseSaysCanceled || isCancellationEvent(eventType);
        const providerEventId = getString(event.id)
            || `${eventType}:${fsLicenseId || fsUserId || 'unknown'}:${(0, crypto_1.createHash)('sha256').update(rawBody).digest('hex')}`;
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
        const plan = entitlementIsActive ? (0, freemius_service_1.getPlanByFreemiusPlanId)(fsPlanId) || (0, freemius_service_1.getPlan)('free') : (0, freemius_service_1.getPlan)('free');
        const updateUserData = {
            plan: plan.tier,
            creditsLimit: plan.creditsLimit,
            storageLimitBytes: plan.storageLimitBytes,
            ...(shouldResetCredits(eventType) ? { creditsUsed: 0 } : {}),
        };
        const processed = await prisma.$transaction(async (tx) => {
            // Claim the provider event once. The grant and entitlement changes are in
            // the same transaction, so a failed attempt remains safe to retry.
            const inserted = await tx.$queryRaw `
        INSERT INTO billing_events (
          id, user_id, provider, provider_event_id, event_type, payload, created_at
        )
        VALUES (
          ${(0, crypto_1.randomUUID)()}, ${user.id}, 'freemius', ${providerEventId},
          ${eventType}, CAST(${JSON.stringify(event)} AS jsonb), NOW()
        )
        ON CONFLICT (provider_event_id) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              payload = EXCLUDED.payload
          WHERE billing_events.user_id IS NULL
        RETURNING id
      `;
            if (inserted.length === 0)
                return false;
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
    }
    catch (error) {
        console.error('Freemius webhook error:', error);
        res.status(500).json({ error: 'Freemius webhook processing failed' });
    }
});
exports.default = router;
