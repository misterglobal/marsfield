import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest, requireScope } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

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

export default router;
