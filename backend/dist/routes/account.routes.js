"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const auth_middleware_1 = require("../middleware/auth.middleware");
const freemius_service_1 = require("../services/freemius.service");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const BILLABLE_TIERS = new Set(['starter', 'creator', 'pro', 'studio']);
function hashApiKey(key) {
    return (0, crypto_1.createHash)('sha256').update(key).digest('hex');
}
function maskApiKey(id) {
    return `mf_live_${id.slice(0, 6)}...${id.slice(-4)}`;
}
// GET /api/v1/account/usage
router.get('/usage', auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const [freshUser, recentUsage, counts] = await Promise.all([
            prisma.user.findUnique({
                where: { id: user.id },
                select: {
                    plan: true,
                    creditsUsed: true,
                    creditsLimit: true,
                    storageUsageBytes: true,
                    storageLimitBytes: true,
                },
            }),
            prisma.usageEvent.findMany({
                where: { userId: user.id },
                orderBy: { createdAt: 'desc' },
                take: 25,
                include: {
                    prediction: {
                        select: {
                            id: true,
                            workflow: true,
                            model: true,
                            prompt: true,
                            variationCount: true,
                            createdAt: true,
                        },
                    },
                },
            }),
            prisma.$transaction([
                prisma.project.count({ where: { userId: user.id } }),
                prisma.asset.count({ where: { userId: user.id } }),
                prisma.asset.count({ where: { userId: user.id, storageObjectId: { not: null } } }),
            ]),
        ]);
        if (!freshUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            plan: freshUser.plan,
            credits_used: freshUser.creditsUsed,
            credits_limit: freshUser.creditsLimit,
            credits_remaining: Math.max(0, freshUser.creditsLimit - freshUser.creditsUsed),
            storage_usage_bytes: freshUser.storageUsageBytes,
            storage_limit_bytes: freshUser.storageLimitBytes.toString(),
            storage_remaining_bytes: (freshUser.storageLimitBytes - BigInt(freshUser.storageUsageBytes)).toString(),
            project_count: counts[0],
            asset_count: counts[1],
            durable_asset_count: counts[2],
            recent_usage: recentUsage.map((event) => ({
                id: event.id,
                event_type: event.eventType,
                credits: event.credits,
                metadata: event.metadata,
                created_at: event.createdAt,
                prediction: event.prediction,
            })),
        });
    }
    catch (error) {
        console.error('Fetch account usage error:', error);
        res.status(500).json({ error: 'Failed retrieving account usage' });
    }
});
// GET /api/v1/account/plans
router.get('/plans', auth_middleware_1.authMiddleware, async (_req, res) => {
    res.json(Object.values(freemius_service_1.PLAN_CONFIG).map(freemius_service_1.serializePlan));
});
// POST /api/v1/account/billing/checkout
router.post('/billing/checkout', auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (req.authType !== 'jwt') {
            res.status(403).json({ error: 'Checkout must be started from an authenticated browser session' });
            return;
        }
        const tier = String(req.body.tier || '').toLowerCase();
        if (!BILLABLE_TIERS.has(tier)) {
            res.status(400).json({ error: 'Choose a paid plan: starter, creator, pro, or studio' });
            return;
        }
        const appUrl = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
        const url = (0, freemius_service_1.buildFreemiusCheckoutUrl)({
            tier,
            email: user.email,
            userId: user.id,
            successUrl: process.env.FREEMIUS_SUCCESS_URL || `${appUrl}/settings?billing=success`,
            cancelUrl: process.env.FREEMIUS_CANCEL_URL || `${appUrl}/settings?billing=cancelled`,
        });
        const plan = (0, freemius_service_1.getPlan)(tier);
        res.json({
            checkout_url: url,
            plan: (0, freemius_service_1.serializePlan)(plan),
        });
    }
    catch (error) {
        console.error('Create Freemius checkout error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed creating checkout link' });
    }
});
// GET /api/v1/account/api-keys
router.get('/api-keys', auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const keys = await prisma.apiKey.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                lastUsedAt: true,
                createdAt: true,
            },
        });
        res.json(keys.map((key) => ({
            id: key.id,
            name: key.name,
            key: maskApiKey(key.id),
            last_used_at: key.lastUsedAt,
            created_at: key.createdAt,
        })));
    }
    catch (error) {
        console.error('Fetch API keys error:', error);
        res.status(500).json({ error: 'Failed retrieving API keys' });
    }
});
// POST /api/v1/account/api-keys
router.post('/api-keys', auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (req.authType !== 'jwt') {
            res.status(403).json({ error: 'API keys can only be managed from an authenticated browser session' });
            return;
        }
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        if (!name || name.length > 80) {
            res.status(400).json({ error: 'API key name is required and must be under 80 characters' });
            return;
        }
        const plainKey = `mf_live_${(0, crypto_1.randomBytes)(24).toString('hex')}`;
        const created = await prisma.apiKey.create({
            data: {
                userId: user.id,
                name,
                key: hashApiKey(plainKey),
            },
            select: {
                id: true,
                name: true,
                createdAt: true,
            },
        });
        res.status(201).json({
            id: created.id,
            name: created.name,
            key: plainKey,
            created_at: created.createdAt,
        });
    }
    catch (error) {
        console.error('Create API key error:', error);
        res.status(500).json({ error: 'Failed creating API key' });
    }
});
// DELETE /api/v1/account/api-keys/:id
router.delete('/api-keys/:id', auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (req.authType !== 'jwt') {
            res.status(403).json({ error: 'API keys can only be managed from an authenticated browser session' });
            return;
        }
        const existing = await prisma.apiKey.findFirst({
            where: { id: req.params.id, userId: user.id },
            select: { id: true },
        });
        if (!existing) {
            res.status(404).json({ error: 'API key not found' });
            return;
        }
        await prisma.apiKey.delete({ where: { id: existing.id } });
        res.status(204).send();
    }
    catch (error) {
        console.error('Delete API key error:', error);
        res.status(500).json({ error: 'Failed deleting API key' });
    }
});
exports.default = router;
