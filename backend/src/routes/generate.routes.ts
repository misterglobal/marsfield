import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { ReplicateService } from '../services/replicate.service';
import { queueService } from '../services/queue.service';

const router = Router();
const prisma = new PrismaClient();
const replicateService = new ReplicateService();
const SEEDANCE_MODELS = new Set([
  'bytedance/seedance-2.0',
  'bytedance/seedance-2.0-fast',
  'bytedance/seedance-2.0-mini',
]);

function decodeFileInput(value: unknown, maximumBytes: number): string | Blob {
  if (typeof value !== 'string') {
    throw new Error('Reference inputs must be URLs or data URIs');
  }

  if (!value.startsWith('data:')) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error();
      }
      return value;
    } catch {
      throw new Error('Reference inputs must use an HTTP(S) URL or data URI');
    }
  }

  const match = value.match(/^data:([\w/+.-]+);base64,(.+)$/s);
  if (!match) {
    throw new Error('Invalid reference file data');
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength > maximumBytes) {
    throw new Error(`Reference file exceeds the ${maximumBytes / 1024 / 1024}MB limit`);
  }
  return new Blob([buffer], { type: match[1] });
}

function decodeFileList(
  value: unknown,
  maximum: number,
  maximumBytes: number,
  label: string
): Array<string | Blob> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} accepts at most ${maximum} files`);
  }
  return value.map((item) => decodeFileInput(item, maximumBytes));
}

// POST /api/v1/generate
router.post('/generate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
       res.status(401).json({ error: 'Unauthorized' });
       return;
    }

    // Check credits
    if (user.creditsUsed >= user.creditsLimit) {
       res.status(403).json({ error: 'Generation quota exceeded. Please upgrade plan.' });
       return;
    }

    const { workflow, model, prompt, params } = req.body;
    
    // Input validation
    if (!workflow || !model) {
       res.status(400).json({ error: 'workflow and model parameters are required' });
       return;
    }

    // Validate workflow
    const validWorkflows = ['text-to-video', 'image-to-video', 'lip-sync', 'text-to-image', 'multi-image-video', 'multimodal-video'];
    if (!validWorkflows.includes(workflow)) {
       res.status(400).json({ error: 'Invalid workflow type' });
       return;
    }

    // Validate prompt length (prevent abuse)
    if (prompt && prompt.length > 2000) {
       res.status(400).json({ error: 'Prompt exceeds maximum length of 2000 characters' });
       return;
    }

    // Validate model string (prevent injection)
    if (!/^[\w\-\.\/]+$/.test(model)) {
       res.status(400).json({ error: 'Invalid model identifier' });
       return;
    }

    const isSeedance = SEEDANCE_MODELS.has(model);
    if (workflow === 'multimodal-video' && !isSeedance) {
      res.status(400).json({ error: 'The multimodal-video workflow requires a Seedance 2.0 model' });
      return;
    }

    let predictionInput;
    try {
      if (isSeedance) {
        const duration = params?.duration ?? 5;
        const validAspectRatios = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'];
        const validResolutions = model === 'bytedance/seedance-2.0-mini'
          ? ['480p', '720p']
          : ['480p', '720p', '1080p'];

        if (!Number.isInteger(duration) || duration < -1 || duration > 15 || duration === 0) {
          throw new Error('Seedance duration must be -1 or an integer from 1 to 15');
        }
        if (!validAspectRatios.includes(params?.aspect_ratio || '16:9')) {
          throw new Error('Invalid Seedance aspect ratio');
        }
        if (!validResolutions.includes(params?.resolution || '720p')) {
          throw new Error(`Invalid resolution for ${model}`);
        }

        predictionInput = {
          prompt,
          duration,
          resolution: params?.resolution || '720p',
          aspect_ratio: params?.aspect_ratio || '16:9',
          generate_audio: params?.generate_audio !== false,
          seed: Number.isInteger(params?.seed) ? params.seed : undefined,
          reference_images: decodeFileList(params?.reference_images, 9, 10 * 1024 * 1024, 'Reference images'),
          reference_videos: decodeFileList(params?.reference_videos, 3, 25 * 1024 * 1024, 'Reference videos'),
          reference_audio: decodeFileList(params?.reference_audio, 3, 25 * 1024 * 1024, 'Reference audio'),
          first_frame_image: params?.first_frame_image
            ? decodeFileInput(params.first_frame_image, 10 * 1024 * 1024)
            : undefined,
          last_frame_image: params?.last_frame_image
            ? decodeFileInput(params.last_frame_image, 10 * 1024 * 1024)
            : undefined,
        };
      } else {
        predictionInput = {
          prompt,
          aspect_ratio: params?.aspect_ratio,
          duration: params?.duration,
          fps: params?.fps,
          camera_move: params?.camera_move,
          motion_strength: params?.motion_strength,
          image: req.body.image,
        };
      }
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid generation parameters' });
      return;
    }

    // Call replicate client wrapper
    const webhookUrl = process.env.WEBHOOK_BASE_URL 
      ? `${process.env.WEBHOOK_BASE_URL}/api/v1/webhooks/replicate`
      : undefined;

    const repPrediction = await replicateService.createPrediction(model, predictionInput, webhookUrl);

    // Save Prediction in DB
    const prediction = await prisma.prediction.create({
      data: {
        userId: user.id,
        workflow,
        model,
        prompt: prompt || null,
        inputParams: isSeedance
          ? {
              duration: params?.duration ?? 5,
              resolution: params?.resolution || '720p',
              aspect_ratio: params?.aspect_ratio || '16:9',
              generate_audio: params?.generate_audio !== false,
              seed: Number.isInteger(params?.seed) ? params.seed : null,
              reference_image_count: params?.reference_images?.length || 0,
              reference_video_count: params?.reference_videos?.length || 0,
              reference_audio_count: params?.reference_audio?.length || 0,
              has_first_frame: Boolean(params?.first_frame_image),
              has_last_frame: Boolean(params?.last_frame_image),
            }
          : params || null,
        status: repPrediction.status,
        replicatePredictionId: repPrediction.id,
        outputUrl: repPrediction.outputUrl || null,
        completedAt: repPrediction.status === 'succeeded' ? new Date() : null,
      },
    });

    // Deduct 1 credit
    await prisma.user.update({
      where: { id: user.id },
      data: { creditsUsed: { increment: 1 } },
    });

    // Register job inside queue tracker (for async checks if not webhook verified)
    if (repPrediction.status !== 'succeeded') {
      await queueService.addGenerationJob({
        predictionId: prediction.id,
        replicatePredictionId: repPrediction.id,
        model,
      });
    } else if (repPrediction.outputUrl) {
      // Create user asset immediately if succeeded synchronously
      await prisma.asset.create({
        data: {
          userId: user.id,
          predictionId: prediction.id,
          url: repPrediction.outputUrl,
          type: workflow === 'text-to-image' ? 'image' : 'video',
        },
      });
    }

    res.status(201).json({
      id: prediction.id,
      status: prediction.status,
      output_url: prediction.outputUrl,
      created_at: prediction.createdAt,
    });
  } catch (error) {
    console.error('Submit prediction error:', error);
    res.status(500).json({ error: 'Failed submitting generation job' });
  }
});

// GET /api/v1/predictions/:id
router.get('/predictions/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
       res.status(401).json({ error: 'Unauthorized' });
       return;
    }

    const { id } = req.params;
    const prediction = await prisma.prediction.findUnique({
      where: { id },
    });

    if (!prediction || (prediction.userId !== user.id)) {
       res.status(404).json({ error: 'Prediction not found' });
       return;
    }

    res.json({
      id: prediction.id,
      status: prediction.status,
      output_url: prediction.outputUrl,
      error: prediction.errorMessage,
      completed_at: prediction.completedAt,
    });
  } catch (error) {
    console.error('Fetch prediction status error:', error);
    res.status(500).json({ error: 'Failed getting prediction status' });
  }
});

export default router;
