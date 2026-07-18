import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { ReplicateService } from './replicate.service';
import {
  createAssetForPrediction,
  createAssetFromBufferForPrediction,
  createSupplementaryAssetForPrediction,
  storeExistingAssetIfNeeded,
} from './asset.service';
import { storageService } from './storage.service';
import { thumbnailQueueService } from './thumbnail-queue.service';
import { assertSocialResizeFormat, assertSocialResizeMode, renderSocialResize } from './social-resize.service';
import { normalizeTimelineClip, renderTimelineExport } from './timeline-export.service';
import { extractThumbnailStill, renderTitleOverlayVideo } from './video-packaging.service';

const prisma = new PrismaClient();
const replicateService = new ReplicateService();

interface GenerationJobData {
  kind?: 'replicate';
  predictionId: string;
  replicatePredictionId: string;
  model?: string;
}

interface LocalProcessingJobData {
  kind: 'local';
  predictionId: string;
}

type QueueJobData = GenerationJobData | LocalProcessingJobData;

export class QueueService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private isFallback = false;
  private readonly pollIntervalMs = Number(process.env.PREDICTION_POLL_INTERVAL_MS || 5000);
  private readonly maxPollAttempts = Number(process.env.PREDICTION_MAX_POLL_ATTEMPTS || 120);

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

      connection.on('error', () => {
        if (!this.isFallback) {
          console.warn('Redis connection failed. Falling back to in-memory async processing pipeline.');
          this.isFallback = true;
        }
      });

      this.queue = new Queue('generations', { connection: connection as any });
      this.worker = new Worker(
        'generations',
        async (job: Job) => {
          await this.processJob(job.data as QueueJobData);
        },
        { connection: connection as any }
      );

      console.log('BullMQ generation queue initialized.');
    } catch {
      console.warn('QueueService initialization encountered an error. Defaulting to in-memory fallback.');
      this.isFallback = true;
    }
  }

  public async addGenerationJob(data: GenerationJobData): Promise<void> {
    if (this.isFallback || !this.queue) {
      console.log(`Fallback: Polling prediction in memory: ${data.predictionId}`);
      void this.pollUntilComplete(data).catch((err) => {
        console.error('In-memory generation polling failed:', err);
      });
      return;
    }

    await this.queue.add(`job-${data.predictionId}`, data);
  }

  public async addLocalProcessingJob(data: LocalProcessingJobData): Promise<void> {
    if (this.isFallback || !this.queue) {
      console.log(`Fallback: Processing local job in memory: ${data.predictionId}`);
      void this.processLocalJob(data).catch((err) => {
        console.error('In-memory local processing failed:', err);
      });
      return;
    }

    await this.queue.add(`local-${data.predictionId}`, data);
  }

  public async resumeIncompleteJobs(): Promise<void> {
    if (storageService.isConfigured()) {
      const unstoredAssets = await prisma.asset.findMany({
        where: {
          storageObjectId: null,
          userId: { not: null },
        },
        select: {
          id: true,
          userId: true,
          predictionId: true,
          url: true,
          type: true,
        },
        take: 25,
      });

      let storedCount = 0;
      for (const asset of unstoredAssets) {
        try {
          if (await storeExistingAssetIfNeeded(asset)) {
            storedCount++;
          }
        } catch (error) {
          console.error(`Failed backfilling asset ${asset.id} into durable storage:`, error);
        }
      }

      if (storedCount > 0) {
        console.log(`Backfilled ${storedCount} asset(s) into durable storage.`);
      }
    } else {
      console.log('Durable storage is not configured. Generated assets will use provider URLs.');
    }

    const assetsWithoutTrackedThumbnails = await prisma.asset.findMany({
      where: { thumbnailStorageObjectId: null, userId: { not: null } },
      select: { id: true },
      take: 25,
    });
    for (const asset of assetsWithoutTrackedThumbnails) {
      await thumbnailQueueService.add(asset.id);
    }
    if (assetsWithoutTrackedThumbnails.length > 0) {
      console.log(`Queued ${assetsWithoutTrackedThumbnails.length} missing or untracked asset thumbnail(s).`);
    }

    const completedWithoutAssets = await prisma.prediction.findMany({
      where: {
        status: 'succeeded',
        outputUrl: { not: null },
        userId: { not: null },
        assets: { none: {} },
      },
    });

    for (const prediction of completedWithoutAssets) {
      if (!prediction.outputUrl || !prediction.userId) continue;

      await createAssetForPrediction(prediction, prediction.outputUrl);
    }

    const incompletePredictions = await prisma.prediction.findMany({
      where: {
        status: { in: ['pending', 'processing', 'starting'] },
        replicatePredictionId: { not: null },
      },
      select: {
        id: true,
        replicatePredictionId: true,
        model: true,
      },
    });

    for (const prediction of incompletePredictions) {
      if (!prediction.replicatePredictionId) continue;

      await this.addGenerationJob({
        predictionId: prediction.id,
        replicatePredictionId: prediction.replicatePredictionId,
        model: prediction.model,
      });
    }

    if (incompletePredictions.length > 0) {
      console.log(`Resumed ${incompletePredictions.length} incomplete generation job(s).`);
    }

    const incompleteLocalPredictions = await prisma.prediction.findMany({
      where: {
        status: 'processing',
        replicatePredictionId: null,
        model: { in: ['local/ffmpeg-social-resize', 'local/ffmpeg-timeline', 'local/ffmpeg-title-overlay', 'local/ffmpeg-thumbnail-stills'] },
      },
      select: { id: true },
      take: 25,
    });
    for (const prediction of incompleteLocalPredictions) {
      await this.addLocalProcessingJob({ kind: 'local', predictionId: prediction.id });
    }
    if (incompleteLocalPredictions.length > 0) {
      console.log(`Resumed ${incompleteLocalPredictions.length} incomplete local processing job(s).`);
    }
    if (completedWithoutAssets.length > 0) {
      console.log(`Restored ${completedWithoutAssets.length} missing library asset(s).`);
    }
  }

  private async processJob(data: QueueJobData): Promise<void> {
    if ('kind' in data && data.kind === 'local') {
      await this.processLocalJob(data);
      return;
    }

    console.log(`Processing background job for prediction: ${data.predictionId}`);
    try {
      await this.pollUntilComplete(data);
    } catch (error) {
      console.error(`Failed executing background prediction job ${data.predictionId}:`, error);
      throw error;
    }
  }

  private async processLocalJob(data: LocalProcessingJobData): Promise<void> {
    const prediction = await prisma.prediction.findUnique({
      where: { id: data.predictionId },
    });
    if (!prediction || ['succeeded', 'failed'].includes(prediction.status)) return;

    const params = (prediction.inputParams || {}) as Record<string, any>;

    try {
      let outputBuffer: Buffer;
      let mimeType = 'video/mp4';
      let assetType: 'image' | 'video' = 'video';
      let originalName = 'processed-video.mp4';
      let metadata: Record<string, string> = { workflow: prediction.workflow };

      if (prediction.model === 'local/ffmpeg-social-resize') {
        const sourceUrl = String(params.source_url || '');
        if (!sourceUrl) throw new Error('Social resize source video is missing');
        const format = assertSocialResizeFormat(params.format);
        const mode = assertSocialResizeMode(params.mode);
        outputBuffer = await renderSocialResize({ sourceUrl, format, mode });
        originalName = `social-resize-${format}-${mode}.mp4`;
        metadata = { workflow: prediction.workflow, format, mode, batch: params.batch ? 'true' : 'false' };
      } else if (prediction.model === 'local/ffmpeg-timeline') {
        const requestedClips = Array.isArray(params.clips) ? params.clips : [];
        const clips = requestedClips.map((clip) => normalizeTimelineClip({
          sourceUrl: String(clip.source_url || ''),
          startSeconds: clip.start_seconds,
          endSeconds: clip.end_seconds,
        }));
        outputBuffer = await renderTimelineExport(clips);
        originalName = 'timeline-export.mp4';
        metadata = { workflow: prediction.workflow, clipCount: String(clips.length) };
      } else if (prediction.model === 'local/ffmpeg-title-overlay') {
        const sourceUrl = String(params.source_url || '');
        const title = String(params.title || '');
        if (!sourceUrl) throw new Error('Title overlay source video is missing');
        outputBuffer = await renderTitleOverlayVideo({ sourceUrl, title, subtitle: String(params.subtitle || '') });
        originalName = 'title-overlay.mp4';
        metadata = { workflow: prediction.workflow, sourceAssetId: String(params.source_asset_id || '') };
      } else if (prediction.model === 'local/ffmpeg-thumbnail-stills') {
        const sourceUrl = String(params.source_url || '');
        const timeSeconds = Number(params.time_seconds || 0);
        if (!sourceUrl) throw new Error('Thumbnail source video is missing');
        outputBuffer = await extractThumbnailStill({ sourceUrl, timeSeconds });
        mimeType = 'image/jpeg';
        assetType = 'image';
        originalName = `thumbnail-still-${params.index ?? 1}.jpg`;
        metadata = {
          workflow: prediction.workflow,
          sourceAssetId: String(params.source_asset_id || ''),
          timeSeconds: String(timeSeconds),
        };
      } else {
        throw new Error(`Unsupported local processing model: ${prediction.model}`);
      }

      const asset = await createAssetFromBufferForPrediction(prediction, outputBuffer, {
        mimeType,
        assetType,
        originalName,
        metadata,
      });
      await prisma.prediction.update({
        where: { id: prediction.id },
        data: { status: 'succeeded', outputUrl: asset.url, completedAt: new Date() },
      });
      await prisma.usageEvent.create({
        data: {
          userId: prediction.userId!,
          predictionId: prediction.id,
          eventType: 'generation',
          credits: 0,
          metadata: { workflow: prediction.workflow, model: prediction.model, local_processing: true },
        },
      });
    } catch (error) {
      await prisma.prediction.update({
        where: { id: prediction.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Local processing failed',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async pollUntilComplete(data: GenerationJobData): Promise<void> {
    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt++) {
      const existingPrediction = await prisma.prediction.findUnique({
        where: { id: data.predictionId },
        select: { status: true },
      });

      // A webhook may have completed the prediction while this job was waiting.
      if (!existingPrediction || ['succeeded', 'failed'].includes(existingPrediction.status)) {
        return;
      }

      const result = await replicateService.getPrediction(data.replicatePredictionId);
      const isTerminal = await this.updatePrediction(data.predictionId, result);
      if (isTerminal) {
        return;
      }

      if (attempt < this.maxPollAttempts) {
        await this.delay(this.pollIntervalMs);
      }
    }

    console.warn(`Prediction polling timed out for ${data.predictionId}`);
  }

  private async updatePrediction(
    predictionId: string,
    result: { status: string; outputUrl?: string; outputUrls?: string[]; error?: string }
  ): Promise<boolean> {
    const status =
      result.status === 'succeeded'
        ? 'succeeded'
        : result.status === 'failed' || result.status === 'canceled'
          ? 'failed'
          : 'processing';
    const isTerminal = status === 'succeeded' || status === 'failed';

    const prediction = await prisma.prediction.update({
        where: { id: predictionId },
        data: {
          status,
          outputUrl: result.outputUrl || undefined,
          errorMessage: result.error || undefined,
          completedAt: isTerminal ? new Date() : undefined,
        },
      });

    if (status === 'succeeded' && prediction.outputUrl) {
      await createAssetForPrediction(prediction, prediction.outputUrl);
      if (prediction.workflow === 'video-caption' && result.outputUrls?.[1]) {
        await createSupplementaryAssetForPrediction(prediction, result.outputUrls[1], 'document');
      }
    }

    return isTerminal;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const queueService = new QueueService();
