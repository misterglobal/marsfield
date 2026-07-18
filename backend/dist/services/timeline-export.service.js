"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTimelineClip = normalizeTimelineClip;
exports.renderTimelineExport = renderTimelineExport;
const child_process_1 = require("child_process");
const promises_1 = require("fs/promises");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
function assertTimelineTime(value, fallback = 0) {
    if (value === undefined || value === null || value === '')
        return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1800) {
        throw new Error('Timeline trim values must be between 0 and 1800 seconds');
    }
    return parsed;
}
function normalizeTimelineClip(input) {
    const startSeconds = assertTimelineTime(input.startSeconds, 0);
    const endSeconds = input.endSeconds === undefined || input.endSeconds === null || input.endSeconds === ''
        ? undefined
        : assertTimelineTime(input.endSeconds);
    if (endSeconds !== undefined && endSeconds <= startSeconds) {
        throw new Error('Timeline clip end must be after its start');
    }
    return {
        sourceUrl: input.sourceUrl,
        startSeconds,
        endSeconds,
    };
}
async function renderTimelineExport(clips) {
    if (clips.length < 1 || clips.length > 20) {
        throw new Error('Timeline export requires 1 to 20 clips');
    }
    const tempDir = await (0, promises_1.mkdtemp)(path_1.default.join(os_1.default.tmpdir(), 'marsfield-timeline-'));
    const normalizedClipPaths = [];
    const listPath = path_1.default.join(tempDir, 'concat.txt');
    const outputPath = path_1.default.join(tempDir, 'timeline-export.mp4');
    try {
        for (let index = 0; index < clips.length; index++) {
            const clip = clips[index];
            const clipPath = path_1.default.join(tempDir, `clip-${String(index).padStart(3, '0')}.mp4`);
            const args = [
                '-y',
                '-ss', String(clip.startSeconds),
                ...(clip.endSeconds !== undefined ? ['-to', String(clip.endSeconds)] : []),
                '-i', clip.sourceUrl,
                '-map', '0:v:0',
                '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
                '-an',
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '22',
                '-pix_fmt', 'yuv420p',
                clipPath,
            ];
            await execFileAsync('ffmpeg', args, { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 8 });
            normalizedClipPaths.push(clipPath);
        }
        await (0, promises_1.writeFile)(listPath, normalizedClipPaths.map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`).join('\n'));
        await execFileAsync('ffmpeg', [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-c', 'copy',
            '-movflags', '+faststart',
            outputPath,
        ], { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 8 });
        return await (0, promises_1.readFile)(outputPath);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown FFmpeg error';
        throw new Error(`Timeline export failed: ${detail}`);
    }
    finally {
        await (0, promises_1.rm)(tempDir, { recursive: true, force: true });
    }
}
