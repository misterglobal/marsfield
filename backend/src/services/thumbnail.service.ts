import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import sharp from 'sharp';
import { storageService } from './storage.service';

const execFileAsync = promisify(execFile);
const MAX_SOURCE_BYTES = 250 * 1024 * 1024;

async function download(sourceUrl: string): Promise<Buffer> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Thumbnail source download failed: ${response.status}`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_SOURCE_BYTES) throw new Error('Thumbnail source is too large');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error('Thumbnail source is too large');
  return buffer;
}

export async function createThumbnail(input: {
  sourceUrl: string;
  type: string;
  userId: string;
  assetId: string;
}): Promise<{ url: string; byteSize: number } | null> {
  if (!storageService.isConfigured()) return null;
  const source = await download(input.sourceUrl);
  let thumbnail: Buffer;

  if (input.type === 'image') {
    thumbnail = await sharp(source)
      .rotate()
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } else {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'marsfield-thumb-'));
    const inputPath = path.join(directory, 'source-video');
    const framePath = path.join(directory, 'frame.webp');
    try {
      await writeFile(inputPath, source);
      await execFileAsync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.5', '-i', inputPath,
        '-frames:v', '1', '-vf', "scale='min(640,iw)':-2", '-quality', '75', framePath,
      ], { timeout: 30_000 });
      thumbnail = await readFile(framePath);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  const stored = await storageService.storeBuffer({
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
