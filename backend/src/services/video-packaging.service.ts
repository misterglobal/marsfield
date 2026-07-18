import { execFile } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { getRemoteVideoMetadata } from './media-probe.service';

const execFileAsync = promisify(execFile);

export interface VideoPackagingIdeas {
  hooks: string[];
  titleOverlays: string[];
  thumbnailPrompts: string[];
}

function cleanContext(value: string | null | undefined): string {
  return (value || '')
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 180);
}

function mainSubject(context: string): string {
  const cleaned = cleanContext(context);
  if (!cleaned) return 'this scene';
  const firstSentence = cleaned.split(/[.!?]/)[0]?.trim();
  return (firstSentence || cleaned).slice(0, 86);
}

export function generateVideoPackagingIdeas(context: string | null | undefined): VideoPackagingIdeas {
  const subject = mainSubject(context || '');
  const shortSubject = subject.length > 58 ? `${subject.slice(0, 55)}...` : subject;

  return {
    hooks: [
      `Wait until you see how ${shortSubject} changes.`,
      `This is the moment ${shortSubject} becomes impossible to ignore.`,
      `Most people miss the detail that makes ${shortSubject} work.`,
      `Here is the fastest way to understand ${shortSubject}.`,
      `I did not expect ${shortSubject} to land like this.`,
    ],
    titleOverlays: [
      `The ${shortSubject} moment`,
      `Watch this shift`,
      `Before you scroll...`,
      `This changes the scene`,
      `Made in Marsfield`,
    ],
    thumbnailPrompts: [
      `Use the clearest frame showing ${shortSubject}.`,
      'Pick the frame with the strongest face, subject, or motion silhouette.',
      'Pick a frame with open space for a bold two-to-four word title.',
    ],
  };
}

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .slice(0, 80);
}

export async function renderTitleOverlayVideo(input: {
  sourceUrl: string;
  title: string;
  subtitle?: string;
}): Promise<Buffer> {
  const title = cleanContext(input.title).slice(0, 54);
  if (!title) throw new Error('A title overlay requires title text');
  const subtitle = cleanContext(input.subtitle).slice(0, 70);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'marsfield-title-overlay-'));
  const outputPath = path.join(tempDir, 'title-overlay.mp4');

  const titleFilter = [
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920',
    'format=yuv420p',
    "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill",
    `drawtext=text='${escapeDrawtext(title)}':fontcolor=white:fontsize=74:line_spacing=10:borderw=5:bordercolor=black@0.55:x=(w-text_w)/2:y=h*0.14`,
    subtitle
      ? `drawtext=text='${escapeDrawtext(subtitle)}':fontcolor=white@0.88:fontsize=34:borderw=3:bordercolor=black@0.45:x=(w-text_w)/2:y=h*0.14+125`
      : '',
  ].filter(Boolean).join(',');

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', input.sourceUrl,
      '-vf', titleFilter,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'aac',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ], { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 8 });
    return await readFile(outputPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown FFmpeg error';
    throw new Error(`Title overlay render failed: ${detail}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function extractThumbnailStill(input: {
  sourceUrl: string;
  timeSeconds: number;
}): Promise<Buffer> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'marsfield-thumbnail-still-'));
  const outputPath = path.join(tempDir, 'thumbnail-still.jpg');

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(Math.max(0, input.timeSeconds)),
      '-i', input.sourceUrl,
      '-frames:v', '1',
      '-vf', 'scale=1280:-2',
      '-q:v', '3',
      outputPath,
    ], { timeout: 60_000, maxBuffer: 1024 * 1024 * 4 });
    return await readFile(outputPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown FFmpeg error';
    throw new Error(`Thumbnail still extraction failed: ${detail}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function thumbnailCandidateTimes(sourceUrl: string, requestedTimes?: unknown): Promise<number[]> {
  if (Array.isArray(requestedTimes)) {
    const parsed = requestedTimes
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1800)
      .slice(0, 5);
    if (parsed.length) return parsed;
  }

  const metadata = await getRemoteVideoMetadata(sourceUrl);
  const safeDuration = Math.max(1, metadata.duration);
  return [
    Math.min(safeDuration * 0.18, Math.max(0.2, safeDuration - 0.1)),
    Math.min(safeDuration * 0.5, Math.max(0.2, safeDuration - 0.1)),
    Math.min(safeDuration * 0.82, Math.max(0.2, safeDuration - 0.1)),
  ].map((value) => Number(value.toFixed(2)));
}
