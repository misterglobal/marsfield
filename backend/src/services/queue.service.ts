import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { ReplicateService } from './replicate.service';
import { createAssetForPrediction, createThumbnailForAsset, storeExistingAssetIfNeeded } from './asset.service';
import { storageService } from './storage.service';

const prisma = new PrismaClient();
const replicateService = new ReplicateService();

interface GenerationJobData {
  predictionId: string;
  replicatePredictionId: string;
  model?: string;
}

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
          await this.processJob(job.data);
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

    const assetsWithoutThumbnails = await prisma.asset.findMany({
      where: { thumbnailUrl: null, userId: { not: null } },
      select: { id: true, userId: true, url: true, type: true, thumbnailUrl: true },
      take: 25,
    });
    let thumbnailCount = 0;
    for (const asset of assetsWithoutThumbnails) {
      if (await createThumbnailForAsset(asset)) thumbnailCount++;
    }
    if (thumbnailCount > 0) console.log(`Generated ${thumbnailCount} missing asset thumbnail(s).`);

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
    if (completedWithoutAssets.length > 0) {
      console.log(`Restored ${completedWithoutAssets.length} missing library asset(s).`);
    }
  }

  private async processJob(data: GenerationJobData): Promise<void> {
    console.log(`Processing background job for prediction: ${data.predictionId}`);
    try {
      await this.pollUntilComplete(data);
    } catch (error) {
      console.error(`Failed executing background prediction job ${data.predictionId}:`, error);
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
    result: { status: string; outputUrl?: string; error?: string }
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
    }

    return isTerminal;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const queueService = new QueueService();
