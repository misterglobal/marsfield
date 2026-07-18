import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest, requireScope } from '../middleware/auth.middleware';
import { planStoryboard } from '../services/storyboard-planner.service';
import { createAssetFromBufferForPrediction } from '../services/asset.service';
import { normalizeTimelineClip, renderTimelineExport } from '../services/timeline-export.service';

const router = Router();
const prisma = new PrismaClient();

type TimelineExportRequestClip = {
  asset_id?: unknown;
  start_seconds?: unknown;
  end_seconds?: unknown;
};

// GET /api/v1/projects
router.get('/', authMiddleware, requireScope('projects:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: { assets: true, predictions: true, scenes: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(projects);
  } catch (error) {
    console.error('Fetch projects error:', error);
    res.status(500).json({ error: 'Failed retrieving projects' });
  }
});

// GET /api/v1/projects/:id
router.get('/:id', authMiddleware, requireScope('projects:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: user.id },
      include: {
        kitAssignments: {
          include: {
            brandKit: {
              include: {
                kitAssets: {
                  include: {
                    asset: {
                      select: { id: true, url: true, thumbnailUrl: true, type: true, storageObjectId: true },
                    },
                  },
                },
              },
            },
          },
        },
        scenes: {
          orderBy: { index: 'asc' },
          include: {
            predictions: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: {
                id: true,
                status: true,
                outputUrl: true,
                model: true,
                workflow: true,
                prompt: true,
                createdAt: true,
                assets: {
                  where: { type: 'video' },
                  take: 1,
                  select: {
                    id: true,
                    url: true,
                    type: true,
                    storageObjectId: true,
                    thumbnailUrl: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: { assets: true, predictions: true, scenes: true },
        },
      },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(project);
  } catch (error) {
    console.error('Fetch project error:', error);
    res.status(500).json({ error: 'Failed retrieving project' });
  }
});

// POST /api/v1/projects
router.post('/', authMiddleware, requireScope('projects:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;

    if (!name || name.length > 120) {
      res.status(400).json({ error: 'Project name is required and must be under 120 characters' });
      return;
    }

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name,
        description,
      },
    });

    res.status(201).json(project);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed creating project' });
  }
});

// POST /api/v1/projects/:id/storyboard-scenes
router.post('/:id/storyboard-scenes', authMiddleware, requireScope('projects:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: user.id },
      select: { id: true },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const index = Number(req.body.index);
    if (!Number.isInteger(index) || index < 0) {
      res.status(400).json({ error: 'Storyboard scene index must be a non-negative integer' });
      return;
    }

    const scene = await prisma.storyboardScene.upsert({
      where: {
        projectId_index: {
          projectId: project.id,
          index,
        },
      },
      create: {
        projectId: project.id,
        index,
        title: typeof req.body.title === 'string' ? req.body.title : null,
        prompt: typeof req.body.prompt === 'string' ? req.body.prompt : null,
        notes: typeof req.body.notes === 'string' ? req.body.notes : null,
        durationSeconds: Number.isInteger(req.body.duration_seconds) ? req.body.duration_seconds : null,
      },
      update: {
        title: typeof req.body.title === 'string' ? req.body.title : undefined,
        prompt: typeof req.body.prompt === 'string' ? req.body.prompt : undefined,
        notes: typeof req.body.notes === 'string' ? req.body.notes : undefined,
        durationSeconds: Number.isInteger(req.body.duration_seconds) ? req.body.duration_seconds : undefined,
      },
    });

    res.status(201).json(scene);
  } catch (error) {
    console.error('Upsert storyboard scene error:', error);
    res.status(500).json({ error: 'Failed saving storyboard scene' });
  }
});

