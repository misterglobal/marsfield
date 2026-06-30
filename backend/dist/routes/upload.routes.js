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
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const allowedMimeTypes = new Set([
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/webm',
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
router.post('/', auth_middleware_1.authMiddleware, upload.single('file'), async (req, res) => {
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
        const kindLimit = kind === 'image' ? 10 * 1024 * 1024 : kind === 'audio' ? 50 * 1024 * 1024 : MAX_UPLOAD_BYTES;
        if (req.file.size > kindLimit) {
            res.status(413).json({ error: `${kind} upload exceeds the ${kindLimit / 1024 / 1024}MB limit` });
            return;
        }
        const objectId = (0, crypto_1.randomUUID)();
        const stored = await storage_service_1.storageService.storeBuffer({
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
        const storageObject = await prisma.$transaction(async (tx) => {
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
            await tx.user.update({
                where: { id: req.user.id },
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
