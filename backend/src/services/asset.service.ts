import { Prisma, PrismaClient } from '@prisma/client';
import { storageService } from './storage.service';
import { thumbnailQueueService } from './thumbnail-queue.service';

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

  await thumbnailQueueService.add(asset.id);
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

  await thumbnailQueueService.add(asset.id);

  return true;
}
