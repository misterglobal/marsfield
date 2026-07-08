"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAssetForPrediction = createAssetForPrediction;
exports.storeExistingAssetIfNeeded = storeExistingAssetIfNeeded;
const client_1 = require("@prisma/client");
const storage_service_1 = require("./storage.service");
const thumbnail_queue_service_1 = require("./thumbnail-queue.service");
const model_registry_1 = require("../config/model-registry");
const prisma = new client_1.PrismaClient();
async function createAssetForPrediction(prediction, outputUrl) {
    if (!prediction.userId)
        return;
    const userId = prediction.userId;
    const existingAsset = await prisma.asset.findFirst({
        where: { predictionId: prediction.id },
        select: { id: true },
    });
    if (existingAsset)
        return;
    const type = (0, model_registry_1.getModelDefinition)(prediction.model)?.output || (['text-to-image', 'image-upscale'].includes(prediction.workflow) ? 'image' : 'video');
    let storedAsset = null;
    try {
        storedAsset = await storage_service_1.storageService.storeRemoteAsset({
            sourceUrl: outputUrl,
            userId: prediction.userId,
            predictionId: prediction.id,
            assetType: type,
        });
    }
    catch (error) {
        console.error('Generated asset storage failed; falling back to provider URL:', error);
    }
    const asset = await prisma.$transaction(async (tx) => {
        const storageObject = storedAsset
            ? await tx.storageObject.create({
                data: {
                    userId,
                    provider: storedAsset.provider,
                    bucket: storedAsset.bucket,
                    key: storedAsset.key,
                    url: storedAsset.url,
                    mimeType: storedAsset.mimeType,
                    byteSize: storedAsset.byteSize,
                    checksum: storedAsset.checksum,
                },
            })
            : null;
        const createdAsset = await tx.asset.create({
            data: {
                userId: prediction.userId,
                projectId: prediction.projectId,
                predictionId: prediction.id,
                storageObjectId: storageObject?.id,
                url: storedAsset?.url || outputUrl,
                type,
                fileSize: storedAsset?.byteSize,
            },
        });
        if (storedAsset) {
            await tx.user.update({
                where: { id: userId },
                data: { storageUsageBytes: { increment: storedAsset.byteSize } },
            });
        }
        return createdAsset;
    });
    await thumbnail_queue_service_1.thumbnailQueueService.add(asset.id);
}
async function storeExistingAssetIfNeeded(asset) {
    if (!asset.userId || !storage_service_1.storageService.isConfigured()) {
        return false;
    }
    const userId = asset.userId;
    const storedAsset = await storage_service_1.storageService.storeRemoteAsset({
        sourceUrl: asset.url,
        userId,
        predictionId: asset.predictionId || asset.id,
        assetType: asset.type,
    });
    if (!storedAsset) {
        return false;
    }
    await prisma.$transaction(async (tx) => {
        const storageObject = await tx.storageObject.create({
            data: {
                userId,
                provider: storedAsset.provider,
                bucket: storedAsset.bucket,
                key: storedAsset.key,
                url: storedAsset.url,
                mimeType: storedAsset.mimeType,
                byteSize: storedAsset.byteSize,
                checksum: storedAsset.checksum,
            },
        });
        await tx.asset.update({
            where: { id: asset.id },
            data: {
                storageObjectId: storageObject.id,
                url: storedAsset.url,
                fileSize: storedAsset.byteSize,
            },
        });
        await tx.user.update({
            where: { id: userId },
            data: { storageUsageBytes: { increment: storedAsset.byteSize } },
        });
    });
    await thumbnail_queue_service_1.thumbnailQueueService.add(asset.id);
    return true;
}
