"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSocialResizeFormat = assertSocialResizeFormat;
exports.assertSocialResizeFormats = assertSocialResizeFormats;
exports.assertSocialResizeMode = assertSocialResizeMode;
exports.socialResizeLabel = socialResizeLabel;
exports.renderSocialResize = renderSocialResize;
const child_process_1 = require("child_process");
const promises_1 = require("fs/promises");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const FORMAT_DIMENSIONS = {
    vertical: { width: 1080, height: 1920, label: '9:16' },
    square: { width: 1080, height: 1080, label: '1:1' },
    landscape: { width: 1920, height: 1080, label: '16:9' },
};
function assertSocialResizeFormat(value) {
    if (value === 'vertical' || value === 'square' || value === 'landscape')
        return value;
    throw new Error('Resize format must be vertical, square, or landscape');
}
function assertSocialResizeFormats(value) {
    if (value === undefined || value === null || value === '')
        return [assertSocialResizeFormat('vertical')];
    if (!Array.isArray(value))
        return [assertSocialResizeFormat(value)];
    if (value.length === 0 || value.length > 3)
        throw new Error('Resize batch accepts one to three formats');
    const unique = Array.from(new Set(value.map((item) => assertSocialResizeFormat(item))));
    return unique;
}
function assertSocialResizeMode(value) {
    if (value === undefined || value === null || value === '')
        return 'crop';
    if (value === 'crop' || value === 'fit')
        return value;
    throw new Error('Resize mode must be crop or fit');
}
function socialResizeLabel(format) {
    return FORMAT_DIMENSIONS[format].label;
}
async function renderSocialResize(input) {
    const { width, height } = FORMAT_DIMENSIONS[input.format];
    const tempDir = await (0, promises_1.mkdtemp)(path_1.default.join(os_1.default.tmpdir(), 'marsfield-social-resize-'));
    const outputPath = path_1.default.join(tempDir, `${input.format}-${input.mode}.mp4`);
    const filter = input.mode === 'crop'
        ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
        : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
    try {
        await execFileAsync('ffmpeg', [
            '-y',
            '-i', input.sourceUrl,
            '-map', '0:v:0',
            '-map', '0:a?',
            '-vf', filter,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '22',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            outputPath,
        ], { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 8 });
        return await (0, promises_1.readFile)(outputPath);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown FFmpeg error';
        throw new Error(`Social resize failed: ${detail}`);
    }
    finally {
        await (0, promises_1.rm)(tempDir, { recursive: true, force: true });
    }
}
