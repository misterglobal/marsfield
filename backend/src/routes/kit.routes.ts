import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

const kitInclude = {
  kitAssets: {
    include: {
      asset: {
        select: { id: true, url: true, thumbnailUrl: true, type: true, storageObjectId: true },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  projectAssignments: {
    include: { project: { select: { id: true, name: true } } },
  },
};

function stringArray(value: unknown, max: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, max)
    : [];
}

async function validateOwnedReferences(userId: string, assetIds: string[], projectIds: string[]) {
  const [assetCount, projectCount] = await Promise.all([
    prisma.asset.count({ where: { id: { in: assetIds }, userId, storageObjectId: { not: null } } }),
    prisma.project.count({ where: { id: { in: projectIds }, userId } }),
  ]);
  return assetCount === new Set(assetIds).size && projectCount === new Set(projectIds).size;
}

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return void res.status(401).json({ error: 'Unauthorized' });
  try {
    const kits = await prisma.brandKit.findMany({
      where: { userId: req.user.id },
      include: kitInclude,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(kits);
  } catch (error) {
    console.error('Fetch kits error:', error);
    res.status(500).json({ error: 'Failed retrieving character and brand kits' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return void res.status(401).json({ error: 'Unauthorized' });
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const kind = req.body.kind === 'character' ? 'character' : req.body.kind === 'brand' ? 'brand' : '';
    const assetIds = [...new Set(stringArray(req.body.asset_ids, 12))];
    const projectIds = [...new Set(stringArray(req.body.project_ids, 30))];
    if (!name || name.length > 120 || !kind) {
      res.status(400).json({ error: 'A name under 120 characters and a valid kit type are required' });
      return;
    }
    if (!(await validateOwnedReferences(req.user.id, assetIds, projectIds))) {
      res.status(404).json({ error: 'One or more assets or projects were not found' });
      return;
    }

    const kit = await prisma.brandKit.create({
      data: {
        userId: req.user.id,
        name,
        kind,
        description: typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 1000) || null : null,
        promptRules: typeof req.body.prompt_rules === 'string' ? req.body.prompt_rules.trim().slice(0, 3000) || null : null,
        voice: typeof req.body.voice === 'string' ? req.body.voice.trim().slice(0, 500) || null : null,
        colors: stringArray(req.body.colors, 12),
        fonts: stringArray(req.body.fonts, 8),
        kitAssets: { create: assetIds.map((assetId) => ({ assetId })) },
        projectAssignments: { create: projectIds.map((projectId) => ({ projectId })) },
      },
      include: kitInclude,
    });
    res.status(201).json(kit);
  } catch (error) {
    console.error('Create kit error:', error);
    res.status(500).json({ error: 'Failed creating kit' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return void res.status(401).json({ error: 'Unauthorized' });
  try {
    const current = await prisma.brandKit.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { id: true } });
    if (!current) return void res.status(404).json({ error: 'Kit not found' });
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const kind = req.body.kind === 'character' ? 'character' : req.body.kind === 'brand' ? 'brand' : '';
    const assetIds = [...new Set(stringArray(req.body.asset_ids, 12))];
    const projectIds = [...new Set(stringArray(req.body.project_ids, 30))];
    if (!name || name.length > 120 || !kind) return void res.status(400).json({ error: 'A valid name and kit type are required' });
    if (!(await validateOwnedReferences(req.user.id, assetIds, projectIds))) return void res.status(404).json({ error: 'One or more assets or projects were not found' });

    await prisma.$transaction(async (transaction) => {
      await transaction.brandKitAsset.deleteMany({ where: { brandKitId: current.id } });
      await transaction.projectKitAssignment.deleteMany({ where: { brandKitId: current.id } });
      await transaction.brandKit.update({
        where: { id: current.id },
        data: {
          name,
          kind,
          description: typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 1000) || null : null,
          promptRules: typeof req.body.prompt_rules === 'string' ? req.body.prompt_rules.trim().slice(0, 3000) || null : null,
          voice: typeof req.body.voice === 'string' ? req.body.voice.trim().slice(0, 500) || null : null,
          colors: stringArray(req.body.colors, 12),
          fonts: stringArray(req.body.fonts, 8),
          kitAssets: { create: assetIds.map((assetId) => ({ assetId })) },
          projectAssignments: { create: projectIds.map((projectId) => ({ projectId })) },
        },
      });
    });
    res.json(await prisma.brandKit.findUnique({ where: { id: current.id }, include: kitInclude }));
  } catch (error) {
    console.error('Update kit error:', error);
    res.status(500).json({ error: 'Failed updating kit' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return void res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await prisma.brandKit.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (!result.count) return void res.status(404).json({ error: 'Kit not found' });
    res.status(204).end();
  } catch (error) {
    console.error('Delete kit error:', error);
    res.status(500).json({ error: 'Failed deleting kit' });
  }
});

export default router;
