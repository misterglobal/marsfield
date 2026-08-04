"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const influencer_planner_service_1 = require("../services/influencer-planner.service");
const product_url_scanner_service_1 = require("../services/product-url-scanner.service");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const durations = new Set([5, 10, 15]);
const ratios = new Set(['9:16', '16:9', '1:1']);
const text = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const list = (value) => Array.isArray(value) ? value.map((item) => text(item, 200)).filter(Boolean).slice(0, 20) : [];
const json = (value) => value;
function influencerPrompt(name, profile, hasReferences = false) {
    const identity = hasReferences
        ? 'Use the supplied images as identity references for the same consenting adult. Preserve their recognizable facial identity, age, complexion, hair and distinguishing features without exaggeration.'
        : 'This is an original fictional person and must not resemble a celebrity or known real person.';
    return `Create one photorealistic primary reference portrait of an adult AI influencer named ${name}. The subject must clearly appear age 18 or older. ${identity}\n\nCanonical profile:\n${JSON.stringify(profile)}\n\nSingle person, waist-up portrait, neutral uncluttered background, natural realistic skin texture, clear unobstructed face, accurate anatomy, editorial social-media photography, no text, no logos, no collage, no additional people.`.slice(0, 2000);
}
function sceneData(body, index) {
    const durationSeconds = Number(body.duration_seconds);
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 15)
        throw new Error('Scene duration must be 1–15 seconds');
    return {
        index, title: text(body.title, 120) || `Scene ${index + 1}`, durationSeconds,
        location: text(body.location, 300), description: text(body.description, 1000), characterAction: text(body.character_action, 1000),
        expression: text(body.expression, 300) || null, wardrobe: text(body.wardrobe, 500), cameraFraming: text(body.camera_framing, 200),
        cameraMovement: text(body.camera_movement, 200), lighting: text(body.lighting, 300) || null,
        productVisible: Boolean(body.product_visible), dialogue: text(body.dialogue, 1000) || null, voiceover: text(body.voiceover, 1000) || null,
        onScreenText: text(body.on_screen_text, 300) || null, transition: text(body.transition, 200) || null,
    };
}
async function ownedProject(userId, id) {
    return prisma.influencerVideoProject.findFirst({ where: { id, userId }, include: { scenes: { orderBy: { index: 'asc' } }, storyboards: { orderBy: { version: 'desc' } }, videoGenerations: { orderBy: { attempt: 'desc' } }, influencerVersion: true, product: true } });
}
function storyboardLayout(sceneCount) {
    if (sceneCount === 3)
        return '3x1';
    if (sceneCount === 4)
        return '2x2';
    return '3x2';
}
function storyboardPrompt(project, visualStyle, consistency) {
    if (!project)
        throw new Error('Influencer project not found');
    const layout = storyboardLayout(project.scenes.length);
    const character = project.influencerVersion.canonicalDescription;
    const panels = project.scenes.map((scene, index) => `${index + 1}. ${scene.cameraFraming}; ${scene.location}; ${scene.characterAction}; ${scene.expression || ''}; ${scene.wardrobe}; ${scene.lighting || ''}${scene.productVisible ? '; show the referenced product accurately' : ''}.`).join('\n');
    return `Create one photorealistic ${project.scenes.length}-panel production storyboard in a ${layout} layout for a ${project.aspectRatio} social video. Panels read left-to-right, top-to-bottom and are clearly separated and numbered. Use the exact same adult fictional influencer in every panel. Character: ${character}.\n${panels}\nStyle: ${visualStyle}. Continuity: identical face, age, complexion, hair, body proportions, wardrobe, product design, colour treatment and chronological action. ${consistency} Put small scene numbers outside the visual action. No extra people, duplicated objects, captions over faces, clothing changes, invented scenes, or unreadable layout.`.slice(0, 2000);
}
function klingPrompt(project, motionInstructions) {
    const storyboard = project.storyboards.find((item) => item.approved);
    if (!storyboard)
        throw new Error('Approve a storyboard before video generation');
    const timeline = project.scenes.map((scene) => `Scene ${scene.index + 1}, ${scene.durationSeconds}s: ${scene.characterAction}. ${scene.cameraMovement}. ${scene.dialogue ? `Dialogue: ${scene.dialogue}.` : ''}${scene.voiceover ? ` Voiceover: ${scene.voiceover}.` : ''}${scene.transition ? ` Transition: ${scene.transition}.` : ''}`).join('\n');
    return `Generate one continuous ${project.durationSeconds}-second ${project.aspectRatio} social video. Use <<<image_1>>> as the approved numbered storyboard and <<<image_2>>> as the exact adult influencer identity. Follow every panel in order; each panel is one consecutive shot. Preserve the face, age, complexion, hair, body, wardrobe, product packaging and locations.\n${timeline}\nGenerate natural synchronized speech, voiceover, ambience and sound. Voice profile: ${project.influencerVersion.voiceProfile || 'natural, warm and conversational'}. Use realistic movement and premium UGC smartphone cinematography. ${motionInstructions} Do not skip, reorder, combine or invent scenes. No identity, wardrobe or product changes.`.slice(0, 2000);
}
router.get('/influencers', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:read'), async (req, res) => {
    const rows = await prisma.influencer.findMany({ where: { userId: req.user.id }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' } });
    res.json(rows);
});
router.post('/influencers', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const name = text(req.body.name, 80);
        const profile = req.body.profile;
        if (!name || !profile || typeof profile !== 'object' || Array.isArray(profile))
            return void res.status(400).json({ error: 'Name and influencer profile are required' });
        const age = Number(profile.age);
        if (!Number.isInteger(age) || age < 18 || age > 80)
            return void res.status(400).json({ error: 'Influencer age must be between 18 and 80' });
        const referenceIds = list(req.body.reference_storage_ids).slice(0, 4);
        if (referenceIds.length && req.body.reference_consent !== true)
            return void res.status(400).json({ error: 'Consent confirmation is required for uploaded people' });
        if (referenceIds.length) {
            const owned = await prisma.storageObject.count({ where: { id: { in: referenceIds }, userId: req.user.id, mimeType: { startsWith: 'image/' } } });
            if (owned !== referenceIds.length)
                return void res.status(400).json({ error: 'Influencer references must be owned image uploads' });
        }
        const created = await prisma.influencer.create({ data: { userId: req.user.id, name, profile: json(profile), canonicalDescription: text(req.body.canonical_description, 4000) || null, voiceProfile: text(req.body.voice_profile, 500) || null, referenceStorageIds: json(referenceIds), referenceConsentAt: referenceIds.length ? new Date() : null } });
        res.status(201).json({ ...created, generation_prompt: influencerPrompt(name, profile, referenceIds.length > 0), reference_storage_ids: referenceIds });
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed creating influencer' });
    }
});
router.get('/influencers/:id/generation-prompt', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:read'), async (req, res) => {
    const row = await prisma.influencer.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!row)
        return void res.status(404).json({ error: 'Influencer not found' });
    const referenceIds = Array.isArray(row.referenceStorageIds) ? row.referenceStorageIds.filter((id) => typeof id === 'string').slice(0, 4) : [];
    res.json({ prompt: influencerPrompt(row.name, row.profile, referenceIds.length > 0), reference_storage_ids: referenceIds });
});
router.post('/influencers/:id/approve', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const influencer = await prisma.influencer.findFirst({ where: { id: req.params.id, userId: req.user.id } });
        if (!influencer)
            return void res.status(404).json({ error: 'Influencer not found' });
        const prediction = await prisma.prediction.findFirst({ where: { id: text(req.body.prediction_id, 100), userId: req.user.id, workflow: 'text-to-image', model: 'google/nano-banana-2', status: 'succeeded' }, include: { assets: { where: { type: 'image' }, take: 1 } } });
        if (!prediction?.assets[0])
            return void res.status(400).json({ error: 'A completed Nano Banana 2 image is required' });
        const version = influencer.currentVersion + 1;
        const description = influencer.canonicalDescription || JSON.stringify(influencer.profile);
        const result = await prisma.$transaction(async (tx) => {
            const created = await tx.influencerVersion.create({ data: { influencerId: influencer.id, version, profile: influencer.profile, canonicalDescription: description, voiceProfile: influencer.voiceProfile, generationPrompt: prediction.prompt || '', predictionId: prediction.id, assetId: prediction.assets[0].id, imageUrl: prediction.outputUrl } });
            await tx.influencer.update({ where: { id: influencer.id }, data: { status: 'approved', primaryPredictionId: prediction.id, primaryAssetId: prediction.assets[0].id, currentVersion: version } });
            return created;
        });
        res.status(201).json(result);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed approving influencer' });
    }
});
router.get('/products', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:read'), async (req, res) => {
    res.json(await prisma.influencerProduct.findMany({ where: { userId: req.user.id }, orderBy: { updatedAt: 'desc' } }));
});
router.post('/products/scan-url', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), (0, rate_limit_middleware_1.rateLimit)('generation'), async (req, res) => {
    try {
        const url = text(req.body.url, 2000);
        if (!url)
            return void res.status(400).json({ error: 'Product URL is required' });
        res.json(await (0, product_url_scanner_service_1.scanProductUrl)(url));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed scanning product URL' });
    }
});
router.post('/products', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const name = text(req.body.name, 120);
        const ids = list(req.body.reference_storage_ids).slice(0, 8);
        if (!name)
            return void res.status(400).json({ error: 'Product name is required' });
        if (ids.length) {
            const owned = await prisma.storageObject.count({ where: { id: { in: ids }, userId: req.user.id, mimeType: { startsWith: 'image/' } } });
            if (owned !== ids.length)
                return void res.status(400).json({ error: 'Product references must be owned image uploads' });
        }
        const product = await prisma.influencerProduct.create({ data: { userId: req.user.id, name, description: text(req.body.description, 2000) || null, brandName: text(req.body.brand_name, 120) || null, approvedClaims: json(list(req.body.approved_claims)), restrictedClaims: json(list(req.body.restricted_claims)), brandColours: json(list(req.body.brand_colours)), referenceStorageIds: json(ids), primaryStorageObjectId: ids[0] || null, sourceUrl: text(req.body.source_url, 2000) || null, sourceData: req.body.source_data ? json(req.body.source_data) : client_1.Prisma.JsonNull, externalImageUrls: json(list(req.body.external_image_urls)) } });
        res.status(201).json(product);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed creating product' });
    }
});
router.get('/projects', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:read'), async (req, res) => {
    res.json(await prisma.influencerVideoProject.findMany({ where: { userId: req.user.id }, include: { influencer: true, product: true, _count: { select: { scenes: true } } }, orderBy: { updatedAt: 'desc' } }));
});
router.get('/projects/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:read'), async (req, res) => {
    const project = await ownedProject(req.user.id, req.params.id);
    if (!project)
        return void res.status(404).json({ error: 'Influencer project not found' });
    res.json(project);
});
router.post('/projects', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const influencer = await prisma.influencer.findFirst({ where: { id: text(req.body.influencer_id, 100), userId: req.user.id, status: 'approved' }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
        if (!influencer?.versions[0])
            return void res.status(400).json({ error: 'Select an approved influencer' });
        const productId = text(req.body.product_id, 100) || null;
        if (productId && !await prisma.influencerProduct.findFirst({ where: { id: productId, userId: req.user.id } }))
            return void res.status(400).json({ error: 'Product not found' });
        const durationSeconds = Number(req.body.duration_seconds);
        const aspectRatio = text(req.body.aspect_ratio, 10);
        if (!durations.has(durationSeconds) || !ratios.has(aspectRatio))
            return void res.status(400).json({ error: 'Choose a supported duration and aspect ratio' });
        const title = text(req.body.title, 120);
        const idea = text(req.body.idea, 4000);
        if (!title || !idea)
            return void res.status(400).json({ error: 'Project title and idea are required' });
        const project = await prisma.influencerVideoProject.create({ data: { userId: req.user.id, influencerId: influencer.id, influencerVersionId: influencer.versions[0].id, productId, title, idea, brief: json(req.body.brief || {}), durationSeconds, aspectRatio } });
        res.status(201).json(project);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed creating project' });
    }
});
router.post('/projects/:id/duplicate', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const source = await ownedProject(req.user.id, req.params.id);
        if (!source)
            return void res.status(404).json({ error: 'Influencer project not found' });
        const requestedTitle = text(req.body.title, 120);
        const duplicate = await prisma.$transaction(async (tx) => {
            const created = await tx.influencerVideoProject.create({ data: { userId: source.userId, influencerId: source.influencerId, influencerVersionId: source.influencerVersionId, productId: source.productId, title: requestedTitle || `${source.title} variation`.slice(0, 120), idea: source.idea, brief: source.brief, durationSeconds: source.durationSeconds, aspectRatio: source.aspectRatio, status: source.scenes.length ? 'scenes_draft' : 'draft', scenesRevision: source.scenes.length ? 1 : 0 } });
            if (source.scenes.length)
                await tx.influencerProjectScene.createMany({ data: source.scenes.map((scene) => ({ projectId: created.id, index: scene.index, title: scene.title, durationSeconds: scene.durationSeconds, location: scene.location, description: scene.description, characterAction: scene.characterAction, expression: scene.expression, wardrobe: scene.wardrobe, cameraFraming: scene.cameraFraming, cameraMovement: scene.cameraMovement, lighting: scene.lighting, productVisible: scene.productVisible, dialogue: scene.dialogue, voiceover: scene.voiceover, onScreenText: scene.onScreenText, transition: scene.transition })) });
            return created;
        });
        res.status(201).json(await ownedProject(req.user.id, duplicate.id));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed duplicating project' });
    }
});
router.post('/projects/:id/plan', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), (0, rate_limit_middleware_1.rateLimit)('generation'), async (req, res) => {
    try {
        const project = await ownedProject(req.user.id, req.params.id);
        if (!project)
            return void res.status(404).json({ error: 'Influencer project not found' });
        const influencer = await prisma.influencer.findUnique({ where: { id: project.influencerId } });
        const sceneCount = Math.min(6, Math.max(2, Number(req.body.scene_count) || (project.durationSeconds === 5 ? 3 : project.durationSeconds === 10 ? 4 : 6)));
        const plan = await (0, influencer_planner_service_1.planInfluencerScenes)({ idea: project.idea, title: project.title, durationSeconds: project.durationSeconds, aspectRatio: project.aspectRatio, brief: project.brief, influencer: { name: influencer?.name, profile: project.influencerVersion.profile, voice: project.influencerVersion.voiceProfile }, product: project.product, sceneCount });
        const scenes = plan.scenes.map((scene, index) => sceneData(scene, index));
        await prisma.$transaction(async (tx) => {
            await tx.influencerProjectScene.deleteMany({ where: { projectId: project.id } });
            await tx.influencerProjectScene.createMany({ data: scenes.map((scene) => ({ projectId: project.id, ...scene })) });
            await tx.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'scenes_draft', scenesRevision: { increment: 1 }, scenesApprovedAt: null, brief: json({ ...project.brief, plan_summary: { creative_angle: plan.creative_angle, hook: plan.hook, narrative_structure: plan.narrative_structure, script: plan.script, product_integration: plan.product_integration, call_to_action: plan.call_to_action } }) } });
        });
        res.status(201).json(await ownedProject(req.user.id, project.id));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed planning scenes' });
    }
});
router.patch('/projects/:id/scenes/:sceneId', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const project = await ownedProject(req.user.id, req.params.id);
        const existing = project?.scenes.find((scene) => scene.id === req.params.sceneId);
        if (!project || !existing)
            return void res.status(404).json({ error: 'Scene not found' });
        const updated = sceneData({ ...existing, ...req.body, duration_seconds: req.body.duration_seconds ?? existing.durationSeconds, character_action: req.body.character_action ?? existing.characterAction, camera_framing: req.body.camera_framing ?? existing.cameraFraming, camera_movement: req.body.camera_movement ?? existing.cameraMovement, product_visible: req.body.product_visible ?? existing.productVisible, on_screen_text: req.body.on_screen_text ?? existing.onScreenText }, existing.index);
        await prisma.$transaction([prisma.influencerProjectScene.update({ where: { id: existing.id }, data: updated }), prisma.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'scenes_draft', scenesApprovedAt: null, scenesRevision: { increment: 1 } } })]);
        res.json(await ownedProject(req.user.id, project.id));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed updating scene' });
    }
});
router.post('/projects/:id/scenes', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const project = await ownedProject(req.user.id, req.params.id);
        if (!project)
            return void res.status(404).json({ error: 'Influencer project not found' });
        if (project.scenes.length >= 6)
            return void res.status(400).json({ error: 'Projects are limited to six scenes' });
        const created = sceneData(req.body, project.scenes.length);
        await prisma.$transaction([prisma.influencerProjectScene.create({ data: { projectId: project.id, ...created } }), prisma.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'scenes_draft', scenesApprovedAt: null, scenesRevision: { increment: 1 } } })]);
        res.status(201).json(await ownedProject(req.user.id, project.id));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed adding scene' });
    }
});
router.delete('/projects/:id/scenes/:sceneId', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    const project = await ownedProject(req.user.id, req.params.id);
    const existing = project?.scenes.find((scene) => scene.id === req.params.sceneId);
    if (!project || !existing)
        return void res.status(404).json({ error: 'Scene not found' });
    if (project.scenes.length <= 2)
        return void res.status(400).json({ error: 'Projects require at least two scenes' });
    await prisma.$transaction(async (tx) => {
        await tx.influencerProjectScene.delete({ where: { id: existing.id } });
        await tx.influencerProjectScene.updateMany({ where: { projectId: project.id, index: { gt: existing.index } }, data: { index: { decrement: 1 } } });
        await tx.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'scenes_draft', scenesApprovedAt: null, scenesRevision: { increment: 1 } } });
    });
    res.json(await ownedProject(req.user.id, project.id));
});
router.post('/projects/:id/scenes/:sceneId/duplicate', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const project = await ownedProject(req.user.id, req.params.id);
        const source = project?.scenes.find((scene) => scene.id === req.params.sceneId);
        if (!project || !source)
            return void res.status(404).json({ error: 'Scene not found' });
        if (project.scenes.length >= 6)
            return void res.status(400).json({ error: 'Projects are limited to six scenes' });
        await prisma.$transaction(async (tx) => {
            await tx.influencerProjectScene.updateMany({ where: { projectId: project.id, index: { gt: source.index } }, data: { index: { increment: 10 } } });
            const shifted = project.scenes.filter((scene) => scene.index > source.index).sort((a, b) => a.index - b.index);
            for (const scene of shifted)
                await tx.influencerProjectScene.update({ where: { id: scene.id }, data: { index: scene.index + 1 } });
            await tx.influencerProjectScene.create({ data: { projectId: project.id, index: source.index + 1, title: `${source.title} copy`.slice(0, 120), durationSeconds: source.durationSeconds, location: source.location, description: source.description, characterAction: source.characterAction, expression: source.expression, wardrobe: source.wardrobe, cameraFraming: source.cameraFraming, cameraMovement: source.cameraMovement, lighting: source.lighting, productVisible: source.productVisible, dialogue: source.dialogue, voiceover: source.voiceover, onScreenText: source.onScreenText, transition: source.transition } });
            await tx.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'scenes_draft', scenesApprovedAt: null, scenesRevision: { increment: 1 } } });
        });
        res.status(201).json(await ownedProject(req.user.id, project.id));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed duplicating scene' });
    }
});
router.post('/projects/:id/scenes/reorder', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const project = await ownedProject(req.user.id, req.params.id);
        const ids = list(req.body.scene_ids);
        if (!project || ids.length !== project.scenes.length || new Set(ids).size !== ids.length || ids.some((id) => !project.scenes.some((scene) => scene.id === id)))
            return void res.status(400).json({ error: 'Provide every project scene exactly once' });
        await prisma.$transaction(async (tx) => {
            await tx.influencerProjectScene.updateMany({ where: { projectId: project.id }, data: { index: { increment: 100 } } });
            for (let index = 0; index < ids.length; index += 1)
                await tx.influencerProjectScene.update({ where: { id: ids[index] }, data: { index } });
            await tx.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'scenes_draft', scenesApprovedAt: null, scenesRevision: { increment: 1 } } });
        });
        res.json(await ownedProject(req.user.id, project.id));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed reordering scenes' });
    }
});
router.post('/projects/:id/scenes/:sceneId/rewrite', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), (0, rate_limit_middleware_1.rateLimit)('generation'), async (req, res) => {
    try {
        const project = await ownedProject(req.user.id, req.params.id);
        const existing = project?.scenes.find((scene) => scene.id === req.params.sceneId);
        const instruction = text(req.body.instruction, 1000);
        if (!project || !existing)
            return void res.status(404).json({ error: 'Scene not found' });
        if (!instruction)
            return void res.status(400).json({ error: 'Rewrite instruction is required' });
        const source = { ...existing, duration_seconds: existing.durationSeconds, character_action: existing.characterAction, camera_framing: existing.cameraFraming, camera_movement: existing.cameraMovement, product_visible: existing.productVisible, on_screen_text: existing.onScreenText };
        const rewritten = await (0, influencer_planner_service_1.rewriteInfluencerScene)(source, instruction, { project: project.brief, product: project.product });
        const updated = sceneData({ ...rewritten, duration_seconds: existing.durationSeconds }, existing.index);
        await prisma.$transaction([prisma.influencerProjectScene.update({ where: { id: existing.id }, data: updated }), prisma.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'scenes_draft', scenesApprovedAt: null, scenesRevision: { increment: 1 } } })]);
        res.json(await ownedProject(req.user.id, project.id));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed rewriting scene' });
    }
});
router.post('/projects/:id/scenes/approve', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    const project = await ownedProject(req.user.id, req.params.id);
    if (!project)
        return void res.status(404).json({ error: 'Influencer project not found' });
    if (project.scenes.length < 2 || project.scenes.length > 6)
        return void res.status(400).json({ error: 'Projects require 2–6 scenes' });
    if (project.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) !== project.durationSeconds)
        return void res.status(400).json({ error: 'Scene durations must equal the project duration' });
    await prisma.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'scenes_approved', scenesApprovedAt: new Date() } });
    res.json(await ownedProject(req.user.id, project.id));
});
router.post('/projects/:id/storyboards/prepare', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const project = await ownedProject(req.user.id, req.params.id);
        if (!project)
            return void res.status(404).json({ error: 'Influencer project not found' });
        if (!['scenes_approved', 'storyboard_ready', 'storyboard_approved', 'video_ready'].includes(project.status))
            return void res.status(409).json({ error: 'Approve the current scene plan before generating a storyboard' });
        const influencerAsset = await prisma.asset.findFirst({ where: { id: project.influencerVersion.assetId || '', userId: req.user.id }, select: { storageObjectId: true } });
        if (!influencerAsset?.storageObjectId)
            return void res.status(409).json({ error: 'The approved influencer portrait must be stored in durable storage before storyboard generation' });
        const productIds = Array.isArray(project.product?.referenceStorageIds) ? project.product.referenceStorageIds.filter((id) => typeof id === 'string').slice(0, 3) : [];
        const visualStyle = text(req.body.visual_style, 300) || 'photorealistic premium UGC, natural smartphone cinematography, realistic skin and believable environments';
        const consistency = text(req.body.consistency_instruction, 500) || 'Prioritize exact character and product consistency.';
        res.json({ prompt: storyboardPrompt(project, visualStyle, consistency), layout: storyboardLayout(project.scenes.length), visual_style: visualStyle, reference_storage_ids: [influencerAsset.storageObjectId, ...productIds], scenes_revision: project.scenesRevision, generation: { workflow: 'text-to-image', model: 'google/nano-banana-2', params: { aspect_ratio: project.aspectRatio, resolution: '1K', output_format: 'jpg' } } });
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed preparing storyboard' });
    }
});
router.post('/projects/:id/storyboards', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const project = await ownedProject(req.user.id, req.params.id);
        if (!project)
            return void res.status(404).json({ error: 'Influencer project not found' });
        if (project.status !== 'scenes_approved' && project.status !== 'storyboard_ready' && project.status !== 'storyboard_approved')
            return void res.status(409).json({ error: 'The current scene plan is not approved' });
        if (Number(req.body.scenes_revision) !== project.scenesRevision)
            return void res.status(409).json({ error: 'Scenes changed after this storyboard generation started' });
        const prediction = await prisma.prediction.findFirst({ where: { id: text(req.body.prediction_id, 100), userId: req.user.id, workflow: 'text-to-image', model: 'google/nano-banana-2', status: 'succeeded' }, include: { assets: { where: { type: 'image' }, take: 1 } } });
        if (!prediction?.assets[0] || !prediction.outputUrl)
            return void res.status(400).json({ error: 'A completed Nano Banana 2 storyboard image is required' });
        const storyboardImageUrl = prediction.outputUrl;
        const existing = await prisma.influencerStoryboardVersion.findUnique({ where: { predictionId: prediction.id } });
        if (existing)
            return void res.json(existing);
        const version = (project.storyboards[0]?.version || 0) + 1;
        const created = await prisma.$transaction(async (tx) => {
            const storyboard = await tx.influencerStoryboardVersion.create({ data: { projectId: project.id, version, scenesRevision: project.scenesRevision, sceneSnapshot: json(project.scenes), influencerSnapshot: json(project.influencerVersion), productSnapshot: project.product ? json(project.product) : client_1.Prisma.JsonNull, prompt: text(req.body.prompt, 4000) || prediction.prompt || '', layout: text(req.body.layout, 20) || storyboardLayout(project.scenes.length), visualStyle: text(req.body.visual_style, 300) || 'premium UGC', referenceStorageIds: json(list(req.body.reference_storage_ids)), predictionId: prediction.id, assetId: prediction.assets[0].id, imageUrl: storyboardImageUrl } });
            await tx.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'storyboard_ready' } });
            return storyboard;
        });
        res.status(201).json(created);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed saving storyboard version' });
    }
});
router.post('/projects/:id/storyboards/:storyboardId/approve', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    const project = await ownedProject(req.user.id, req.params.id);
    const storyboard = project?.storyboards.find((item) => item.id === req.params.storyboardId);
    if (!project || !storyboard)
        return void res.status(404).json({ error: 'Storyboard version not found' });
    if (storyboard.scenesRevision !== project.scenesRevision || !project.scenesApprovedAt)
        return void res.status(409).json({ error: 'This storyboard no longer matches the approved scene plan' });
    await prisma.$transaction([prisma.influencerStoryboardVersion.updateMany({ where: { projectId: project.id }, data: { approved: false, approvedAt: null } }), prisma.influencerStoryboardVersion.update({ where: { id: storyboard.id }, data: { approved: true, approvedAt: new Date() } }), prisma.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'storyboard_approved' } })]);
    res.json(await ownedProject(req.user.id, project.id));
});
router.post('/projects/:id/videos/prepare', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const project = await ownedProject(req.user.id, req.params.id);
        if (!project)
            return void res.status(404).json({ error: 'Influencer project not found' });
        if (project.status !== 'storyboard_approved' && project.status !== 'video_ready')
            return void res.status(409).json({ error: 'Approve a storyboard before generating video' });
        const storyboard = project.storyboards.find((item) => item.approved);
        if (!storyboard || storyboard.scenesRevision !== project.scenesRevision)
            return void res.status(409).json({ error: 'The approved storyboard no longer matches the scenes' });
        const storyboardAsset = await prisma.asset.findFirst({ where: { id: storyboard.assetId || '', userId: req.user.id }, select: { storageObjectId: true } });
        if (!storyboardAsset?.storageObjectId)
            return void res.status(409).json({ error: 'The approved storyboard must be in durable storage' });
        const influencerAsset = await prisma.asset.findFirst({ where: { id: project.influencerVersion.assetId || '', userId: req.user.id }, select: { storageObjectId: true } });
        if (!influencerAsset?.storageObjectId)
            return void res.status(409).json({ error: 'The approved influencer portrait must be in durable storage' });
        const productIds = Array.isArray(project.product?.referenceStorageIds) ? project.product.referenceStorageIds.filter((id) => typeof id === 'string').slice(0, 5) : [];
        const referenceIds = [storyboardAsset.storageObjectId, influencerAsset.storageObjectId, ...productIds];
        const motionInstructions = text(req.body.motion_instructions, 1000) || 'Use natural human motion, confident pacing and smooth cuts.';
        const multiPrompt = JSON.stringify(project.scenes.map((scene) => ({ duration: scene.durationSeconds, prompt: `${scene.title}: ${scene.characterAction}. ${scene.cameraFraming}; ${scene.cameraMovement}. ${scene.dialogue ? `Spoken dialogue: ${scene.dialogue}.` : ''}${scene.voiceover ? ` Voiceover: ${scene.voiceover}.` : ''}${scene.transition ? ` Transition: ${scene.transition}.` : ''} Match <<<image_1>>> and preserve the person in <<<image_2>>>.` })));
        res.json({ prompt: klingPrompt(project, motionInstructions), storyboard_id: storyboard.id, motion_instructions: motionInstructions, reference_storage_ids: referenceIds, generation: { workflow: 'influencer-video', model: 'kwaivgi/kling-v3-omni-video', params: { duration: project.durationSeconds, aspect_ratio: project.aspectRatio, mode: 'standard', multi_prompt: multiPrompt, generate_audio: true } } });
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed preparing Kling V3 video' });
    }
});
router.post('/projects/:id/videos', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    try {
        const project = await ownedProject(req.user.id, req.params.id);
        if (!project)
            return void res.status(404).json({ error: 'Influencer project not found' });
        const storyboard = project.storyboards.find((item) => item.id === text(req.body.storyboard_id, 100) && item.approved);
        if (!storyboard || storyboard.scenesRevision !== project.scenesRevision)
            return void res.status(409).json({ error: 'Approved storyboard not found or stale' });
        const prediction = await prisma.prediction.findFirst({ where: { id: text(req.body.prediction_id, 100), userId: req.user.id, workflow: 'influencer-video', model: 'kwaivgi/kling-v3-omni-video', status: 'succeeded' }, include: { assets: { where: { type: 'video' }, take: 1 } } });
        if (!prediction?.assets[0] || !prediction.outputUrl)
            return void res.status(400).json({ error: 'A completed Kling V3 video is required' });
        const existing = await prisma.influencerVideoGeneration.findUnique({ where: { predictionId: prediction.id } });
        if (existing)
            return void res.json(existing);
        const videoUrl = prediction.outputUrl;
        const attempt = (project.videoGenerations[0]?.attempt || 0) + 1;
        const created = await prisma.$transaction(async (tx) => {
            const video = await tx.influencerVideoGeneration.create({ data: { projectId: project.id, storyboardId: storyboard.id, attempt, prompt: text(req.body.prompt, 4000) || prediction.prompt || '', motionInstructions: text(req.body.motion_instructions, 1000) || null, settings: json(req.body.settings || {}), predictionId: prediction.id, assetId: prediction.assets[0].id, videoUrl, creditsUsed: prediction.creditCost } });
            await tx.influencerVideoProject.update({ where: { id: project.id }, data: { status: 'video_ready' } });
            return video;
        });
        res.status(201).json(created);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed saving video generation' });
    }
});
router.post('/projects/:id/videos/:videoId/approve', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('projects:write'), async (req, res) => {
    const project = await ownedProject(req.user.id, req.params.id);
    const video = project?.videoGenerations.find((item) => item.id === req.params.videoId);
    if (!project || !video)
        return void res.status(404).json({ error: 'Video generation not found' });
    const storyboard = project.storyboards.find((item) => item.id === video.storyboardId);
    if (!storyboard?.approved || storyboard.scenesRevision !== project.scenesRevision)
        return void res.status(409).json({ error: 'Video was not generated from the current approved storyboard' });
    await prisma.$transaction([prisma.influencerVideoGeneration.updateMany({ where: { projectId: project.id }, data: { approved: false, approvedAt: null } }), prisma.influencerVideoGeneration.update({ where: { id: video.id }, data: { approved: true, approvedAt: new Date() } })]);
    res.json(await ownedProject(req.user.id, project.id));
});
exports.default = router;
