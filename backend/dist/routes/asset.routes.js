"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const storage_service_1 = require("../services/storage.service");
const queue_service_1 = require("../services/queue.service");
const video_packaging_service_1 = require("../services/video-packaging.service");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
function isAssetDeleteEnabledForUser(email) {
    if (process.env.ENABLE_ASSET_DELETE === 'true')
        return true;
    const admins = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    return admins.includes(email.toLowerCase());
}
// GET /api/v1/assets
router.get('/', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('assets:read'), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : undefined;
        if (projectId) {
            const project = await prisma.project.findFirst({
                where: { id: projectId, userId: user.id },
                select: { id: true },
            });
            if (!project) {
                res.status(404).json({ error: 'Project not found' });
                return;
            }
        }
        // Older direct uploads predate Asset creation. Link them lazily so they
        // become reusable without copying or re-uploading the underlying object.
        const orphanedStorageObjects = await prisma.storageObject.findMany({
            where: {
                userId: user.id,
                asset: null,
                thumbnailForAsset: null,
                mimeType: { not: null },
            },
            select: { id: true, url: true, mimeType: true, byteSize: true },
        });
        if (orphanedStorageObjects.length) {
            await prisma.asset.createMany({
                data: orphanedStorageObjects.map((object) => ({
                    userId: user.id,
                    storageObjectId: object.id,
                    url: object.url,
                    type: object.mimeType?.startsWith('image/')
                        ? 'image'
                        : object.mimeType?.startsWith('video/')
                            ? 'video'
                            : 'audio',
                    thumbnailUrl: object.mimeType?.startsWith('image/') ? object.url : null,
                    fileSize: object.byteSize,
                })),
                skipDuplicates: true,
            });
        }
        const assets = await prisma.asset.findMany({
            where: {
                userId: user.id,
                ...(projectId ? { projectId } : {}),
            },
            include: {
                storageObject: {
                    select: {
                        provider: true,
                        mimeType: true,
                        byteSize: true,
                    },
                },
                prediction: {
                    select: {
                        prompt: true,
                        model: true,
                        workflow: true,
                        variationGroupId: true,
                        variationIndex: true,
                        variationCount: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(assets);
    }
    catch (error) {
        console.error('Fetch assets error:', error);
        res.status(500).json({ error: 'Failed retrieving assets library' });
    }
});
// POST /api/v1/assets/:id/favorite
router.post('/:id/favorite', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('assets:write'), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { id } = req.params;
        const asset = await prisma.asset.findFirst({
            where: { id, userId: user.id },
        });
        if (!asset) {
            res.status(404).json({ error: 'Asset not found' });
            return;
        }
        const updatedAsset = await prisma.asset.update({
            where: { id },
            data: { isFavorite: !asset.isFavorite },
        });
        res.json(updatedAsset);
    }
    catch (error) {
        console.error('Toggle favorite asset error:', error);
        res.status(500).json({ error: 'Failed toggling asset favorite state' });
    }
});
async function findOwnedDurableVideoAsset(id, userId) {
    return prisma.asset.findFirst({
        where: { id, userId, type: 'video', storageObjectId: { not: null } },
        include: {
            prediction: { select: { prompt: true, workflow: true, model: true } },
            project: { select: { id: true, name: true } },
        },
    });
}
// POST /api/v1/assets/:id/packaging/ideas
router.post('/:id/packaging/ideas', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('assets:read'), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const asset = await findOwnedDurableVideoAsset(req.params.id, user.id);
        if (!asset) {
            res.status(404).json({ error: 'Video asset not found' });
            return;
        }
        const context = [
            typeof req.body?.context === 'string' ? req.body.context : '',
            asset.prediction?.prompt || '',
            asset.project?.name ? `Project: ${asset.project.name}` : '',
        ].filter(Boolean).join(' ');
        res.json((0, video_packaging_service_1.generateVideoPackagingIdeas)(context));
    }
    catch (error) {
        console.error('Video packaging ideas error:', error);
        res.status(500).json({ error: 'Failed generating packaging ideas' });
    }
});
// POST /api/v1/assets/:id/packaging/thumbnails
router.post('/:id/packaging/thumbnails', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('assets:write'), (0, rate_limit_middleware_1.rateLimit)('generation'), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const asset = await findOwnedDurableVideoAsset(req.params.id, user.id);
        if (!asset) {
            res.status(404).json({ error: 'Video asset not found' });
            return;
        }
        const times = await (0, video_packaging_service_1.thumbnailCandidateTimes)(asset.url, req.body?.times);
        const predictions = [];
        for (let index = 0; index < times.length; index++) {
            const time = times[index];
            const prediction = await prisma.prediction.create({
                data: {
                    userId: user.id,
                    projectId: asset.projectId,
                    workflow: 'thumbnail-stills',
                    model: 'local/ffmpeg-thumbnail-stills',
                    prompt: `Thumbnail still at ${time}s`,
                    inputParams: {
                        source_asset_id: asset.id,
                        source_url: asset.url,
                        time_seconds: time,
                        index: index + 1,
                    },
                    creditCost: 0,
                    status: 'processing',
                },
            });
            predictions.push({ id: prediction.id, status: prediction.status, time_seconds: time });
            await queue_service_1.queueService.addLocalProcessingJob({ kind: 'local', predictionId: prediction.id });
        }
        res.status(202).json({ predictions, credits_charged: 0 });
    }
    catch (error) {
        console.error('Video thumbnail stills error:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed creating thumbnail stills' });
    }
});
// POST /api/v1/assets/:id/packaging/title-overlay
router.post('/:id/packaging/title-overlay', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('assets:write'), (0, rate_limit_middleware_1.rateLimit)('generation'), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const asset = await findOwnedDurableVideoAsset(req.params.id, user.id);
        if (!asset) {
            res.status(404).json({ error: 'Video asset not found' });
            return;
        }
        const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
        const subtitle = typeof req.body?.subtitle === 'string' ? req.body.subtitle.trim() : '';
        if (!title) {
            res.status(400).json({ error: 'Title is required' });
            return;
        }
        const prediction = await prisma.prediction.create({
            data: {
                userId: user.id,
                projectId: asset.projectId,
                workflow: 'title-overlay',
                model: 'local/ffmpeg-title-overlay',
                prompt: title,
                inputParams: {
                    source_asset_id: asset.id,
                    source_url: asset.url,
                    title,
                    subtitle,
                },
                creditCost: 0,
                status: 'processing',
            },
        });
        await queue_service_1.queueService.addLocalProcessingJob({ kind: 'local', predictionId: prediction.id });
        res.status(202).json({ id: prediction.id, status: prediction.status, output_url: prediction.outputUrl, credits_charged: 0 });
    }
    catch (error) {
        console.error('Video title overlay error:', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed creating title overlay' });
    }
});
// DELETE /api/v1/assets/:id
//
// Hidden cleanup endpoint. There is intentionally no global Library delete
// button yet; this is for owner/admin cleanup through a direct API call.
router.delete('/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('assets:write'), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (req.authType !== 'jwt') {
            res.status(403).json({ error: 'Asset deletion requires an interactive account session' });
            return;
        }
        if (!isAssetDeleteEnabledForUser(user.email)) {
            res.status(403).json({ error: 'Asset deletion is restricted' });
            return;
        }
        const { id } = req.params;
        const asset = await prisma.asset.findFirst({
            where: { id, userId: user.id },
            include: {
                storageObject: { select: { id: true, key: true, byteSize: true } },
                thumbnailStorageObject: { select: { id: true, key: true, byteSize: true } },
            },
        });
        if (!asset) {
            res.status(404).json({ error: 'Asset not found' });
            return;
        }
        const storageObjects = [asset.storageObject, asset.thumbnailStorageObject]
            .filter((object) => Boolean(object));
        const storageBytes = storageObjects.reduce((total, object) => total + Math.max(0, object.byteSize || 0), 0);
        await prisma.$transaction(async (tx) => {
            await tx.brandKitAsset.deleteMany({ where: { assetId: asset.id } });
            await tx.asset.delete({ where: { id: asset.id } });
            for (const object of storageObjects) {
                await tx.storageObject.delete({ where: { id: object.id } });
            }
            if (storageBytes > 0) {
                const account = await tx.user.findUnique({
                    where: { id: user.id },
                    select: { storageUsageBytes: true },
                });
                await tx.user.update({
                    where: { id: user.id },
                    data: { storageUsageBytes: Math.max(0, (account?.storageUsageBytes || 0) - storageBytes) },
                });
            }
        });
        for (const object of storageObjects) {
            if (!object.key)
                continue;
            try {
                await storage_service_1.storageService.deleteObject(object.key);
            }
            catch (error) {
                console.error(`Failed deleting storage object ${object.key} for asset ${asset.id}:`, error);
            }
        }
        res.status(204).send();
    }
    catch (error) {
        console.error('Delete asset error:', error);
        res.status(500).json({ error: 'Failed deleting asset' });
    }
});
exports.default = router;
