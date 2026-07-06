"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRetentionCleanup = runRetentionCleanup;
exports.startRetentionScheduler = startRetentionScheduler;
exports.disconnectRetentionService = disconnectRetentionService;
const client_1 = require("@prisma/client");
const storage_service_1 = require("./storage.service");
const prisma = new client_1.PrismaClient();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
async function safeDeleteObject(key) {
    if (!key)
        return 0;
    if (!storage_service_1.storageService.isConfigured())
        throw new Error('Durable storage is not configured; refusing database-only deletion');
    let byteSize = 0;
    try {
        byteSize = (await storage_service_1.storageService.inspectObject(key))?.byteSize || 0;
    }
    catch {
        // Missing objects are already clean and should not block database cleanup.
    }
    await storage_service_1.storageService.deleteObject(key);
    return byteSize;
}
async function runRetentionCleanup(options = {}) {
    const dryRun = options.dryRun !== false;
    const batchSize = Math.min(500, Math.max(1, options.batchSize || 100));
    const now = options.now || new Date();
    const result = { dryRun, abandonedUploads: 0, expiredAssets: 0, deletedBytes: 0, failures: 0 };
    const abandoned = await prisma.storageObject.findMany({
        where: {
            mimeType: null,
            asset: null,
            thumbnailForAsset: null,
            createdAt: { lt: new Date(now.getTime() - HOUR_MS) },
        },
        select: { id: true, key: true },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
    });
    result.abandonedUploads = abandoned.length;
    if (!dryRun) {
        for (const upload of abandoned) {
            try {
                await safeDeleteObject(upload.key);
                await prisma.storageObject.deleteMany({
                    where: { id: upload.id, mimeType: null, asset: null, thumbnailForAsset: null },
                });
            }
            catch (error) {
                result.failures++;
                console.error(`Failed cleaning abandoned upload ${upload.id}:`, error instanceof Error ? error.message : error);
            }
        }
    }
    const expired = await prisma.asset.findMany({
        where: {
            createdAt: { lt: new Date(now.getTime() - 7 * DAY_MS) },
            user: { plan: 'free' },
        },
        include: {
            storageObject: { select: { id: true, key: true, byteSize: true } },
            thumbnailStorageObject: { select: { id: true, key: true, byteSize: true } },
            user: { select: { id: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: Math.max(0, batchSize - abandoned.length),
    });
    result.expiredAssets = expired.length;
    if (!dryRun) {
        for (const asset of expired) {
            if (!asset.userId || !asset.user)
                continue;
            try {
                let deletedBytes = asset.storageObject?.byteSize || asset.fileSize || 0;
                if (asset.storageObject?.key)
                    await safeDeleteObject(asset.storageObject.key);
                if (asset.thumbnailStorageObject) {
                    deletedBytes += asset.thumbnailStorageObject.byteSize || 0;
                    if (asset.thumbnailStorageObject.key)
                        await safeDeleteObject(asset.thumbnailStorageObject.key);
                }
                else if (asset.thumbnailUrl && asset.thumbnailUrl !== asset.url) {
                    deletedBytes += await safeDeleteObject(storage_service_1.storageService.thumbnailKey(asset.userId, asset.id));
                }
                await prisma.$transaction(async (tx) => {
                    await tx.asset.deleteMany({ where: { id: asset.id, userId: asset.userId } });
                    if (asset.storageObject?.id) {
                        await tx.storageObject.deleteMany({ where: { id: asset.storageObject.id, userId: asset.userId } });
                    }
                    if (asset.thumbnailStorageObject?.id) {
                        await tx.storageObject.deleteMany({ where: { id: asset.thumbnailStorageObject.id, userId: asset.userId } });
                    }
                    if (asset.predictionId) {
                        await tx.prediction.updateMany({
                            where: { id: asset.predictionId, userId: asset.userId },
                            data: { status: 'expired', outputUrl: null },
                        });
                    }
                    await tx.$executeRaw `UPDATE users SET storage_usage_bytes = GREATEST(0, storage_usage_bytes - ${deletedBytes}) WHERE id = ${asset.userId}`;
                });
                result.deletedBytes += deletedBytes;
            }
            catch (error) {
                result.failures++;
                console.error(`Failed expiring asset ${asset.id}:`, error instanceof Error ? error.message : error);
            }
        }
    }
    return result;
}
function startRetentionScheduler() {
    if (String(process.env.RETENTION_CLEANUP_ENABLED || 'false').toLowerCase() !== 'true') {
        console.log('Automatic retention cleanup is disabled. Run retention:dry-run before enabling it.');
        return;
    }
    const intervalMs = Math.max(HOUR_MS, Number(process.env.RETENTION_CLEANUP_INTERVAL_MS || 6 * HOUR_MS));
    const execute = () => void runRetentionCleanup({ dryRun: false }).then((result) => {
        if (result.abandonedUploads || result.expiredAssets || result.failures) {
            console.log('Retention cleanup:', result);
        }
    }).catch((error) => console.error('Retention cleanup failed:', error));
    const initial = setTimeout(execute, 60_000);
    initial.unref();
    const timer = setInterval(execute, intervalMs);
    timer.unref();
}
async function disconnectRetentionService() {
    await prisma.$disconnect();
}
