"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.thumbnailQueueService = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const thumbnail_service_1 = require("./thumbnail.service");
class ThumbnailQueueService {
    queue = null;
    worker = null;
    fallback = false;
    constructor() {
        try {
            const connection = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', {
                maxRetriesPerRequest: null,
            });
            connection.on('error', () => { this.fallback = true; });
            this.queue = new bullmq_1.Queue('thumbnails', { connection: connection });
            this.worker = new bullmq_1.Worker('thumbnails', async (job) => {
                await (0, thumbnail_service_1.processThumbnailForAsset)(job.data.assetId);
            }, { connection: connection, concurrency: 2 });
            this.worker.on('failed', (job, error) => {
                console.error(`Thumbnail job ${job?.id || 'unknown'} failed:`, error.message);
            });
            console.log('BullMQ thumbnail queue initialized.');
        }
        catch {
            this.fallback = true;
            console.warn('Thumbnail queue unavailable; using in-memory retry processing.');
        }
    }
    async add(assetId) {
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
    async processWithRetry(assetId) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await (0, thumbnail_service_1.processThumbnailForAsset)(assetId);
                return;
            }
            catch (error) {
                if (attempt === 3) {
                    console.error(`In-memory thumbnail job failed for asset ${assetId}:`, error);
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 5_000 * 2 ** (attempt - 1)));
            }
        }
    }
}
exports.thumbnailQueueService = new ThumbnailQueueService();
