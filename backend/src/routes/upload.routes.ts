import { Router, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest, requireScope } from '../middleware/auth.middleware';
import { storageService } from '../services/storage.service';
import { rateLimit } from '../middleware/rate-limit.middleware';

const router = Router();
const prisma = new PrismaClient();
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const allowedMimeTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error('Unsupported file type'));
      return;
    }
    callback(null, true);
  },
});

function mediaKind(mimeType: string): 'image' | 'video' | 'audio' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'audio';
}

function maximumBytes(kind: 'image' | 'video' | 'audio'): number {
  return kind === 'image' ? 10 * 1024 * 1024 : kind === 'audio' ? 50 * 1024 * 1024 : MAX_UPLOAD_BYTES;
}

router.post('/presign', authMiddleware, requireScope('uploads:write'), rateLimit('upload'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!storageService.isConfigured()) {
      res.status(503).json({ error: 'Durable storage is not configured' });
      return;
    }
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 255) : '';
    const mimeType = typeof req.body.mime_type === 'string' ? req.body.mime_type.trim().toLowerCase() : '';
    const byteSize = Number(req.body.byte_size);
    if (!name || !allowedMimeTypes.has(mimeType) || !Number.isInteger(byteSize) || byteSize <= 0) {
      res.status(400).json({ error: 'Valid name, MIME type, and file size are required' });
      return;
    }
    const kind = mediaKind(mimeType);
    if (byteSize > maximumBytes(kind)) {
      res.status(413).json({ error: `${kind} upload exceeds the ${maximumBytes(kind) / 1024 / 1024}MB limit` });
      return;
    }
    const account = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { storageUsageBytes: true, storageLimitBytes: true },
    });
    const pendingWindow = { gte: new Date(Date.now() - 60 * 60 * 1000) };
    const [pendingCount, pendingBytes] = await Promise.all([
      prisma.storageObject.count({
        where: { userId: req.user.id, mimeType: null, createdAt: pendingWindow },
      }),
      prisma.storageObject.aggregate({
        where: { userId: req.user.id, mimeType: null, createdAt: pendingWindow },
        _sum: { byteSize: true },
      }),
    ]);
    const reservedBytes = BigInt(pendingBytes._sum.byteSize || 0);
    if (!account || BigInt(account.storageUsageBytes) + reservedBytes + BigInt(byteSize) > account.storageLimitBytes) {
      res.status(403).json({ error: 'Storage quota exceeded. Delete assets or upgrade your plan.' });
      return;
    }
    if (pendingCount >= 20) {
      res.status(429).json({ error: 'Too many unfinished uploads. Complete existing uploads or try again later.' });
      return;
    }

    const objectId = randomUUID();
    const signed = await storageService.createPresignedUpload({
      userId: req.user.id,
      objectId,
      mimeType,
      assetType: kind,
      originalName: name,
    });
    if (!signed) {
      res.status(503).json({ error: 'Durable storage is not configured' });
      return;
    }
    await prisma.storageObject.create({
      data: {
        id: objectId,
        userId: req.user.id,
        provider: signed.provider,
        bucket: signed.bucket,
        key: signed.key,
        url: signed.url,
        mimeType: null,
        byteSize,
        checksum: `pending:${mimeType}`,
      },
    });
    res.status(201).json({
      id: objectId,
      upload_url: signed.uploadUrl,
      expires_in: signed.expiresIn,
      headers: { 'Content-Type': mimeType },
    });
  } catch (error) {
    console.error('Create direct upload failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed preparing direct upload' });
  }
});

