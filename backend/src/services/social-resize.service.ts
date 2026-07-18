import { execFile } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type SocialResizeFormat = 'vertical' | 'square' | 'landscape';
export type SocialResizeMode = 'crop' | 'fit';

const FORMAT_DIMENSIONS: Record<SocialResizeFormat, { width: number; height: number; label: string }> = {
  vertical: { width: 1080, height: 1920, label: '9:16' },
  square: { width: 1080, height: 1080, label: '1:1' },
  landscape: { width: 1920, height: 1080, label: '16:9' },
};

export function assertSocialResizeFormat(value: unknown): SocialResizeFormat {
  if (value === 'vertical' || value === 'square' || value === 'landscape') return value;
  throw new Error('Resize format must be vertical, square, or landscape');
}

export function assertSocialResizeFormats(value: unknown): SocialResizeFormat[] {
  if (value === undefined || value === null || value === '') return [assertSocialResizeFormat('vertical')];
  if (!Array.isArray(value)) return [assertSocialResizeFormat(value)];
  if (value.length === 0 || value.length > 3) throw new Error('Resize batch accepts one to three formats');
  const unique = Array.from(new Set(value.map((item) => assertSocialResizeFormat(item))));
  return unique;
}

export function assertSocialResizeMode(value: unknown): SocialResizeMode {
  if (value === undefined || value === null || value === '') return 'crop';
  if (value === 'crop' || value === 'fit') return value;
  throw new Error('Resize mode must be crop or fit');
}

export function socialResizeLabel(format: SocialResizeFormat): string {
  return FORMAT_DIMENSIONS[format].label;
}

export async function renderSocialResize(input: {
  sourceUrl: string;
  format: SocialResizeFormat;
  mode: SocialResizeMode;
}): Promise<Buffer> {
  const { width, height } = FORMAT_DIMENSIONS[input.format];
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'marsfield-social-resize-'));
  const outputPath = path.join(tempDir, `${input.format}-${input.mode}.mp4`);
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

    return await readFile(outputPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown FFmpeg error';
    throw new Error(`Social resize failed: ${detail}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
