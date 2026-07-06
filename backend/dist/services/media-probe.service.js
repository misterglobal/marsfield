"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRemoteVideoDuration = getRemoteVideoDuration;
const child_process_1 = require("child_process");
const util_1 = require("util");
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
