import { Router, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest, requireScope } from '../middleware/auth.middleware';
import { storageService } from '../services/storage.service';

const router = Router();
const prisma = new PrismaClient();

function isAssetDeleteEnabledForUser(email: string): boolean {
  if (process.env.ENABLE_ASSET_DELETE === 'true') return true;
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

// GET /api/v1/assets
router.get('/', authMiddleware, requireScope('assets:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
       res.status(401).json({ error: 'Unauthorized' });
       return;
    }

    const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : undefined;

    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: user.id },
        select: { id: true },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
    }

    // Older direct uploads predate Asset creation. Link them lazily so they
    // become reusable without copying or re-uploading the underlying object.
    const orphanedStorageObjects = await prisma.storageObject.findMany({
      where: {
        userId: user.id,
        asset: null,
        thumbnailForAsset: null,
        mimeType: { not: null },
      },
      select: { id: true, url: true, mimeType: true, byteSize: true },
    });
    if (orphanedStorageObjects.length) {
      await prisma.asset.createMany({
        data: orphanedStorageObjects.map((object) => ({
          userId: user.id,
          storageObjectId: object.id,
          url: object.url,
          type: object.mimeType?.startsWith('image/')
            ? 'image'
            : object.mimeType?.startsWith('video/')
              ? 'video'
              : 'audio',
          thumbnailUrl: object.mimeType?.startsWith('image/') ? object.url : null,
          fileSize: object.byteSize,
        })),
        skipDuplicates: true,
      });
    }

    const assets = await prisma.asset.findMany({
      where: {
        userId: user.id,
        ...(projectId ? { projectId } : {}),
      },
      include: {
        storageObject: {
          select: {
            provider: true,
            mimeType: true,
            byteSize: true,
          },
        },
        prediction: {
          select: {
            prompt: true,
            model: true,
            workflow: true,
            variationGroupId: true,
            variationIndex: true,
            variationCount: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(assets);
  } catch (error) {
    console.error('Fetch assets error:', error);
    res.status(500).json({ error: 'Failed retrieving assets library' });
  }
});

// POST /api/v1/assets/:id/favorite
router.post('/:id/favorite', authMiddleware, requireScope('assets:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
       res.status(401).json({ error: 'Unauthorized' });
       return;
    }

    const { id } = req.params;

    const asset = await prisma.asset.findFirst({
      where: { id, userId: user.id },
    });

    if (!asset) {
       res.status(404).json({ error: 'Asset not found' });
       return;
    }

    const updatedAsset = await prisma.asset.update({
      where: { id },
      data: { isFavorite: !asset.isFavorite },
    });

    res.json(updatedAsset);
  } catch (error) {
    console.error('Toggle favorite asset error:', error);
    res.status(500).json({ error: 'Failed toggling asset favorite state' });
  }
});

// DELETE /api/v1/assets/:id
//
// Hidden cleanup endpoint. There is intentionally no global Library delete
// button yet; this is for owner/admin cleanup through a direct API call.
router.delete('/:id', authMiddleware, requireScope('assets:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
       res.status(401).json({ error: 'Unauthorized' });
       return;
    }
    if (req.authType !== 'jwt') {
      res.status(403).json({ error: 'Asset deletion requires an interactive account session' });
      return;
    }
    if (!isAssetDeleteEnabledForUser(user.email)) {
      res.status(403).json({ error: 'Asset deletion is restricted' });
      return;
    }

    const { id } = req.params;
    const asset = await prisma.asset.findFirst({
      where: { id, userId: user.id },
      include: {
        storageObject: { select: { id: true, key: true, byteSize: true } },
        thumbnailStorageObject: { select: { id: true, key: true, byteSize: true } },
      },
    });

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    const storageObjects = [asset.storageObject, asset.thumbnailStorageObject]
      .filter((object): object is { id: string; key: string | null; byteSize: number | null } => Boolean(object));
    const storageBytes = storageObjects.reduce((total, object) => total + Math.max(0, object.byteSize || 0), 0);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.brandKitAsset.deleteMany({ where: { assetId: asset.id } });
      await tx.asset.delete({ where: { id: asset.id } });
      for (const object of storageObjects) {
        await tx.storageObject.delete({ where: { id: object.id } });
      }
      if (storageBytes > 0) {
        const account = await tx.user.findUnique({
          where: { id: user.id },
          select: { storageUsageBytes: true },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { storageUsageBytes: Math.max(0, (account?.storageUsageBytes || 0) - storageBytes) },
        });
      }
    });

    for (const object of storageObjects) {
      if (!object.key) continue;
      try {
        await storageService.deleteObject(object.key);
      } catch (error) {
        console.error(`Failed deleting storage object ${object.key} for asset ${asset.id}:`, error);
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({ error: 'Failed deleting asset' });
  }
});

export default router;
