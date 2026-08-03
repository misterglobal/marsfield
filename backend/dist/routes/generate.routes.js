"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const replicate_service_1 = require("../services/replicate.service");
const queue_service_1 = require("../services/queue.service");
const billing_service_1 = require("../services/billing.service");
const crypto_1 = require("crypto");
const asset_service_1 = require("../services/asset.service");
const media_probe_service_1 = require("../services/media-probe.service");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const model_registry_1 = require("../config/model-registry");
const social_resize_service_1 = require("../services/social-resize.service");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const replicateService = new replicate_service_1.ReplicateService();
const SEEDANCE_MODELS = (0, model_registry_1.modelIdsForFamily)('seedance');
const NANO_BANANA_MODELS = (0, model_registry_1.modelIdsForFamily)('nano-banana');
const IMAGE_MODELS = new Set(['general', 'nano-banana', 'recraft'].flatMap((family) => Array.from((0, model_registry_1.modelIdsForFamily)(family))).filter((id) => (0, model_registry_1.getModelDefinition)(id)?.workflow === 'text-to-image'));
const VIDEO_ENHANCEMENT_MODELS = (0, model_registry_1.modelIdsForFamily)('video-enhance');
const IMAGE_UPSCALE_MODELS = (0, model_registry_1.modelIdsForFamily)('image-upscale');
const KLING_REFERENCE_MIN_SECONDS = 3;
const KLING_REFERENCE_MAX_SECONDS = 9.8;
const LIP_SYNC_MAX_SECONDS = 60;
function decodeFileInput(value, maximumBytes) {
    if (typeof value !== 'string') {
        throw new Error('Reference inputs must be URLs or data URIs');
    }
    if (!value.startsWith('data:')) {
        try {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol)) {
                throw new Error();
            }
            return value;
        }
        catch {
            throw new Error('Reference inputs must use an HTTP(S) URL or data URI');
        }
    }
    const match = value.match(/^data:([\w/+.-]+);base64,(.+)$/s);
    if (!match) {
        throw new Error('Invalid reference file data');
    }
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.byteLength > maximumBytes) {
        throw new Error(`Reference file exceeds the ${maximumBytes / 1024 / 1024}MB limit`);
    }
    return new Blob([buffer], { type: match[1] });
}
function decodeFileList(value, maximum, maximumBytes, label) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || value.length > maximum) {
        throw new Error(`${label} accepts at most ${maximum} files`);
    }
    return value.map((item) => decodeFileInput(item, maximumBytes));
}
async function resolveOwnedStorageObjects(userId, value, maximum, allowedPrefix, label) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || value.length > maximum || value.some((id) => typeof id !== 'string')) {
        throw new Error(`${label} accepts at most ${maximum} stored files`);
    }
    if (value.length === 0)
        return [];
    const objects = await prisma.storageObject.findMany({
        where: { id: { in: value }, userId },
        select: { id: true, url: true, mimeType: true },
    });
    const byId = new Map(objects.map((object) => [object.id, object]));
    return value.map((id) => {
        const object = byId.get(id);
        if (!object || !object.mimeType?.startsWith(allowedPrefix)) {
            throw new Error(`${label} contains a missing, unauthorized, or invalid file`);
        }
        return object.url;
    });
}
async function resolveOwnedStorageObject(userId, value, allowedPrefix, label) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const [url] = await resolveOwnedStorageObjects(userId, [value], 1, allowedPrefix, label) || [];
    return url;
}
// POST /api/v1/generate/quote - exact enhancement quote after media inspection
router.post('/generate/quote', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('generation:write'), (0, rate_limit_middleware_1.rateLimit)('quote'), async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { workflow, model, params = {} } = req.body;
        const billingParams = { ...params };
        if (workflow === 'video-enhance' && VIDEO_ENHANCEMENT_MODELS.has(model)) {
            const object = await prisma.storageObject.findFirst({
                where: { id: String(req.body.video_storage_object_id || ''), userId: req.user.id },
                select: { url: true, mimeType: true },
            });
            if (!object?.url || !object.mimeType?.startsWith('video/'))
                throw new Error('Owned video asset required');
            const metadata = await (0, media_probe_service_1.getRemoteVideoMetadata)(object.url);
            billingParams.duration = metadata.duration;
            billingParams.input_megapixels = (metadata.width * metadata.height) / 1_000_000;
            billingParams.input_fps = metadata.fps;
            if (model === 'xai/grok-imagine-video-extension') {
                const extension = Number(params.duration ?? 6);
                billingParams.output_duration = metadata.duration + extension;
            }
        }
        else if (workflow === 'image-upscale' && IMAGE_UPSCALE_MODELS.has(model)) {
            const image = await resolveOwnedStorageObject(req.user.id, req.body.image_storage_object_id, 'image/', 'Upscale image');
            if (!image)
                throw new Error('Owned image asset required');
            const inputMegapixels = await (0, media_probe_service_1.getRemoteImageMegapixels)(image);
            billingParams.input_megapixels = inputMegapixels;
            billingParams.output_megapixels = model === 'prunaai/p-image-upscale'
                ? Number(params.target ?? 8)
                : inputMegapixels * (model === 'google/upscaler'
                    ? (params.upscale_factor === 'x4' ? 16 : 4)
                    : Number(params.scale_factor ?? 2) ** 2);
        }
        else if (workflow === 'video-caption' && (0, model_registry_1.getModelDefinition)(model)?.family === 'caption') {
            const video = await resolveOwnedStorageObject(req.user.id, req.body.video_storage_object_id, 'video/', 'Caption source video');
            if (!video)
                throw new Error('Owned video asset required');
            const duration = await (0, media_probe_service_1.getRemoteVideoDuration)(video);
            if (duration > 60)
                throw new Error('Caption clips are limited to 60 seconds');
            billingParams.duration = duration;
        }
        else if (workflow === 'social-resize' && model === 'local/ffmpeg-social-resize') {
            const video = await resolveOwnedStorageObject(req.user.id, req.body.video_storage_object_id, 'video/', 'Resize source video');
            if (!video)
                throw new Error('Owned video asset required');
            const duration = await (0, media_probe_service_1.getRemoteVideoDuration)(video);
            if (duration > 180)
                throw new Error('Social resize clips are limited to 180 seconds');
            billingParams.duration = duration;
            billingParams.formats = params.formats ? (0, social_resize_service_1.assertSocialResizeFormats)(params.formats) : [(0, social_resize_service_1.assertSocialResizeFormat)(params.format)];
            billingParams.mode = (0, social_resize_service_1.assertSocialResizeMode)(params.mode);
        }
        else {
            throw new Error('Exact quotes are available for enhancement, caption, and social resize workflows');
        }
        const quote = (0, billing_service_1.quoteGeneration)({ workflow, model, params: billingParams });
        res.json({
            credits: quote.totalCredits,
            base_credits: quote.baseCredits,
            inspected: {
                duration: billingParams.duration,
                input_megapixels: billingParams.input_megapixels,
                input_fps: billingParams.input_fps,
                output_megapixels: billingParams.output_megapixels,
                output_duration: billingParams.output_duration,
            },
        });
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Could not quote enhancement' });
    }
});
// POST /api/v1/generate
router.post('/generate', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('generation:write'), (0, rate_limit_middleware_1.rateLimit)('generation'), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { workflow, model, prompt, params } = req.body;
        // Input validation
        if (!workflow || !model) {
            res.status(400).json({ error: 'workflow and model parameters are required' });
            return;
        }
        // Validate workflow
        const validWorkflows = ['text-to-video', 'image-to-video', 'lip-sync', 'text-to-image', 'multi-image-video', 'multimodal-video', 'influencer-video', 'character-replace', 'video-edit', 'video-enhance', 'image-upscale', 'video-caption', 'social-resize'];
        if (!validWorkflows.includes(workflow)) {
            res.status(400).json({ error: 'Invalid workflow type' });
            return;
        }
        // Validate prompt length (prevent abuse)
        if (prompt && prompt.length > 2000) {
            res.status(400).json({ error: 'Prompt exceeds maximum length of 2000 characters' });
            return;
        }
        // Validate model string (prevent injection)
        if (!/^[\w\-\.\/:]+$/.test(model)) {
            res.status(400).json({ error: 'Invalid model identifier' });
            return;
        }
        if (!(0, model_registry_1.modelSupportsWorkflow)(model, workflow)) {
            res.status(400).json({ error: 'Selected model is not registered for this workflow' });
            return;
        }
        const isSeedance = SEEDANCE_MODELS.has(model);
        if (workflow === 'multimodal-video' && !isSeedance) {
            res.status(400).json({ error: 'The multimodal-video workflow requires a Seedance 2.0 model' });
            return;
        }
        let predictionInput;
        const billingParams = { ...(params || {}) };
        try {
            if (isSeedance) {
                const duration = params?.duration ?? 5;
                const validAspectRatios = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'];
                const validResolutions = model === 'bytedance/seedance-2.0-mini'
                    ? ['480p', '720p']
                    : ['480p', '720p', '1080p'];
                if (!Number.isInteger(duration) || duration < -1 || duration > 15 || duration === 0) {
                    throw new Error('Seedance duration must be -1 or an integer from 1 to 15');
                }
                if (!validAspectRatios.includes(params?.aspect_ratio || '16:9')) {
                    throw new Error('Invalid Seedance aspect ratio');
                }
                if (!validResolutions.includes(params?.resolution || '720p')) {
                    throw new Error(`Invalid resolution for ${model}`);
                }
                const referenceImages = params?.reference_image_ids
                    ? await resolveOwnedStorageObjects(user.id, params.reference_image_ids, 9, 'image/', 'Reference images')
                    : decodeFileList(params?.reference_images, 9, 10 * 1024 * 1024, 'Reference images');
                const referenceVideos = params?.reference_video_ids
                    ? await resolveOwnedStorageObjects(user.id, params.reference_video_ids, 3, 'video/', 'Reference videos')
                    : decodeFileList(params?.reference_videos, 3, 25 * 1024 * 1024, 'Reference videos');
                const referenceAudio = params?.reference_audio_ids
                    ? await resolveOwnedStorageObjects(user.id, params.reference_audio_ids, 3, 'audio/', 'Reference audio')
                    : decodeFileList(params?.reference_audio, 3, 25 * 1024 * 1024, 'Reference audio');
                const firstFrameImage = params?.first_frame_image_id
                    ? await resolveOwnedStorageObject(user.id, params.first_frame_image_id, 'image/', 'First frame')
                    : params?.first_frame_image ? decodeFileInput(params.first_frame_image, 10 * 1024 * 1024) : undefined;
                const lastFrameImage = params?.last_frame_image_id
                    ? await resolveOwnedStorageObject(user.id, params.last_frame_image_id, 'image/', 'Last frame')
                    : params?.last_frame_image ? decodeFileInput(params.last_frame_image, 10 * 1024 * 1024) : undefined;
                predictionInput = {
                    prompt,
                    duration,
                    resolution: params?.resolution || '720p',
                    aspect_ratio: params?.aspect_ratio || '16:9',
                    generate_audio: params?.generate_audio !== false,
                    seed: Number.isInteger(params?.seed) ? params.seed : undefined,
                    reference_images: referenceImages,
                    reference_videos: referenceVideos,
                    reference_audio: referenceAudio,
                    first_frame_image: firstFrameImage,
                    last_frame_image: lastFrameImage,
                };
            }
            else if (workflow === 'influencer-video') {
                if (model !== 'kwaivgi/kling-v3-omni-video')
                    throw new Error('Influencer video generation requires Kling V3 Omni Video');
                const duration = Number(params?.duration ?? 5);
                if (!Number.isInteger(duration) || duration < 3 || duration > 15)
                    throw new Error('Kling duration must be an integer from 3 to 15 seconds');
                const mode = params?.mode || 'standard';
                if (!['standard', 'pro'].includes(mode))
                    throw new Error('Kling mode must be standard or pro');
                const aspectRatio = params?.aspect_ratio || '9:16';
                if (!['16:9', '9:16', '1:1'].includes(aspectRatio))
                    throw new Error('Invalid Kling aspect ratio');
                const referenceImages = await resolveOwnedStorageObjects(user.id, params?.reference_image_ids || [], 7, 'image/', 'Influencer video references') || [];
                if (!referenceImages.length)
                    throw new Error('Influencer video generation requires at least one reference image');
                const multiPrompt = typeof params?.multi_prompt === 'string' ? params.multi_prompt : undefined;
                if (multiPrompt && multiPrompt.length > 12000)
                    throw new Error('Kling multi-shot prompt is too long');
                billingParams.duration = duration;
                billingParams.mode = mode;
                predictionInput = {
                    prompt: prompt.trim(), duration, mode, aspect_ratio: aspectRatio,
                    generate_audio: params?.generate_audio !== false,
                    reference_images: referenceImages,
                    multi_prompt: multiPrompt,
                };
            }
            else if (workflow === 'character-replace' || workflow === 'video-edit') {
                if (model !== 'kwaivgi/kling-v3-omni-video') {
                    throw new Error('Video editing requires Kling V3 Omni Video');
                }
                const referenceImages = await resolveOwnedStorageObjects(user.id, params?.reference_image_ids || [], workflow === 'character-replace' ? 1 : 4, 'image/', 'Edit reference images') || [];
                const referenceVideoId = typeof params?.reference_video_id === 'string' ? params.reference_video_id : '';
                const referenceVideoObject = referenceVideoId
                    ? await prisma.storageObject.findFirst({
                        where: { id: referenceVideoId, userId: user.id },
                        select: { url: true, mimeType: true },
                    })
                    : null;
                const referenceVideo = referenceVideoObject?.url;
                if (!referenceVideo) {
                    throw new Error('Video editing requires one reference video');
                }
                if (!['video/mp4', 'video/quicktime'].includes(referenceVideoObject?.mimeType || '')) {
                    throw new Error('Kling video editing requires an MP4 or MOV source video');
                }
                if (workflow === 'character-replace' && !referenceImages[0]) {
                    throw new Error('Character replacement requires one reference image');
                }
                if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2500) {
                    throw new Error('Video editing requires a prompt no longer than 2500 characters');
                }
                const referenceDuration = await (0, media_probe_service_1.getRemoteVideoDuration)(referenceVideo);
                if (referenceDuration < KLING_REFERENCE_MIN_SECONDS || referenceDuration >= KLING_REFERENCE_MAX_SECONDS) {
                    throw new Error(`Reference video must be at least 3 seconds and no more than 9.8 seconds to avoid Kling's 10-second provider limit (received ${referenceDuration.toFixed(2)}s)`);
                }
                const mode = params?.mode || 'pro';
                if (!['standard', 'pro'].includes(mode))
                    throw new Error('Kling mode must be standard or pro');
                // Kling renders a 15-second output for this workflow, so bill the same
                // duration sent to the provider rather than the shorter source clip.
                billingParams.duration = 15;
                billingParams.mode = mode;
                predictionInput = {
                    prompt: prompt.trim(),
                    reference_images: referenceImages.length ? referenceImages : undefined,
                    reference_video: referenceVideo,
                    video_reference_type: 'base',
                    mode,
                    duration: 15,
                    aspect_ratio: params?.aspect_ratio || '16:9',
                    generate_audio: false,
                    keep_original_sound: params?.keep_original_sound !== false,
                };
            }
            else if (workflow === 'video-enhance') {
                if (!VIDEO_ENHANCEMENT_MODELS.has(model))
                    throw new Error('Unsupported video enhancement model');
                const videoId = typeof req.body.video_storage_object_id === 'string' ? req.body.video_storage_object_id : '';
                const videoObject = videoId ? await prisma.storageObject.findFirst({
                    where: { id: videoId, userId: user.id }, select: { url: true, mimeType: true },
                }) : null;
                if (!videoObject?.url || !videoObject.mimeType?.startsWith('video/')) {
                    throw new Error('Video enhancement requires an owned video asset');
                }
                const metadata = await (0, media_probe_service_1.getRemoteVideoMetadata)(videoObject.url);
                billingParams.duration = metadata.duration;
                billingParams.input_megapixels = (metadata.width * metadata.height) / 1_000_000;
                billingParams.input_fps = metadata.fps;
                if (model === 'xai/grok-imagine-video-extension') {
                    const extensionDuration = Number(params?.duration ?? 6);
                    if (videoObject.mimeType !== 'video/mp4')
                        throw new Error('Grok video extension requires an MP4 source');
                    if (metadata.duration < 2 || metadata.duration > 15.05)
                        throw new Error('Grok source video must be between 2 and 15 seconds');
                    if (!Number.isInteger(extensionDuration) || extensionDuration < 2 || extensionDuration > 10) {
                        throw new Error('Grok extension duration must be an integer from 2 to 10 seconds');
                    }
                    if (typeof prompt !== 'string' || !prompt.trim())
                        throw new Error('Grok extension requires a prompt');
                    billingParams.output_duration = metadata.duration + extensionDuration;
                    predictionInput = { video: videoObject.url, prompt: prompt.trim(), duration: extensionDuration };
                }
                else if (model === 'topazlabs/video-upscale') {
                    const targetResolution = params?.target_resolution || '1080p';
                    const targetFps = Number(params?.target_fps ?? 30);
                    if (!['720p', '1080p', '4k'].includes(targetResolution))
                        throw new Error('Invalid Topaz target resolution');
                    if (!Number.isInteger(targetFps) || targetFps < 15 || targetFps > 60)
                        throw new Error('Topaz target FPS must be from 15 to 60');
                    billingParams.target_resolution = targetResolution;
                    billingParams.target_fps = targetFps;
                    predictionInput = { video: videoObject.url, target_resolution: targetResolution, target_fps: targetFps };
                }
                else {
                    const scaleFactor = Number(params?.scale_factor ?? 2);
                    if (!Number.isFinite(scaleFactor) || scaleFactor < 1 || scaleFactor > 8)
                        throw new Error('Crystal scale factor must be from 1 to 8');
                    billingParams.scale_factor = scaleFactor;
                    predictionInput = { video: videoObject.url, scale_factor: scaleFactor };
                }
            }
            else if (workflow === 'image-upscale') {
                if (!IMAGE_UPSCALE_MODELS.has(model))
                    throw new Error('Unsupported image upscaling model');
                const image = await resolveOwnedStorageObject(user.id, req.body.image_storage_object_id, 'image/', 'Upscale image');
                if (!image)
                    throw new Error('Image upscaling requires an owned image asset');
                const inputMegapixels = await (0, media_probe_service_1.getRemoteImageMegapixels)(image);
                billingParams.input_megapixels = inputMegapixels;
                if (model === 'prunaai/p-image-upscale') {
                    const target = Number(params?.target ?? 8);
                    const outputFormat = params?.output_format || 'jpg';
                    const outputQuality = Number(params?.output_quality ?? 90);
                    if (!Number.isInteger(target) || target < 1 || target > 128)
                        throw new Error('Pruna target must be from 1 to 128 megapixels');
                    if (!['jpg', 'png', 'webp'].includes(outputFormat))
                        throw new Error('Invalid Pruna output format');
                    if (!Number.isInteger(outputQuality) || outputQuality < 0 || outputQuality > 100)
                        throw new Error('Output quality must be from 0 to 100');
                    billingParams.output_megapixels = target;
                    predictionInput = {
                        image, upscale_mode: 'target', target, output_format: outputFormat, output_quality: outputQuality,
                        enhance_details: params?.enhance_details === true, enhance_realism: params?.enhance_realism === true,
                    };
                }
                else if (model === 'google/upscaler') {
                    const upscaleFactor = params?.upscale_factor || 'x2';
                    const compressionQuality = Number(params?.compression_quality ?? 90);
                    if (!['x2', 'x4'].includes(upscaleFactor))
                        throw new Error('Google upscale factor must be x2 or x4');
                    if (!Number.isInteger(compressionQuality) || compressionQuality < 1 || compressionQuality > 100)
                        throw new Error('Compression quality must be from 1 to 100');
                    billingParams.output_megapixels = inputMegapixels * (upscaleFactor === 'x4' ? 16 : 4);
                    predictionInput = { image, upscale_factor: upscaleFactor, compression_quality: compressionQuality };
                }
                else {
                    const scaleFactor = Number(params?.scale_factor ?? 2);
                    const creativity = Number(params?.creativity ?? 0);
                    const outputFormat = params?.output_format || 'png';
                    if (![2, 4].includes(scaleFactor))
                        throw new Error('Clarity Pro scale factor must be 2 or 4');
                    if (!Number.isFinite(creativity) || creativity < -10 || creativity > 10)
                        throw new Error('Clarity creativity must be from -10 to 10');
                    if (!['png', 'jpg'].includes(outputFormat))
                        throw new Error('Invalid Clarity output format');
                    billingParams.output_megapixels = inputMegapixels * scaleFactor * scaleFactor;
                    predictionInput = { image, scale_factor: scaleFactor, creativity, output_format: outputFormat };
                }
            }
            else if (workflow === 'lip-sync') {
                const image = await resolveOwnedStorageObject(user.id, req.body.image_storage_object_id, 'image/', 'Lip-sync image');
                const audio = await resolveOwnedStorageObject(user.id, req.body.audio_storage_object_id, 'audio/', 'Lip-sync audio');
                if (!image || !audio)
                    throw new Error('Lip-sync requires a stored image and audio file');
                const audioDuration = await (0, media_probe_service_1.getRemoteMediaDuration)(audio);
                if (audioDuration > LIP_SYNC_MAX_SECONDS) {
                    throw new Error(`Lip-sync audio is limited to ${LIP_SYNC_MAX_SECONDS} seconds`);
                }
                billingParams.duration = audioDuration;
                if (!['bytedance/omni-human', 'bytedance/omni-human-1.5', 'prunaai/p-video-avatar'].includes(model)) {
                    throw new Error('Selected model does not support uploaded image and audio lip-sync');
                }
                if (model === 'prunaai/p-video-avatar') {
                    const resolution = params?.resolution || '720p';
                    if (!['720p', '1080p'].includes(resolution))
                        throw new Error('P-Video Avatar resolution must be 720p or 1080p');
                    const videoPrompt = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : 'The person is talking.';
                    predictionInput = {
                        image,
                        audio,
                        resolution,
                        video_prompt: videoPrompt,
                        seed: Number.isInteger(params?.seed) ? params.seed : undefined,
                        disable_safety_filter: false,
                    };
                }
                else {
                    predictionInput = {
                        image,
                        audio,
                        prompt: model === 'bytedance/omni-human-1.5' ? prompt || undefined : undefined,
                        seed: Number.isInteger(params?.seed) ? params.seed : undefined,
                        fast_mode: model === 'bytedance/omni-human-1.5' ? params?.fast_mode === true : undefined,
                    };
                }
            }
            else if (workflow === 'video-caption') {
                const video = await resolveOwnedStorageObject(user.id, req.body.video_storage_object_id, 'video/', 'Caption source video');
                if (!video)
                    throw new Error('Captioning requires an owned video asset');
                const sourceDuration = await (0, media_probe_service_1.getRemoteVideoDuration)(video);
                if (sourceDuration > 60)
                    throw new Error('Caption clips are limited to 60 seconds');
                const font = String(params?.font || 'Poppins/Poppins-ExtraBold.ttf');
                const allowedFonts = ['Poppins/Poppins-ExtraBold.ttf', 'Arial.ttf'];
                const subsPosition = String(params?.subs_position || 'bottom75');
                const fontsize = Number(params?.fontsize ?? 4);
                const maxChars = Number(params?.MaxChars ?? 10);
                const opacity = Number(params?.opacity ?? 0);
                const strokeWidth = Number(params?.stroke_width ?? 2.6);
                const kerning = Number(params?.kerning ?? -5);
                const safeColor = (value, fallback) => {
                    const color = String(value || fallback).trim();
                    if (!/^(#[0-9a-f]{6}|[a-z]{3,20})$/i.test(color))
                        throw new Error('Caption colors must be a color name or six-digit hex value');
                    return color;
                };
                if (!allowedFonts.includes(font))
                    throw new Error('Unsupported caption font');
                if (!['bottom75', 'bottom', 'top', 'center', 'left', 'right'].includes(subsPosition))
                    throw new Error('Unsupported caption position');
                if (!Number.isFinite(fontsize) || fontsize < 2 || fontsize > 12)
                    throw new Error('Caption font size must be from 2 to 12');
                if (!Number.isInteger(maxChars) || maxChars < 5 || maxChars > 40)
                    throw new Error('Maximum caption characters must be from 5 to 40');
                if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
                    throw new Error('Caption background opacity must be from 0 to 1');
                if (!Number.isFinite(strokeWidth) || strokeWidth < 0 || strokeWidth > 8)
                    throw new Error('Caption stroke width must be from 0 to 8');
                if (!Number.isFinite(kerning) || kerning < -10 || kerning > 10)
                    throw new Error('Caption kerning must be from -10 to 10');
                billingParams.duration = sourceDuration;
                predictionInput = {
                    video_file_input: video,
                    output_video: true,
                    output_transcript: true,
                    subs_position: subsPosition,
                    color: safeColor(params?.color, 'white'),
                    highlight_color: safeColor(params?.highlight_color, 'yellow'),
                    fontsize,
                    MaxChars: maxChars,
                    opacity,
                    font,
                    stroke_color: safeColor(params?.stroke_color, 'black'),
                    stroke_width: strokeWidth,
                    kerning,
                    right_to_left: params?.right_to_left === true,
                    translate: params?.translate === true,
                };
            }
            else if (workflow === 'social-resize') {
                const video = await resolveOwnedStorageObject(user.id, req.body.video_storage_object_id, 'video/', 'Resize source video');
                if (!video)
                    throw new Error('Social resize requires an owned video asset');
                const sourceDuration = await (0, media_probe_service_1.getRemoteVideoDuration)(video);
                if (sourceDuration > 180)
                    throw new Error('Social resize clips are limited to 180 seconds');
                const formats = params?.formats ? (0, social_resize_service_1.assertSocialResizeFormats)(params.formats) : [(0, social_resize_service_1.assertSocialResizeFormat)(params?.format)];
                const mode = (0, social_resize_service_1.assertSocialResizeMode)(params?.mode);
                billingParams.duration = sourceDuration;
                billingParams.formats = formats;
                billingParams.mode = mode;
                billingParams.variations = 1;
                predictionInput = {
                    source_video: video,
                    formats,
                    mode,
                    aspect_ratio: formats.map((format) => (0, social_resize_service_1.socialResizeLabel)(format)).join(', '),
                };
            }
            else if (workflow === 'text-to-image') {
                if (!IMAGE_MODELS.has(model))
                    throw new Error('Unsupported image generation model');
                if (typeof prompt !== 'string' || !prompt.trim())
                    throw new Error('Image generation requires a prompt');
                if (NANO_BANANA_MODELS.has(model)) {
                    const validResolutions = ['1K', '2K', '4K'];
                    const validAspectRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
                    const validFormats = ['jpg', 'png'];
                    const imageResolution = params?.resolution || (model === 'google/nano-banana-pro' ? '2K' : '1K');
                    const imageAspectRatio = params?.aspect_ratio || '1:1';
                    const outputFormat = params?.output_format || 'jpg';
                    if (!validResolutions.includes(imageResolution))
                        throw new Error('Invalid Nano Banana resolution');
                    if (!validAspectRatios.includes(imageAspectRatio))
                        throw new Error('Invalid Nano Banana aspect ratio');
                    if (!validFormats.includes(outputFormat))
                        throw new Error('Invalid Nano Banana output format');
                    const imageInput = params?.reference_image_ids
                        ? await resolveOwnedStorageObjects(user.id, params.reference_image_ids, 14, 'image/', 'Nano Banana reference images')
                        : undefined;
                    predictionInput = {
                        prompt: prompt.trim(),
                        resolution: imageResolution,
                        aspect_ratio: imageAspectRatio,
                        output_format: outputFormat,
                        image_input: imageInput || [],
                        ...(model === 'google/nano-banana-pro'
                            ? { safety_filter_level: 'block_only_high', allow_fallback_model: true }
                            : {}),
                    };
                }
                else if (model === 'recraft-ai/recraft-v3') {
                    const validAspectRatios = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '1:2', '2:1', '7:5', '5:7', '4:5', '5:4', '3:5', '5:3'];
                    const validStyles = ['any', 'realistic_image', 'digital_illustration', 'vector_illustration'];
                    const imageAspectRatio = params?.aspect_ratio || '1:1';
                    const style = params?.style || 'any';
                    if (!validAspectRatios.includes(imageAspectRatio))
                        throw new Error('Invalid Recraft aspect ratio');
                    if (!validStyles.includes(style))
                        throw new Error('Invalid Recraft style');
                    predictionInput = {
                        prompt: prompt.trim(),
                        aspect_ratio: imageAspectRatio,
                        style,
                    };
                }
                else {
                    predictionInput = {
                        prompt: prompt.trim(),
                        aspect_ratio: params?.aspect_ratio,
                    };
                }
            }
            else {
                const image = workflow === 'image-to-video'
                    ? await resolveOwnedStorageObject(user.id, req.body.image_storage_object_id, 'image/', 'Input image')
                    : undefined;
                if (workflow === 'image-to-video' && !image)
                    throw new Error('Image-to-video requires a stored image');
                if (model === 'xai/grok-imagine-video-1.5') {
                    const grokDuration = params?.duration ?? 5;
                    const grokResolution = params?.resolution || '720p';
                    const grokAspectRatio = params?.aspect_ratio || 'auto';
                    if (typeof prompt !== 'string' || !prompt.trim())
                        throw new Error('Grok Imagine Video requires a motion prompt');
                    if (!Number.isInteger(grokDuration) || grokDuration < 1 || grokDuration > 15) {
                        throw new Error('Grok Imagine Video duration must be an integer from 1 to 15 seconds');
                    }
                    if (!['480p', '720p'].includes(grokResolution))
                        throw new Error('Grok Imagine Video resolution must be 480p or 720p');
                    if (!['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].includes(grokAspectRatio)) {
                        throw new Error('Invalid Grok Imagine Video aspect ratio');
                    }
                    predictionInput = {
                        prompt: prompt.trim(),
                        image,
                        duration: grokDuration,
                        resolution: grokResolution,
                        aspect_ratio: grokAspectRatio,
                    };
                }
                else {
                    predictionInput = {
                        prompt,
                        aspect_ratio: params?.aspect_ratio,
                        duration: params?.duration,
                        fps: params?.fps,
                        camera_move: params?.camera_move,
                        motion_strength: params?.motion_strength,
                        image,
                    };
                }
            }
        }
        catch (error) {
            res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid generation parameters' });
            return;
        }
        let billingQuote;
        try {
            billingQuote = (0, billing_service_1.quoteGeneration)({ workflow, model, params: billingParams });
        }
        catch (error) {
            res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid billing parameters' });
            return;
        }
        const projectId = typeof req.body.project_id === 'string' ? req.body.project_id : undefined;
        const storyboardSceneId = typeof req.body.storyboard_scene_id === 'string' ? req.body.storyboard_scene_id : undefined;
        if (projectId) {
            const project = await prisma.project.findFirst({
                where: { id: projectId, userId: user.id },
                select: {
                    id: true,
                    kitAssignments: {
                        select: {
                            brandKit: { select: { name: true, kind: true, description: true, promptRules: true, voice: true, colors: true, fonts: true } },
                        },
                    },
                },
            });
            if (!project) {
                res.status(404).json({ error: 'Project not found' });
                return;
            }
            if (typeof predictionInput.prompt === 'string' && project.kitAssignments.length) {
                const rules = project.kitAssignments.map(({ brandKit: kit }) => {
                    const details = [kit.description, kit.promptRules, kit.voice ? `Voice/tone: ${kit.voice}` : '', Array.isArray(kit.colors) ? `Colors: ${kit.colors.join(', ')}` : '', Array.isArray(kit.fonts) ? `Fonts: ${kit.fonts.join(', ')}` : ''].filter(Boolean).join(' ');
                    return `${kit.kind === 'character' ? 'Character' : 'Brand'} ${kit.name}: ${details}`;
                }).join('\n');
                predictionInput.prompt = `${predictionInput.prompt}\n\nProject kit rules (server enforced):\n${rules}`.slice(0, 8000);
            }
        }
        if (storyboardSceneId) {
            const scene = await prisma.storyboardScene.findFirst({
                where: { id: storyboardSceneId, project: { userId: user.id } },
                select: { id: true, projectId: true },
            });
            if (!scene || (projectId && scene.projectId !== projectId)) {
                res.status(404).json({ error: 'Storyboard scene not found' });
                return;
            }
        }
        if (workflow === 'social-resize') {
            const sourceVideo = String(predictionInput.source_video || '');
            const formats = (0, social_resize_service_1.assertSocialResizeFormats)(predictionInput.formats);
            const mode = (0, social_resize_service_1.assertSocialResizeMode)(predictionInput.mode);
            const resizeGroupId = formats.length > 1 ? (0, crypto_1.randomUUID)() : undefined;
            const submittedPredictions = [];
            for (let index = 0; index < formats.length; index++) {
                const format = formats[index];
                const prediction = await prisma.prediction.create({
                    data: {
                        userId: user.id,
                        projectId,
                        storyboardSceneId,
                        workflow,
                        model,
                        prompt: `Resize video for ${(0, social_resize_service_1.socialResizeLabel)(format)} (${mode})`,
                        inputParams: {
                            format,
                            mode,
                            aspect_ratio: (0, social_resize_service_1.socialResizeLabel)(format),
                            source_url: sourceVideo,
                            source_video_storage_object_id: req.body.video_storage_object_id,
                            batch: formats.length > 1,
                        },
                        variationGroupId: resizeGroupId,
                        variationIndex: index,
                        variationCount: formats.length,
                        creditCost: 0,
                        status: 'processing',
                    },
                });
                submittedPredictions.push(prediction);
                await queue_service_1.queueService.addLocalProcessingJob({ kind: 'local', predictionId: prediction.id });
            }
            const primaryPrediction = submittedPredictions[0];
            res.status(202).json({
                id: primaryPrediction.id,
                status: primaryPrediction.status,
                output_url: primaryPrediction.outputUrl,
                created_at: primaryPrediction.createdAt,
                credits_charged: 0,
                variation_group_id: resizeGroupId,
                predictions: submittedPredictions.map((prediction) => ({
                    id: prediction.id,
                    status: prediction.status,
                    output_url: prediction.outputUrl,
                    variation_index: prediction.variationIndex,
                })),
            });
            return;
        }
        // Call replicate client wrapper
        const webhookBaseUrl = process.env.WEBHOOK_BASE_URL;
        const webhookUrl = webhookBaseUrl?.startsWith('https://')
            ? `${webhookBaseUrl.replace(/\/+$/, '')}/api/v1/webhooks/replicate`
            : undefined;
        const variationGroupId = billingQuote.variationCount > 1 ? (0, crypto_1.randomUUID)() : undefined;
        const submittedPredictions = [];
        let acceptedCredits = 0;
        let acceptedVariations = 0;
        // Reserve the full quote atomically before starting any paid provider work.
        // The conditional UPDATE prevents concurrent requests from spending the
        // same remaining balance.
        const reserved = await prisma.$executeRaw `
      UPDATE users
      SET credits_used = credits_used + ${billingQuote.totalCredits}
      WHERE id = ${user.id}
        AND credits_used + ${billingQuote.totalCredits} <= credits_limit
    `;
        if (reserved !== 1) {
            const account = await prisma.user.findUnique({
                where: { id: user.id },
                select: { creditsUsed: true, creditsLimit: true },
            });
            const remainingCredits = account ? account.creditsLimit - account.creditsUsed : 0;
            res.status(403).json({
                error: 'Generation quota exceeded. Please upgrade plan.',
                credits_required: billingQuote.totalCredits,
                credits_remaining: Math.max(0, remainingCredits),
            });
            return;
        }
        try {
            for (let variationIndex = 0; variationIndex < billingQuote.variationCount; variationIndex++) {
                const variantInput = {
                    ...predictionInput,
                    seed: Number.isInteger(predictionInput.seed)
                        ? predictionInput.seed + variationIndex
                        : predictionInput.seed,
                };
                const variationCreditCost = variationIndex === 0 || model === 'google/nano-banana-pro'
                    ? billingQuote.baseCredits
                    : Math.ceil(billingQuote.baseCredits * 0.75);
                const repPrediction = await replicateService.createPrediction(model, variantInput, webhookUrl);
                // Once the provider accepts a job it is billable even if a later local
                // persistence or queue operation fails.
                acceptedCredits += variationCreditCost;
                acceptedVariations += 1;
                // Save Prediction in DB
                const prediction = await prisma.prediction.create({
                    data: {
                        userId: user.id,
                        projectId,
                        storyboardSceneId,
                        workflow,
                        model,
                        prompt: typeof predictionInput.prompt === 'string' ? predictionInput.prompt : prompt || null,
                        inputParams: isSeedance
                            ? {
                                duration: params?.duration ?? 5,
                                resolution: params?.resolution || '720p',
                                aspect_ratio: params?.aspect_ratio || '16:9',
                                generate_audio: params?.generate_audio !== false,
                                seed: Number.isInteger(params?.seed) ? params.seed + variationIndex : null,
                                reference_image_count: params?.reference_image_ids?.length || params?.reference_images?.length || 0,
                                reference_video_count: params?.reference_video_ids?.length || params?.reference_videos?.length || 0,
                                reference_audio_count: params?.reference_audio_ids?.length || params?.reference_audio?.length || 0,
                                has_first_frame: Boolean(params?.first_frame_image_id || params?.first_frame_image),
                                has_last_frame: Boolean(params?.last_frame_image_id || params?.last_frame_image),
                            }
                            : {
                                ...(params || {}),
                                seed: Number.isInteger(params?.seed)
                                    ? (params.seed + variationIndex)
                                    : params?.seed,
                            },
                        variationGroupId,
                        variationIndex,
                        variationCount: billingQuote.variationCount,
                        creditCost: variationCreditCost,
                        status: repPrediction.status,
                        replicatePredictionId: repPrediction.id,
                        outputUrl: repPrediction.outputUrl || null,
                        completedAt: repPrediction.status === 'succeeded' ? new Date() : null,
                    },
                });
                submittedPredictions.push(prediction);
                // Register job inside queue tracker (for async checks if not webhook verified)
                if (repPrediction.status !== 'succeeded') {
                    await queue_service_1.queueService.addGenerationJob({
                        predictionId: prediction.id,
                        replicatePredictionId: repPrediction.id,
                        model,
                    });
                }
                else if (repPrediction.outputUrl) {
                    // Create user asset immediately if succeeded synchronously
                    await (0, asset_service_1.createAssetForPrediction)(prediction, repPrediction.outputUrl);
                    if (workflow === 'video-caption' && repPrediction.outputUrls?.[1]) {
                        await (0, asset_service_1.createSupplementaryAssetForPrediction)(prediction, repPrediction.outputUrls[1], 'document');
                    }
                }
            }
        }
        catch (error) {
            const refundCredits = billingQuote.totalCredits - acceptedCredits;
            await prisma.$transaction([
                ...(refundCredits > 0 ? [prisma.$executeRaw `
          UPDATE users
          SET credits_used = GREATEST(0, credits_used - ${refundCredits})
          WHERE id = ${user.id}
        `] : []),
                ...(acceptedCredits > 0 ? [prisma.usageEvent.create({
                        data: {
                            userId: user.id,
                            predictionId: submittedPredictions[0]?.id,
                            eventType: 'generation',
                            credits: acceptedCredits,
                            metadata: {
                                workflow,
                                model,
                                variation_count_requested: billingQuote.variationCount,
                                variation_count_accepted: acceptedVariations,
                                variation_group_id: variationGroupId,
                                partial_submission: true,
                            },
                        },
                    })] : []),
            ]);
            throw error;
        }
        await prisma.usageEvent.create({
            data: {
                userId: user.id,
                predictionId: submittedPredictions[0]?.id,
                eventType: 'generation',
                credits: billingQuote.totalCredits,
                metadata: {
                    workflow,
                    model,
                    variation_count: billingQuote.variationCount,
                    variation_group_id: variationGroupId,
                },
            },
        });
        const primaryPrediction = submittedPredictions[0];
        res.status(201).json({
            id: primaryPrediction.id,
            status: primaryPrediction.status,
            output_url: primaryPrediction.outputUrl,
            created_at: primaryPrediction.createdAt,
            credits_charged: billingQuote.totalCredits,
            variation_group_id: variationGroupId,
            predictions: submittedPredictions.map((prediction) => ({
                id: prediction.id,
                status: prediction.status,
                output_url: prediction.outputUrl,
                variation_index: prediction.variationIndex,
            })),
        });
    }
    catch (error) {
        console.error('Submit prediction error:', error);
        res.status(500).json({ error: 'Failed submitting generation job' });
    }
});
// GET /api/v1/predictions/:id
router.get('/predictions/:id', auth_middleware_1.authMiddleware, (0, auth_middleware_1.requireScope)('predictions:read'), async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { id } = req.params;
        const prediction = await prisma.prediction.findUnique({
            where: { id },
            include: {
                assets: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { id: true, type: true },
                },
            },
        });
        if (!prediction || (prediction.userId !== user.id)) {
            res.status(404).json({ error: 'Prediction not found' });
            return;
        }
        res.json({
            id: prediction.id,
            status: prediction.status,
            output_url: prediction.outputUrl,
            asset_id: prediction.assets[0]?.id,
            asset_type: prediction.assets[0]?.type,
            error: prediction.errorMessage,
            completed_at: prediction.completedAt,
        });
    }
    catch (error) {
        console.error('Fetch prediction status error:', error);
        res.status(500).json({ error: 'Failed getting prediction status' });
    }
});
exports.default = router;