// POST /api/v1/projects/:id/storyboard-plan
router.post('/:id/storyboard-plan', authMiddleware, requireScope('projects:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const script = typeof req.body.script === 'string' ? req.body.script.trim() : '';
    const sceneCount = Number(req.body.scene_count);
    const totalDurationSeconds = Number(req.body.total_duration_seconds);
    if (script.length < 20 || script.length > 20_000) {
      res.status(400).json({ error: 'Script must be between 20 and 20,000 characters' });
      return;
    }
    if (!Number.isInteger(sceneCount) || sceneCount < 2 || sceneCount > 20) {
      res.status(400).json({ error: 'Scene count must be between 2 and 20' });
      return;
    }
    if (!Number.isInteger(totalDurationSeconds) || totalDurationSeconds < sceneCount || totalDurationSeconds > 300) {
      res.status(400).json({ error: 'Total duration must fit the scene count and be no more than 300 seconds' });
      return;
    }

    const plan = planStoryboard(script, {
      sceneCount,
      totalDurationSeconds,
      visualStyle: typeof req.body.visual_style === 'string' ? req.body.visual_style : undefined,
      aspectRatio: typeof req.body.aspect_ratio === 'string' ? req.body.aspect_ratio : undefined,
      continuity: typeof req.body.continuity === 'string' ? req.body.continuity : undefined,
    });

    const existing = await prisma.storyboardScene.count({ where: { projectId: project.id } });
    if (existing > 0 && req.body.replace_existing !== true) {
      res.status(409).json({ error: 'This project already has scenes. Confirm replacement to create a new plan.' });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      if (existing > 0) {
        await transaction.prediction.updateMany({
          where: { projectId: project.id, storyboardSceneId: { not: null } },
          data: { storyboardSceneId: null },
        });
        await transaction.storyboardScene.deleteMany({ where: { projectId: project.id } });
      }
      await transaction.storyboardScene.createMany({
        data: plan.map((scene) => ({
          projectId: project.id,
          index: scene.index,
          title: scene.title,
          prompt: scene.prompt,
          notes: scene.notes,
          durationSeconds: scene.durationSeconds,
        })),
      });
    });

    const scenes = await prisma.storyboardScene.findMany({
      where: { projectId: project.id },
      orderBy: { index: 'asc' },
    });
    res.status(201).json({ scenes, credits_charged: 0 });
  } catch (error) {
    console.error('Create storyboard plan error:', error);
    res.status(500).json({ error: 'Failed creating storyboard plan' });
  }
});

// POST /api/v1/projects/:id/timeline-export
router.post('/:id/timeline-export', authMiddleware, requireScope('projects:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const requestedClips: TimelineExportRequestClip[] = Array.isArray(req.body.clips) ? req.body.clips : [];
    if (requestedClips.length < 1 || requestedClips.length > 20) {
      res.status(400).json({ error: 'Timeline export requires 1 to 20 clips' });
      return;
    }

    const assetIds = requestedClips.map((clip: TimelineExportRequestClip) => String(clip.asset_id || ''));
    if (assetIds.some((id: string) => !id)) {
      res.status(400).json({ error: 'Every timeline clip requires an asset_id' });
      return;
    }

    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds }, userId: user.id, type: 'video' },
      include: { storageObject: { select: { url: true, mimeType: true } } },
    });
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const clips = requestedClips.map((clip: TimelineExportRequestClip) => {
      const asset = assetsById.get(String(clip.asset_id || ''));
      if (!asset?.storageObject?.url || !asset.storageObject.mimeType?.startsWith('video/')) {
        throw new Error('Timeline contains a missing, unauthorized, or invalid video asset');
      }
      return normalizeTimelineClip({
        sourceUrl: asset.storageObject.url,
        startSeconds: clip.start_seconds,
        endSeconds: clip.end_seconds,
      });
    });

    const prediction = await prisma.prediction.create({
      data: {
        userId: user.id,
        projectId: project.id,
        workflow: 'timeline-export',
        model: 'local/ffmpeg-timeline',
        prompt: typeof req.body.title === 'string' && req.body.title.trim() ? req.body.title.trim().slice(0, 160) : 'Timeline export',
        inputParams: {
          clip_count: clips.length,
          clips: requestedClips.map((clip: TimelineExportRequestClip, index: number) => ({
            asset_id: String(clip.asset_id || ''),
            index,
            start_seconds: clips[index].startSeconds,
            end_seconds: clips[index].endSeconds ?? null,
          })),
          audio: 'disabled-v1',
        },
        variationIndex: 0,
        variationCount: 1,
        creditCost: 0,
        status: 'processing',
      },
    });

    try {
      const outputBuffer = await renderTimelineExport(clips);
      const asset = await createAssetFromBufferForPrediction(prediction, outputBuffer, {
        mimeType: 'video/mp4',
        assetType: 'video',
        originalName: 'timeline-export.mp4',
        metadata: { workflow: 'timeline-export', clipCount: String(clips.length) },
      });
      const completedPrediction = await prisma.prediction.update({
        where: { id: prediction.id },
        data: { status: 'succeeded', outputUrl: asset.url, completedAt: new Date() },
      });
      await prisma.usageEvent.create({
        data: {
          userId: user.id,
          predictionId: prediction.id,
          eventType: 'generation',
          credits: 0,
          metadata: { workflow: 'timeline-export', model: 'local/ffmpeg-timeline', clip_count: clips.length },
        },
      });
      res.status(201).json({
        id: completedPrediction.id,
        status: completedPrediction.status,
        output_url: completedPrediction.outputUrl,
        asset_id: asset.id,
        credits_charged: 0,
      });
    } catch (error) {
      await prisma.prediction.update({
        where: { id: prediction.id },
        data: { status: 'failed', errorMessage: error instanceof Error ? error.message : 'Timeline export failed', completedAt: new Date() },
      });
      throw error;
    }
  } catch (error) {
    console.error('Timeline export error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed exporting timeline' });
  }
});

export default router;
