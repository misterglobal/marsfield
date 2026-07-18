import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface TimelineClipInput {
  sourceUrl: string;
  startSeconds: number;
  endSeconds?: number;
}

function assertTimelineTime(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1800) {
    throw new Error('Timeline trim values must be between 0 and 1800 seconds');
  }
  return parsed;
}

export function normalizeTimelineClip(input: {
  sourceUrl: string;
  startSeconds?: unknown;
  endSeconds?: unknown;
}): TimelineClipInput {
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

export async function renderTimelineExport(clips: TimelineClipInput[]): Promise<Buffer> {
  if (clips.length < 1 || clips.length > 20) {
    throw new Error('Timeline export requires 1 to 20 clips');
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'marsfield-timeline-'));
  const normalizedClipPaths: string[] = [];
  const listPath = path.join(tempDir, 'concat.txt');
  const outputPath = path.join(tempDir, 'timeline-export.mp4');

  try {
    for (let index = 0; index < clips.length; index++) {
      const clip = clips[index];
      const clipPath = path.join(tempDir, `clip-${String(index).padStart(3, '0')}.mp4`);
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

    await writeFile(listPath, normalizedClipPaths.map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`).join('\n'));
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ], { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 8 });

    return await readFile(outputPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown FFmpeg error';
    throw new Error(`Timeline export failed: ${detail}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
