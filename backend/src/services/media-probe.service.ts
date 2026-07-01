import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function getRemoteVideoDuration(sourceUrl: string): Promise<number> {
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
