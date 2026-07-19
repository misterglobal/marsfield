"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const youtube_planner_service_1 = require("../services/youtube-planner.service");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// GET /api/v1/youtube/productions
router.get('/productions', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:read'), async (req, res) => {
    try {
        if (!req.user)
            return void res.status(401).json({ error: 'Unauthorized' });
        const productions = await prisma.youtubeProduction.findMany({
            where: { userId: req.user.id },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                topic: true,
                audience: true,
                targetDurationMin: true,
                status: true,
                estimatedCreditsMin: true,
                projectId: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        res.json(productions);
    }
    catch (error) {
        console.error('Fetch YouTube productions error:', error);
        res.status(500).json({ error: 'Failed retrieving YouTube productions' });
    }
});
// GET /api/v1/youtube/productions/:id
router.get('/productions/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:read'), async (req, res) => {
    try {
        if (!req.user)
            return void res.status(401).json({ error: 'Unauthorized' });
        const production = await prisma.youtubeProduction.findFirst({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (!production)
            return void res.status(404).json({ error: 'Production not found' });
        res.json(production);
    }
    catch (error) {
        console.error('Fetch YouTube production error:', error);
        res.status(500).json({ error: 'Failed retrieving YouTube production' });
    }
});
// POST /api/v1/youtube/productions
router.post('/productions', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        if (!req.user)
            return void res.status(401).json({ error: 'Unauthorized' });
        const topic = typeof req.body.topic === 'string' ? req.body.topic.trim() : '';
        const audience = typeof req.body.audience === 'string' ? req.body.audience.trim() : undefined;
        const targetDurationMin = Number(req.body.target_duration_min || 8);
        const angleCount = Number(req.body.angle_count || 8);
        if (topic.length < 3 || topic.length > 180) {
            return void res.status(400).json({ error: 'Topic is required and must be under 180 characters' });
        }
        const plan = (0, youtube_planner_service_1.planYoutubeProduction)({ topic, audience, targetDurationMin, angleCount });
        const production = await prisma.youtubeProduction.create({
            data: {
                userId: req.user.id,
                topic: plan.topic,
                audience: plan.audience,
                targetDurationMin: plan.targetDurationMin,
                status: 'planned',
                research: plan.research,
                strategy: plan.strategy,
                script: plan.script,
                storyboard: plan.storyboard,
                seo: plan.seo,
                thumbnailConcepts: plan.thumbnailConcepts,
                estimatedCreditsMin: plan.estimatedCreditsMin,
            },
        });
        await prisma.usageEvent.create({
            data: {
                userId: req.user.id,
                eventType: 'youtube_planner_dry_run',
                credits: 0,
                metadata: { production_id: production.id, topic: plan.topic },
            },
        });
        res.status(201).json({ ...production, credits_charged: 0 });
    }
    catch (error) {
        console.error('Create YouTube production error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed planning YouTube production' });
    }
});
// POST /api/v1/youtube/productions/:id/create-project
router.post('/productions/:id/create-project', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        if (!req.user)
            return void res.status(401).json({ error: 'Unauthorized' });
        const production = await prisma.youtubeProduction.findFirst({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (!production)
            return void res.status(404).json({ error: 'Production not found' });
        if (production.projectId)
            return void res.status(409).json({ error: 'Production already has a linked project' });
        const storyboard = Array.isArray(production.storyboard) ? production.storyboard : [];
        if (!storyboard.length)
            return void res.status(400).json({ error: 'Production has no storyboard scenes' });
        const project = await prisma.$transaction(async (tx) => {
            const createdProject = await tx.project.create({
                data: {
                    userId: req.user.id,
                    name: `YouTube: ${production.topic}`.slice(0, 120),
                    description: `Dry-run YouTube production plan for ${production.topic}`,
                },
            });
            await tx.storyboardScene.createMany({
                data: storyboard.slice(0, 24).map((scene, index) => ({
                    projectId: createdProject.id,
                    index,
                    title: typeof scene.title === 'string' ? scene.title : `Scene ${index + 1}`,
                    prompt: typeof scene.imagePrompt === 'string' ? scene.imagePrompt : typeof scene.sceneDescription === 'string' ? scene.sceneDescription : null,
                    notes: typeof scene.sceneDescription === 'string' ? scene.sceneDescription : null,
                    durationSeconds: Number.isInteger(scene.durationSeconds) ? scene.durationSeconds : null,
                })),
            });
            await tx.youtubeProduction.update({
                where: { id: production.id },
                data: { projectId: createdProject.id, status: 'project_created' },
            });
            return createdProject;
        });
        res.status(201).json({ project_id: project.id, project });
    }
    catch (error) {
        console.error('Create project from YouTube production error:', error);
        res.status(500).json({ error: 'Failed creating project from YouTube production' });
    }
});
exports.default = router;