router.post('/complete', authMiddleware, requireScope('uploads:write'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const id = typeof req.body.id === 'string' ? req.body.id : '';
    const pending = await prisma.storageObject.findFirst({
      where: { id, userId: req.user.id },
      include: { asset: true },
    });
    if (!pending?.key) {
      res.status(404).json({ error: 'Pending upload not found' });
      return;
    }
    if (pending.asset && pending.mimeType) {
      res.json({
        id: pending.id, asset_id: pending.asset.id, url: pending.url,
        mime_type: pending.mimeType, byte_size: pending.byteSize,
        kind: mediaKind(pending.mimeType),
      });
      return;
    }
    const expectedMimeType = pending.checksum?.startsWith('pending:') ? pending.checksum.slice(8) : '';
    const inspected = await storageService.inspectObject(pending.key);
    if (!inspected || !inspected.byteSize || inspected.mimeType !== expectedMimeType || !allowedMimeTypes.has(inspected.mimeType || '')) {
      res.status(400).json({ error: 'Uploaded object does not match the prepared file type or is empty' });
      return;
    }
    const kind = mediaKind(inspected.mimeType!);
    if (inspected.byteSize > maximumBytes(kind)) {
      res.status(413).json({ error: `${kind} upload exceeds the ${maximumBytes(kind) / 1024 / 1024}MB limit` });
      return;
    }
    const account = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { storageUsageBytes: true, storageLimitBytes: true },
    });
    if (!account || BigInt(account.storageUsageBytes) + BigInt(inspected.byteSize) > account.storageLimitBytes) {
      res.status(403).json({ error: 'Storage quota exceeded. Delete the upload or upgrade your plan.' });
      return;
    }
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const storageObject = await tx.storageObject.update({
        where: { id: pending.id },
        data: { mimeType: inspected.mimeType, byteSize: inspected.byteSize, checksum: null },
      });
      const asset = await tx.asset.create({
        data: {
          userId: req.user!.id,
          storageObjectId: storageObject.id,
          url: storageObject.url,
          type: kind,
          thumbnailUrl: kind === 'image' ? storageObject.url : null,
          fileSize: inspected.byteSize,
        },
      });
      await tx.user.update({
        where: { id: req.user!.id },
        data: { storageUsageBytes: { increment: inspected.byteSize } },
      });
      return { storageObject, asset };
    });
    res.status(201).json({
      id: result.storageObject.id,
      asset_id: result.asset.id,
      url: result.storageObject.url,
      mime_type: result.storageObject.mimeType,
      byte_size: result.storageObject.byteSize,
      kind,
    });
  } catch (error) {
    console.error('Complete direct upload failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed completing direct upload' });
  }
});

router.post('/', authMiddleware, requireScope('uploads:write'), rateLimit('upload'), upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.file) {
      res.status(req.user ? 400 : 401).json({ error: req.user ? 'A file is required' : 'Unauthorized' });
      return;
    }
    if (!storageService.isConfigured()) {
      res.status(503).json({ error: 'Durable storage is not configured' });
      return;
    }

    const kind = mediaKind(req.file.mimetype);
    const kindLimit = maximumBytes(kind);
    if (req.file.size > kindLimit) {
      res.status(413).json({ error: `${kind} upload exceeds the ${kindLimit / 1024 / 1024}MB limit` });
      return;
    }

    const objectId = randomUUID();
    const stored = await storageService.storeBuffer({
      buffer: req.file.buffer,
      userId: req.user.id,
      mimeType: req.file.mimetype,
      assetType: kind,
      namespace: 'uploads',
      objectId,
      originalName: req.file.originalname,
      metadata: { source: 'marsfield-upload', purpose: String(req.body.purpose || 'generation-reference') },
    });
    if (!stored) {
      res.status(503).json({ error: 'Durable storage is not configured' });
      return;
    }

    const { storageObject, asset } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.storageObject.create({
        data: {
          id: objectId,
          userId: req.user!.id,
          provider: stored.provider,
          bucket: stored.bucket,
          key: stored.key,
          url: stored.url,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          checksum: stored.checksum,
        },
      });
      await tx.user.update({
        where: { id: req.user!.id },
        data: { storageUsageBytes: { increment: stored.byteSize } },
      });
      const asset = await tx.asset.create({
        data: {
          userId: req.user!.id,
          storageObjectId: created.id,
          url: created.url,
          type: kind,
          thumbnailUrl: kind === 'image' ? created.url : null,
          fileSize: created.byteSize,
        },
      });
      return { storageObject: created, asset };
    });

    res.status(201).json({
      id: storageObject.id,
      asset_id: asset.id,
      url: storageObject.url,
      mime_type: storageObject.mimeType,
      byte_size: storageObject.byteSize,
      kind,
      name: req.file.originalname,
    });
  } catch (error) {
    console.error('Upload failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed uploading file' });
  }
});

router.use((error: unknown, _req: AuthenticatedRequest, res: Response, _next: unknown) => {
  if (error instanceof multer.MulterError) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message });
    return;
  }
  res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid upload' });
});

export default router;
