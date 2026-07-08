"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRemoteVideoDuration = getRemoteVideoDuration;
exports.getRemoteVideoMetadata = getRemoteVideoMetadata;
exports.getRemoteImageMegapixels = getRemoteImageMegapixels;
const child_process_1 = require("child_process");
const util_1 = require("util");
const sharp_1 = __importDefault(require("sharp"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
async function getRemoteVideoDuration(sourceUrl) {
    const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        sourceUrl,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error('Could not determine reference video duration');
    }
    return duration;
}
async function getRemoteVideoMetadata(sourceUrl) {
    const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,avg_frame_rate:format=duration',
        '-of', 'json', sourceUrl,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    const stream = parsed.streams?.[0];
    const duration = Number(parsed.format?.duration);
    const [numerator, denominator] = String(stream?.avg_frame_rate || '0/1').split('/').map(Number);
    const fps = denominator ? numerator / denominator : 0;
    if (!stream?.width || !stream.height || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fps) || fps <= 0) {
        throw new Error('Could not determine video dimensions, duration, or frame rate');
    }
    return { duration, width: stream.width, height: stream.height, fps };
}
async function getRemoteImageMegapixels(sourceUrl) {
    const response = await fetch(sourceUrl);
    if (!response.ok)
        throw new Error(`Could not download image metadata source: ${response.status}`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > 25 * 1024 * 1024)
        throw new Error('Image is too large to inspect');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > 25 * 1024 * 1024)
        throw new Error('Image is too large to inspect');
    const metadata = await (0, sharp_1.default)(buffer).metadata();
    if (!metadata.width || !metadata.height)
        throw new Error('Could not determine image dimensions');
    return (metadata.width * metadata.height) / 1_000_000;
}
