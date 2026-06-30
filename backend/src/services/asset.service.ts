import { Prisma, PrismaClient } from '@prisma/client';
import { storageService } from './storage.service';
import { createThumbnail } from './thumbnail.service';

const prisma = new PrismaClient();

type PredictionForAsset = {
  id: string;
  userId: string | null;
  projectId: string | null;
  workflow: string;
};

type AssetForStorageBackfill = {
  id: string;
  userId: string | null;
  predictionId: string | null;
  url: string;
  type: string;
};

export async function createAssetForPrediction(
  prediction: PredictionForAsset,
  outputUrl: string
): Promise<void> {
  if (!prediction.userId) return;
  const userId = prediction.userId;

  const existingAsset = await prisma.asset.findFirst({
    where: { predictionId: prediction.id },
    select: { id: true },
  });

  if (existingAsset) return;

  const type = prediction.workflow === 'text-to-image' ? 'image' : 'video';
  let storedAsset = null;

  try {
    storedAsset = await storageService.storeRemoteAsset({
      sourceUrl: outputUrl,
      userId: prediction.userId,
      predictionId: prediction.id,
      assetType: type,
    });
  } catch (error) {
    console.error('Generated asset storage failed; falling back to provider URL:', error);
  }

  const asset = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

export async function createThumbnailForAsset(asset: {
  id: string;
  userId: string | null;
  url: string;
  type: string;
  thumbnailUrl: string | null;
}): Promise<boolean> {
  if (!asset.userId || asset.thumbnailUrl) return false;
  try {
    const thumbnail = await createThumbnail({
      sourceUrl: asset.url,
      type: asset.type,
      userId: asset.userId,
      assetId: asset.id,
    });
    if (!thumbnail) return false;
    await prisma.$transaction([
      prisma.asset.update({ where: { id: asset.id }, data: { thumbnailUrl: thumbnail.url } }),
      prisma.user.update({ where: { id: asset.userId }, data: { storageUsageBytes: { increment: thumbnail.byteSize } } }),
    ]);
    return true;
  } catch (error) {
    console.error(`Thumbnail generation failed for asset ${asset.id}:`, error instanceof Error ? error.message : error);
    return false;
  }
}

export async function storeExistingAssetIfNeeded(asset: AssetForStorageBackfill): Promise<boolean> {
  if (!asset.userId || !storageService.isConfigured()) {
    return false;
  }
  const userId = asset.userId;

  const storedAsset = await storageService.storeRemoteAsset({
    sourceUrl: asset.url,
    userId,
    predictionId: asset.predictionId || asset.id,
    assetType: asset.type,
  });

  if (!storedAsset) {
    return false;
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
