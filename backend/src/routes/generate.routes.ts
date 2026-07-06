import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest, requireScope } from '../middleware/auth.middleware';
import { PredictionInput, ReplicateService } from '../services/replicate.service';
import { queueService } from '../services/queue.service';
import { quoteGeneration } from '../services/billing.service';
import { randomUUID } from 'crypto';
import { createAssetForPrediction } from '../services/asset.service';
import { getRemoteVideoDuration } from '../services/media-probe.service';
import { rateLimit } from '../middleware/rate-limit.middleware';

const router = Router();
const prisma = new PrismaClient();
const replicateService = new ReplicateService();
const SEEDANCE_MODELS = new Set([
  'bytedance/seedance-2.0',
  'bytedance/seedance-2.0-fast',
  'bytedance/seedance-2.0-mini',
]);

const NANO_BANANA_MODELS = new Set([
  'google/nano-banana-2',
  'google/nano-banana-pro',
]);

const IMAGE_MODELS = new Set([
  'black-forest-labs/flux-schnell',
  'stability-ai/stable-diffusion-3',
  'google/nano-banana-2',
  'google/nano-banana-pro',
  'recraft-ai/recraft-v3',
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

async function resolveOwnedStorageObjects(
  userId: string,
  value: unknown,
  maximum: number,
  allowedPrefix: 'image/' | 'video/' | 'audio/',
  label: string
): Promise<string[] | undefined> {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maximum || value.some((id) => typeof id !== 'string')) {
    throw new Error(`${label} accepts at most ${maximum} stored files`);
  }
  if (value.length === 0) return [];

  const objects = await prisma.storageObject.findMany({
    where: { id: { in: value as string[] }, userId },
    select: { id: true, url: true, mimeType: true },
  });
  const byId = new Map(objects.map((object) => [object.id, object]));
  return (value as string[]).map((id) => {
    const object = byId.get(id);
    if (!object || !object.mimeType?.startsWith(allowedPrefix)) {
      throw new Error(`${label} contains a missing, unauthorized, or invalid file`);
    }
    return object.url;
  });
}

async function resolveOwnedStorageObject(
  userId: string,
  value: unknown,
  allowedPrefix: 'image/' | 'video/' | 'audio/',
  label: string
): Promise<string | undefined> {
  if (value === undefined || value === null || value === '') return undefined;
  const [url] = await resolveOwnedStorageObjects(userId, [value], 1, allowedPrefix, label) || [];
  return url;
}

// POST /api/v1/generate
router.post('/generate', authMiddleware, requireScope('generation:write'), rateLimit('generation'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
       res.status(401).json({ error: 'Unauthorized' });
       return;
    }

    const { workflow, model, prompt, params } = req.body;
    
    // Input validation
    if (!workflow || !model) {
       res.status(400).json({ error: 'workflow and model parameters are required' });
       return;
    }

    // Validate workflow
    const validWorkflows = ['text-to-video', 'image-to-video', 'lip-sync', 'text-to-image', 'multi-image-video', 'multimodal-video', 'character-replace'];
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

    let predictionInput: PredictionInput;
    const billingParams: Record<string, unknown> = { ...(params || {}) };
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

        const referenceImages = params?.reference_image_ids
          ? await resolveOwnedStorageObjects(user.id, params.reference_image_ids, 9, 'image/', 'Reference images')
          : decodeFileList(params?.reference_images, 9, 10 * 1024 * 1024, 'Reference images');
        const referenceVideos = params?.reference_video_ids
          ? await resolveOwnedStorageObjects(user.id, params.reference_video_ids, 3, 'video/', 'Reference videos')
          : decodeFileList(params?.reference_videos, 3, 25 * 1024 * 1024, 'Reference videos');
        const referenceAudio = params?.reference_audio_ids
          ? await resolveOwnedStorageObjects(user.id, params.reference_audio_ids, 3, 'audio/', 'Reference audio')
          : decodeFileList(params?.reference_audio, 3, 25 * 1024 * 1024, 'Reference audio');
        const firstFrameImage = params?.first_frame_image_id
          ? await resolveOwnedStorageObject(user.id, params.first_frame_image_id, 'image/', 'First frame')
          : params?.first_frame_image ? decodeFileInput(params.first_frame_image, 10 * 1024 * 1024) : undefined;
        const lastFrameImage = params?.last_frame_image_id
          ? await resolveOwnedStorageObject(user.id, params.last_frame_image_id, 'image/', 'Last frame')
          : params?.last_frame_image ? decodeFileInput(params.last_frame_image, 10 * 1024 * 1024) : undefined;

        predictionInput = {
          prompt,
          duration,
          resolution: params?.resolution || '720p',
          aspect_ratio: params?.aspect_ratio || '16:9',
          generate_audio: params?.generate_audio !== false,
          seed: Number.isInteger(params?.seed) ? params.seed : undefined,
          reference_images: referenceImages,
          reference_videos: referenceVideos,
          reference_audio: referenceAudio,
          first_frame_image: firstFrameImage,
          last_frame_image: lastFrameImage,
        };
      } else if (workflow === 'character-replace') {
        if (model !== 'kwaivgi/kling-v3-omni-video') {
          throw new Error('Character replacement requires Kling V3 Omni Video');
        }
        const [referenceImage] = await resolveOwnedStorageObjects(
          user.id,
          params?.reference_image_ids,
          1,
          'image/',
          'Character reference image'
        ) || [];
        const referenceVideo = await resolveOwnedStorageObject(
          user.id,
          params?.reference_video_id,
          'video/',
          'Reference video'
        );
        if (!referenceImage || !referenceVideo) {
          throw new Error('Character replacement requires one reference image and one reference video');
        }
        const referenceDuration = await getRemoteVideoDuration(referenceVideo);
        if (referenceDuration < 3 || referenceDuration > 10.05) {
          throw new Error(`Reference video must be between 3 and 10 seconds (received ${referenceDuration.toFixed(1)}s)`);
        }
        const mode = params?.mode || 'pro';
        if (!['standard', 'pro'].includes(mode)) throw new Error('Kling mode must be standard or pro');
        billingParams.duration = referenceDuration;
        billingParams.mode = mode;

        predictionInput = {
          prompt: prompt || 'Replace the person in <<<video_1>>> with the person from <<<image_1>>>, preserving the original motion, framing, lighting, and scene.',
          reference_images: [referenceImage],
          reference_video: referenceVideo,
          video_reference_type: 'base' as const,
          mode,
          duration: 15,
          aspect_ratio: params?.aspect_ratio || '16:9',
          generate_audio: false,
          keep_original_sound: params?.keep_original_sound !== false,
        };
      } else if (workflow === 'lip-sync') {
        const image = await resolveOwnedStorageObject(user.id, req.body.image_storage_object_id, 'image/', 'Lip-sync image');
        const audio = await resolveOwnedStorageObject(user.id, req.body.audio_storage_object_id, 'audio/', 'Lip-sync audio');
        if (!image || !audio) throw new Error('Lip-sync requires a stored image and audio file');
        if (!['bytedance/omni-human', 'bytedance/omni-human-1.5'].includes(model)) {
          throw new Error('Selected model does not support uploaded image and audio lip-sync');
        }
        predictionInput = {
          image,
          audio,
          prompt: model === 'bytedance/omni-human-1.5' ? prompt || undefined : undefined,
          seed: Number.isInteger(params?.seed) ? params.seed : undefined,
          fast_mode: model === 'bytedance/omni-human-1.5' ? params?.fast_mode === true : undefined,
        };
      } else if (workflow === 'text-to-image') {
        if (!IMAGE_MODELS.has(model)) throw new Error('Unsupported image generation model');
        if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Image generation requires a prompt');

        if (NANO_BANANA_MODELS.has(model)) {
          const validResolutions = ['1K', '2K', '4K'];
          const validAspectRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
          const validFormats = ['jpg', 'png'];
          const imageResolution = params?.resolution || (model === 'google/nano-banana-pro' ? '2K' : '1K');
          const imageAspectRatio = params?.aspect_ratio || '1:1';
          const outputFormat = params?.output_format || 'jpg';

          if (!validResolutions.includes(imageResolution)) throw new Error('Invalid Nano Banana resolution');
          if (!validAspectRatios.includes(imageAspectRatio)) throw new Error('Invalid Nano Banana aspect ratio');
          if (!validFormats.includes(outputFormat)) throw new Error('Invalid Nano Banana output format');

          const imageInput = params?.reference_image_ids
            ? await resolveOwnedStorageObjects(user.id, params.reference_image_ids, 14, 'image/', 'Nano Banana reference images')
            : undefined;

          predictionInput = {
            prompt: prompt.trim(),
            resolution: imageResolution,
            aspect_ratio: imageAspectRatio,
            output_format: outputFormat,
            image_input: imageInput || [],
            ...(model === 'google/nano-banana-pro'
              ? { safety_filter_level: 'block_only_high', allow_fallback_model: true }
              : {}),
          };
        } else if (model === 'recraft-ai/recraft-v3') {
          const validAspectRatios = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '1:2', '2:1', '7:5', '5:7', '4:5', '5:4', '3:5', '5:3'];
          const validStyles = ['any', 'realistic_image', 'digital_illustration', 'vector_illustration'];
          const imageAspectRatio = params?.aspect_ratio || '1:1';
          const style = params?.style || 'any';

          if (!validAspectRatios.includes(imageAspectRatio)) throw new Error('Invalid Recraft aspect ratio');
          if (!validStyles.includes(style)) throw new Error('Invalid Recraft style');

          predictionInput = {
            prompt: prompt.trim(),
            aspect_ratio: imageAspectRatio,
            style,
          };
        } else {
          predictionInput = {
            prompt: prompt.trim(),
            aspect_ratio: params?.aspect_ratio,
          };
        }
      } else {
        const image = workflow === 'image-to-video'
          ? await resolveOwnedStorageObject(user.id, req.body.image_storage_object_id, 'image/', 'Input image')
          : undefined;
        if (workflow === 'image-to-video' && !image) throw new Error('Image-to-video requires a stored image');
        if (model === 'xai/grok-imagine-video-1.5') {
          const grokDuration = params?.duration ?? 5;
          const grokResolution = params?.resolution || '720p';
          const grokAspectRatio = params?.aspect_ratio || 'auto';
          if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Grok Imagine Video requires a motion prompt');
          if (!Number.isInteger(grokDuration) || grokDuration < 1 || grokDuration > 15) {
            throw new Error('Grok Imagine Video duration must be an integer from 1 to 15 seconds');
          }
          if (!['480p', '720p'].includes(grokResolution)) throw new Error('Grok Imagine Video resolution must be 480p or 720p');
          if (!['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].includes(grokAspectRatio)) {
            throw new Error('Invalid Grok Imagine Video aspect ratio');
          }
          predictionInput = {
            prompt: prompt.trim(),
            image,
            duration: grokDuration,
            resolution: grokResolution,
            aspect_ratio: grokAspectRatio,
          };
        } else {
          predictionInput = {
            prompt,
            aspect_ratio: params?.aspect_ratio,
            duration: params?.duration,
            fps: params?.fps,
            camera_move: params?.camera_move,
            motion_strength: params?.motion_strength,
            image,
          };
        }
      }
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid generation parameters' });
      return;
    }

    let billingQuote;
    try {
      billingQuote = quoteGeneration({ workflow, model, params: billingParams });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid billing parameters' });
      return;
    }
    const remainingCredits = user.creditsLimit - user.creditsUsed;
    if (billingQuote.totalCredits > remainingCredits) {
      res.status(403).json({
        error: 'Generation quota exceeded. Please upgrade plan.',
        credits_required: billingQuote.totalCredits,
        credits_remaining: Math.max(0, remainingCredits),
      });
      return;
    }

    const projectId = typeof req.body.project_id === 'string' ? req.body.project_id : undefined;
    const storyboardSceneId = typeof req.body.storyboard_scene_id === 'string' ? req.body.storyboard_scene_id : undefined;

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

    if (storyboardSceneId) {
      const scene = await prisma.storyboardScene.findFirst({
        where: { id: storyboardSceneId, project: { userId: user.id } },
        select: { id: true, projectId: true },
      });
      if (!scene || (projectId && scene.projectId !== projectId)) {
        res.status(404).json({ error: 'Storyboard scene not found' });
        return;
      }
    }

    // Call replicate client wrapper
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL;
    const webhookUrl = webhookBaseUrl?.startsWith('https://')
      ? `${webhookBaseUrl.replace(/\/+$/, '')}/api/v1/webhooks/replicate`
      : undefined;

    const variationGroupId = billingQuote.variationCount > 1 ? randomUUID() : undefined;
    const submittedPredictions = [];

    for (let variationIndex = 0; variationIndex < billingQuote.variationCount; variationIndex++) {
      const variantInput = {
        ...predictionInput,
        seed: Number.isInteger(predictionInput.seed)
          ? (predictionInput.seed as number) + variationIndex
          : predictionInput.seed,
      };
      const repPrediction = await replicateService.createPrediction(model, variantInput, webhookUrl);

      // Save Prediction in DB
      const prediction = await prisma.prediction.create({
        data: {
          userId: user.id,
          projectId,
          storyboardSceneId,
          workflow,
          model,
          prompt: prompt || null,
          inputParams: isSeedance
            ? {
                duration: params?.duration ?? 5,
                resolution: params?.resolution || '720p',
                aspect_ratio: params?.aspect_ratio || '16:9',
                generate_audio: params?.generate_audio !== false,
                seed: Number.isInteger(params?.seed) ? params.seed + variationIndex : null,
                reference_image_count: params?.reference_image_ids?.length || params?.reference_images?.length || 0,
                reference_video_count: params?.reference_video_ids?.length || params?.reference_videos?.length || 0,
                reference_audio_count: params?.reference_audio_ids?.length || params?.reference_audio?.length || 0,
                has_first_frame: Boolean(params?.first_frame_image_id || params?.first_frame_image),
                has_last_frame: Boolean(params?.last_frame_image_id || params?.last_frame_image),
              }
            : {
                ...(params || {}),
                seed: Number.isInteger((params as Record<string, unknown> | undefined)?.seed)
                  ? ((params as Record<string, number>).seed + variationIndex)
                  : (params as Record<string, unknown> | undefined)?.seed,
              },
          variationGroupId,
          variationIndex,
          variationCount: billingQuote.variationCount,
          creditCost: variationIndex === 0 || model === 'google/nano-banana-pro'
            ? billingQuote.baseCredits
            : Math.ceil(billingQuote.baseCredits * 0.75),
          status: repPrediction.status,
          replicatePredictionId: repPrediction.id,
          outputUrl: repPrediction.outputUrl || null,
          completedAt: repPrediction.status === 'succeeded' ? new Date() : null,
        },
      });

      submittedPredictions.push(prediction);

      // Register job inside queue tracker (for async checks if not webhook verified)
      if (repPrediction.status !== 'succeeded') {
        await queueService.addGenerationJob({
          predictionId: prediction.id,
          replicatePredictionId: repPrediction.id,
          model,
        });
      } else if (repPrediction.outputUrl) {
        // Create user asset immediately if succeeded synchronously
        await createAssetForPrediction(prediction, repPrediction.outputUrl);
      }
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { creditsUsed: { increment: billingQuote.totalCredits } },
      }),
      prisma.usageEvent.create({
        data: {
          userId: user.id,
          predictionId: submittedPredictions[0]?.id,
          eventType: 'generation',
          credits: billingQuote.totalCredits,
          metadata: {
            workflow,
            model,
            variation_count: billingQuote.variationCount,
            variation_group_id: variationGroupId,
          },
        },
      }),
    ]);

    const primaryPrediction = submittedPredictions[0];

    res.status(201).json({
      id: primaryPrediction.id,
      status: primaryPrediction.status,
      output_url: primaryPrediction.outputUrl,
      created_at: primaryPrediction.createdAt,
      credits_charged: billingQuote.totalCredits,
      variation_group_id: variationGroupId,
      predictions: submittedPredictions.map((prediction) => ({
        id: prediction.id,
        status: prediction.status,
        output_url: prediction.outputUrl,
        variation_index: prediction.variationIndex,
      })),
    });
  } catch (error) {
    console.error('Submit prediction error:', error);
    res.status(500).json({ error: 'Failed submitting generation job' });
  }
});

// GET /api/v1/predictions/:id
router.get('/predictions/:id', authMiddleware, requireScope('predictions:read'), async (req: AuthenticatedRequest, res: Response) => {
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
