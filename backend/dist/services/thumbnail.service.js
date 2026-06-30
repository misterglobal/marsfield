"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createThumbnail = createThumbnail;
const child_process_1 = require("child_process");
const promises_1 = require("fs/promises");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const sharp_1 = __importDefault(require("sharp"));
const storage_service_1 = require("./storage.service");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const MAX_SOURCE_BYTES = 250 * 1024 * 1024;
async function download(sourceUrl) {
    const response = await fetch(sourceUrl);
    if (!response.ok)
        throw new Error(`Thumbnail source download failed: ${response.status}`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > MAX_SOURCE_BYTES)
        throw new Error('Thumbnail source is too large');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_SOURCE_BYTES)
        throw new Error('Thumbnail source is too large');
    return buffer;
}
async function createThumbnail(input) {
    if (!storage_service_1.storageService.isConfigured())
        return null;
    const source = await download(input.sourceUrl);
    let thumbnail;
    if (input.type === 'image') {
        thumbnail = await (0, sharp_1.default)(source)
            .rotate()
            .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 78 })
            .toBuffer();
    }
    else {
        const directory = await (0, promises_1.mkdtemp)(path_1.default.join(os_1.default.tmpdir(), 'marsfield-thumb-'));
        const inputPath = path_1.default.join(directory, 'source-video');
        const framePath = path_1.default.join(directory, 'frame.webp');
        try {
            await (0, promises_1.writeFile)(inputPath, source);
            await execFileAsync('ffmpeg', [
                '-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.5', '-i', inputPath,
                '-frames:v', '1', '-vf', "scale='min(640,iw)':-2", '-quality', '75', framePath,
            ], { timeout: 30_000 });
            thumbnail = await (0, promises_1.readFile)(framePath);
        }
        finally {
            await (0, promises_1.rm)(directory, { recursive: true, force: true });
        }
    }
    const stored = await storage_service_1.storageService.storeBuffer({
        buffer: thumbnail,
        userId: input.userId,
        mimeType: 'image/webp',
        assetType: 'image',
        namespace: 'thumbnails',
        objectId: input.assetId,
        originalName: 'thumbnail.webp',
        metadata: { source: 'marsfield-thumbnail', assetId: input.assetId },
    });
    return stored ? { url: stored.url, byteSize: stored.byteSize } : null;
}
