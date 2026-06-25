"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// GET /api/v1/assets
router.get('/', auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const assets = await prisma.asset.findMany({
            where: { userId: user.id },
            include: {
                prediction: {
                    select: {
                        prompt: true,
                        model: true,
                        workflow: true,
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
router.post('/:id/favorite', auth_middleware_1.authMiddleware, async (req, res) => {
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
exports.default = router;
