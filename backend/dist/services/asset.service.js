"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAssetForPrediction = createAssetForPrediction;
exports.createThumbnailForAsset = createThumbnailForAsset;
exports.storeExistingAssetIfNeeded = storeExistingAssetIfNeeded;
const client_1 = require("@prisma/client");
const storage_service_1 = require("./storage.service");
const thumbnail_service_1 = require("./thumbnail.service");
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
    const type = prediction.workflow === 'text-to-image' ? 'image' : 'video';
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
    await createThumbnailForAsset({
        id: asset.id,
        userId,
        url: asset.url,
        type: asset.type,
        thumbnailUrl: asset.thumbnailUrl,
    });
}
async function createThumbnailForAsset(asset) {
    if (!asset.userId || asset.thumbnailUrl)
        return false;
    try {
        const thumbnail = await (0, thumbnail_service_1.createThumbnail)({
            sourceUrl: asset.url,
            type: asset.type,
            userId: asset.userId,
            assetId: asset.id,
        });
        if (!thumbnail)
            return false;
        await prisma.$transaction([
            prisma.asset.update({ where: { id: asset.id }, data: { thumbnailUrl: thumbnail.url } }),
            prisma.user.update({ where: { id: asset.userId }, data: { storageUsageBytes: { increment: thumbnail.byteSize } } }),
        ]);
        return true;
    }
    catch (error) {
        console.error(`Thumbnail generation failed for asset ${asset.id}:`, error instanceof Error ? error.message : error);
        return false;
    }
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
    await createThumbnailForAsset({ ...asset, url: storedAsset.url, thumbnailUrl: null });
    return true;
}
