"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const storage_service_1 = require("../services/storage.service");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const allowedMimeTypes = new Set([
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
]);
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { files: 1, fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (_req, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            callback(new Error('Unsupported file type'));
            return;
        }
        callback(null, true);
    },
});
function mediaKind(mimeType) {
    if (mimeType.startsWith('image/'))
        return 'image';
    if (mimeType.startsWith('video/'))
        return 'video';
    return 'audio';
}
function maximumBytes(kind) {
    return kind === 'image' ? 10 * 1024 * 1024 : kind === 'audio' ? 50 * 1024 * 1024 : MAX_UPLOAD_BYTES;
}
async function reserveStorage(userId, byteSize) {
    const updated = await prisma.$executeRaw `
    UPDATE users
    SET storage_usage_bytes = storage_usage_bytes + ${BigInt(byteSize)}
    WHERE id = ${userId}
      AND storage_usage_bytes + ${BigInt(byteSize)} <= storage_limit_bytes
  `;
    return updated === 1;
}
async function releaseStorage(userId, byteSize) {
    await prisma.$executeRaw `
    UPDATE users
    SET storage_usage_bytes = GREATEST(0, storage_usage_bytes - ${BigInt(byteSize)})
    WHERE id = ${userId}
  `;
}
router.post('/presign', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('uploads:write'), (0, rate_limit_middleware_1.rateLimit)('upload'), async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (!storage_service_1.storageService.isConfigured()) {
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
        const objectId = (0, crypto_1.randomUUID)();
        const signed = await storage_service_1.storageService.createPresignedUpload({
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
    }
    catch (error) {
        console.error('Create direct upload failed:', error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Failed preparing direct upload' });
    }
});
router.post('/complete', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('uploads:write'), async (req, res) => {
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
        const inspected = await storage_service_1.storageService.inspectObject(pending.key);
        if (!inspected || !inspected.byteSize || inspected.mimeType !== expectedMimeType || !allowedMimeTypes.has(inspected.mimeType || '')) {
            res.status(400).json({ error: 'Uploaded object does not match the prepared file type or is empty' });
            return;
        }
        const kind = mediaKind(inspected.mimeType);
        if (inspected.byteSize > maximumBytes(kind)) {
            res.status(413).json({ error: `${kind} upload exceeds the ${maximumBytes(kind) / 1024 / 1024}MB limit` });
            return;
        }
        if (!await reserveStorage(req.user.id, inspected.byteSize)) {
            res.status(403).json({ error: 'Storage quota exceeded. Delete the upload or upgrade your plan.' });
            return;
        }
        let result;
        try {
            result = await prisma.$transaction(async (tx) => {
                const claimed = await tx.storageObject.updateMany({
                    where: { id: pending.id, userId: req.user.id, mimeType: null },
                    data: { mimeType: inspected.mimeType, byteSize: inspected.byteSize, checksum: null },
                });
                if (claimed.count !== 1)
                    throw new Error('Upload was already completed');
                const storageObject = await tx.storageObject.findUniqueOrThrow({ where: { id: pending.id } });
                const asset = await tx.asset.create({
                    data: {
                        userId: req.user.id,
                        storageObjectId: storageObject.id,
                        url: storageObject.url,
                        type: kind,
                        thumbnailUrl: kind === 'image' ? storageObject.url : null,
                        fileSize: inspected.byteSize,
                    },
                });
                return { storageObject, asset };
            });
        }
        catch (error) {
            await releaseStorage(req.user.id, inspected.byteSize);
            throw error;
        }
        res.status(201).json({
            id: result.storageObject.id,
            asset_id: result.asset.id,
            url: result.storageObject.url,
            mime_type: result.storageObject.mimeType,
            byte_size: result.storageObject.byteSize,
            kind,
        });
    }
    catch (error) {
        console.error('Complete direct upload failed:', error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Failed completing direct upload' });
    }
});
router.post('/', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('uploads:write'), (0, rate_limit_middleware_1.rateLimit)('upload'), upload.single('file'), async (req, res) => {
    try {
        if (!req.user || !req.file) {
            res.status(req.user ? 400 : 401).json({ error: req.user ? 'A file is required' : 'Unauthorized' });
            return;
        }
        if (!storage_service_1.storageService.isConfigured()) {
            res.status(503).json({ error: 'Durable storage is not configured' });
            return;
        }
        const kind = mediaKind(req.file.mimetype);
        const kindLimit = maximumBytes(kind);
        if (req.file.size > kindLimit) {
            res.status(413).json({ error: `${kind} upload exceeds the ${kindLimit / 1024 / 1024}MB limit` });
            return;
        }
        if (!await reserveStorage(req.user.id, req.file.size)) {
            res.status(403).json({ error: 'Storage quota exceeded. Delete assets or upgrade your plan.' });
            return;
        }
        const objectId = (0, crypto_1.randomUUID)();
        let stored;
        try {
            stored = await storage_service_1.storageService.storeBuffer({
                buffer: req.file.buffer,
                userId: req.user.id,
                mimeType: req.file.mimetype,
                assetType: kind,
                namespace: 'uploads',
                objectId,
                originalName: req.file.originalname,
                metadata: { source: 'marsfield-upload', purpose: String(req.body.purpose || 'generation-reference') },
            });
            if (!stored)
                throw new Error('Durable storage is not configured');
        }
        catch (error) {
            await releaseStorage(req.user.id, req.file.size);
            throw error;
        }
        let storageObject;
        let asset;
        try {
            ({ storageObject, asset } = await prisma.$transaction(async (tx) => {
                const created = await tx.storageObject.create({
                    data: {
                        id: objectId,
                        userId: req.user.id,
                        provider: stored.provider,
                        bucket: stored.bucket,
                        key: stored.key,
                        url: stored.url,
                        mimeType: stored.mimeType,
                        byteSize: stored.byteSize,
                        checksum: stored.checksum,
                    },
                });
                const asset = await tx.asset.create({
                    data: {
                        userId: req.user.id,
                        storageObjectId: created.id,
                        url: created.url,
                        type: kind,
                        thumbnailUrl: kind === 'image' ? created.url : null,
                        fileSize: created.byteSize,
                    },
                });
                return { storageObject: created, asset };
            }));
        }
        catch (error) {
            await Promise.allSettled([
                releaseStorage(req.user.id, req.file.size),
                stored.key ? storage_service_1.storageService.deleteObject(stored.key) : Promise.resolve(false),
            ]);
            throw error;
        }
        res.status(201).json({
            id: storageObject.id,
            asset_id: asset.id,
            url: storageObject.url,
            mime_type: storageObject.mimeType,
            byte_size: storageObject.byteSize,
            kind,
            name: req.file.originalname,
        });
    }
    catch (error) {
        console.error('Upload failed:', error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Failed uploading file' });
    }
});
router.use((error, _req, res, _next) => {
    if (error instanceof multer_1.default.MulterError) {
        res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message });
        return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid upload' });
});
exports.default = router;
