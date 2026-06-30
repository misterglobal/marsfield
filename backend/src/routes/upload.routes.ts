import { Router, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { storageService } from '../services/storage.service';

const router = Router();
const prisma = new PrismaClient();
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const allowedMimeTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm',
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

router.post('/', authMiddleware, upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
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
    const kindLimit = kind === 'image' ? 10 * 1024 * 1024 : kind === 'audio' ? 50 * 1024 * 1024 : MAX_UPLOAD_BYTES;
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

    const storageObject = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
      return created;
    });

    res.status(201).json({
      id: storageObject.id,
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
