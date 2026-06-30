import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function maskApiKey(id: string): string {
  return `mf_live_${id.slice(0, 6)}...${id.slice(-4)}`;
}

// GET /api/v1/account/usage
router.get('/usage', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  } catch (error) {
    console.error('Fetch account usage error:', error);
    res.status(500).json({ error: 'Failed retrieving account usage' });
  }
});

// GET /api/v1/account/api-keys
router.get('/api-keys', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  } catch (error) {
    console.error('Fetch API keys error:', error);
    res.status(500).json({ error: 'Failed retrieving API keys' });
  }
});

// POST /api/v1/account/api-keys
router.post('/api-keys', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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

    const plainKey = `mf_live_${randomBytes(24).toString('hex')}`;
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
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed creating API key' });
  }
});

// DELETE /api/v1/account/api-keys/:id
router.delete('/api-keys/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Failed deleting API key' });
  }
});

export default router;
