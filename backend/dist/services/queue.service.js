"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueService = exports.QueueService = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const client_1 = require("@prisma/client");
const replicate_service_1 = require("./replicate.service");
const asset_service_1 = require("./asset.service");
const storage_service_1 = require("./storage.service");
const thumbnail_queue_service_1 = require("./thumbnail-queue.service");
const prisma = new client_1.PrismaClient();
const replicateService = new replicate_service_1.ReplicateService();
class QueueService {
    queue = null;
    worker = null;
    isFallback = false;
    pollIntervalMs = Number(process.env.PREDICTION_POLL_INTERVAL_MS || 5000);
    maxPollAttempts = Number(process.env.PREDICTION_MAX_POLL_ATTEMPTS || 120);
    constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        try {
            const connection = new ioredis_1.default(redisUrl, { maxRetriesPerRequest: null });
            connection.on('error', () => {
                if (!this.isFallback) {
                    console.warn('Redis connection failed. Falling back to in-memory async processing pipeline.');
                    this.isFallback = true;
                }
            });
            this.queue = new bullmq_1.Queue('generations', { connection: connection });
            this.worker = new bullmq_1.Worker('generations', async (job) => {
                await this.processJob(job.data);
            }, { connection: connection });
            console.log('BullMQ generation queue initialized.');
        }
        catch {
            console.warn('QueueService initialization encountered an error. Defaulting to in-memory fallback.');
            this.isFallback = true;
        }
    }
    async addGenerationJob(data) {
        if (this.isFallback || !this.queue) {
            console.log(`Fallback: Polling prediction in memory: ${data.predictionId}`);
            void this.pollUntilComplete(data).catch((err) => {
                console.error('In-memory generation polling failed:', err);
            });
            return;
        }
        await this.queue.add(`job-${data.predictionId}`, data);
    }
    async resumeIncompleteJobs() {
        if (storage_service_1.storageService.isConfigured()) {
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
                    if (await (0, asset_service_1.storeExistingAssetIfNeeded)(asset)) {
                        storedCount++;
                    }
                }
                catch (error) {
                    console.error(`Failed backfilling asset ${asset.id} into durable storage:`, error);
                }
            }
            if (storedCount > 0) {
                console.log(`Backfilled ${storedCount} asset(s) into durable storage.`);
            }
        }
        else {
            console.log('Durable storage is not configured. Generated assets will use provider URLs.');
        }
        const assetsWithoutTrackedThumbnails = await prisma.asset.findMany({
            where: { thumbnailStorageObjectId: null, userId: { not: null } },
            select: { id: true },
            take: 25,
        });
        for (const asset of assetsWithoutTrackedThumbnails) {
            await thumbnail_queue_service_1.thumbnailQueueService.add(asset.id);
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
            if (!prediction.outputUrl || !prediction.userId)
                continue;
            await (0, asset_service_1.createAssetForPrediction)(prediction, prediction.outputUrl);
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
            if (!prediction.replicatePredictionId)
                continue;
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
    async processJob(data) {
        console.log(`Processing background job for prediction: ${data.predictionId}`);
        try {
            await this.pollUntilComplete(data);
        }
        catch (error) {
            console.error(`Failed executing background prediction job ${data.predictionId}:`, error);
            throw error;
        }
    }
    async pollUntilComplete(data) {
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
    async updatePrediction(predictionId, result) {
        const status = result.status === 'succeeded'
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
            await (0, asset_service_1.createAssetForPrediction)(prediction, prediction.outputUrl);
            if (prediction.workflow === 'video-caption' && result.outputUrls?.[1]) {
                await (0, asset_service_1.createSupplementaryAssetForPrediction)(prediction, result.outputUrls[1], 'document');
            }
        }
        return isTerminal;
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.QueueService = QueueService;
exports.queueService = new QueueService();
