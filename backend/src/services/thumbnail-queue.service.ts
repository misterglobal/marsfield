import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processThumbnailForAsset } from './thumbnail.service';

interface ThumbnailJobData { assetId: string }

class ThumbnailQueueService {
  private queue: Queue<ThumbnailJobData> | null = null;
  private worker: Worker<ThumbnailJobData> | null = null;
  private fallback = false;

  constructor() {
    try {
      const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
      });
      connection.on('error', () => { this.fallback = true; });
      this.queue = new Queue<ThumbnailJobData>('thumbnails', { connection: connection as any });
      this.worker = new Worker<ThumbnailJobData>(
        'thumbnails',
        async (job: Job<ThumbnailJobData>) => {
          await processThumbnailForAsset(job.data.assetId);
        },
        { connection: connection as any, concurrency: 2 },
      );
      this.worker.on('failed', (job, error) => {
        console.error(`Thumbnail job ${job?.id || 'unknown'} failed:`, error.message);
      });
      console.log('BullMQ thumbnail queue initialized.');
    } catch {
      this.fallback = true;
      console.warn('Thumbnail queue unavailable; using in-memory retry processing.');
    }
  }

  async add(assetId: string): Promise<void> {
    if (!this.fallback && this.queue) {
      await this.queue.add('create-thumbnail', { assetId }, {
        jobId: `thumbnail-${assetId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        // Exhausted jobs are logged, then removed so startup reconciliation
        // can enqueue the asset again after the underlying issue is fixed.
        removeOnFail: true,
      });
      return;
    }
    void this.processWithRetry(assetId);
  }

  private async processWithRetry(assetId: string): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await processThumbnailForAsset(assetId);
        return;
      } catch (error) {
        if (attempt === 3) {
          console.error(`In-memory thumbnail job failed for asset ${assetId}:`, error);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5_000 * 2 ** (attempt - 1)));
      }
    }
  }
}

export const thumbnailQueueService = new ThumbnailQueueService();
