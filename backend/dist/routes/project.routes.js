"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// GET /api/v1/projects
router.get('/', auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const projects = await prisma.project.findMany({
            where: { userId: user.id },
            include: {
                _count: {
                    select: { assets: true, predictions: true, scenes: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(projects);
    }
    catch (error) {
        console.error('Fetch projects error:', error);
        res.status(500).json({ error: 'Failed retrieving projects' });
    }
});
// GET /api/v1/projects/:id
router.get('/:id', auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const project = await prisma.project.findFirst({
            where: { id: req.params.id, userId: user.id },
            include: {
                scenes: {
                    orderBy: { index: 'asc' },
                    include: {
                        predictions: {
                            orderBy: { createdAt: 'desc' },
                            take: 5,
                            select: {
                                id: true,
                                status: true,
                                outputUrl: true,
                                model: true,
                                workflow: true,
                                prompt: true,
                                createdAt: true,
                            },
                        },
                    },
                },
                _count: {
                    select: { assets: true, predictions: true, scenes: true },
                },
            },
        });
        if (!project) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
        res.json(project);
    }
    catch (error) {
        console.error('Fetch project error:', error);
        res.status(500).json({ error: 'Failed retrieving project' });
    }
});
// POST /api/v1/projects
router.post('/', auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
        if (!name || name.length > 120) {
            res.status(400).json({ error: 'Project name is required and must be under 120 characters' });
            return;
        }
        const project = await prisma.project.create({
            data: {
                userId: user.id,
                name,
                description,
            },
        });
        res.status(201).json(project);
    }
    catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ error: 'Failed creating project' });
    }
});
// POST /api/v1/projects/:id/storyboard-scenes
router.post('/:id/storyboard-scenes', auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const project = await prisma.project.findFirst({
            where: { id: req.params.id, userId: user.id },
            select: { id: true },
        });
        if (!project) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
        const index = Number(req.body.index);
        if (!Number.isInteger(index) || index < 0) {
            res.status(400).json({ error: 'Storyboard scene index must be a non-negative integer' });
            return;
        }
        const scene = await prisma.storyboardScene.upsert({
            where: {
                projectId_index: {
                    projectId: project.id,
                    index,
                },
            },
            create: {
                projectId: project.id,
                index,
                title: typeof req.body.title === 'string' ? req.body.title : null,
                prompt: typeof req.body.prompt === 'string' ? req.body.prompt : null,
                notes: typeof req.body.notes === 'string' ? req.body.notes : null,
                durationSeconds: Number.isInteger(req.body.duration_seconds) ? req.body.duration_seconds : null,
            },
            update: {
                title: typeof req.body.title === 'string' ? req.body.title : undefined,
                prompt: typeof req.body.prompt === 'string' ? req.body.prompt : undefined,
                notes: typeof req.body.notes === 'string' ? req.body.notes : undefined,
                durationSeconds: Number.isInteger(req.body.duration_seconds) ? req.body.duration_seconds : undefined,
            },
        });
        res.status(201).json(scene);
    }
    catch (error) {
        console.error('Upsert storyboard scene error:', error);
        res.status(500).json({ error: 'Failed saving storyboard scene' });
    }
});
exports.default = router;
