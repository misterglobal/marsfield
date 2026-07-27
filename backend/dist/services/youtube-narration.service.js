"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createYoutubeNarrationPackage = createYoutubeNarrationPackage;
function cleanNarration(value) {
    return String(value || '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/\([^)]*(?:camera|music|sfx|visual|shot|cut|fade)[^)]*\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function wordCount(text) {
    return text.split(/\s+/).filter(Boolean).length;
}
function secondsToSrtTime(totalSeconds) {
    const safe = Math.max(0, totalSeconds);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = Math.floor(safe % 60);
    const milliseconds = Math.round((safe - Math.floor(safe)) * 1000);
    return [
        String(hours).padStart(2, '0'),
        String(minutes).padStart(2, '0'),
        String(seconds).padStart(2, '0'),
    ].join(':') + `,${String(milliseconds).padStart(3, '0')}`;
}
function chunkWords(text, maxWords) {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let index = 0; index < words.length; index += maxWords) {
        chunks.push(words.slice(index, index + maxWords).join(' '));
    }
    return chunks;
}
function createYoutubeNarrationPackage(input) {
    const script = (input.script || {});
    const sections = Array.isArray(script.sections) ? script.sections : [];
    const wordsPerMinute = Math.max(90, Math.min(210, Number(input.wordsPerMinute || 150)));
    const sectionNarrations = sections
        .map((section, index) => ({
        index,
        name: section.name || `Section ${index + 1}`,
        text: cleanNarration(section.narration),
    }))
        .filter((section) => section.text);
    const narrationText = sectionNarrations.length
        ? sectionNarrations.map((section) => section.text).join('\n\n')
        : cleanNarration(script.ttsText);
    if (!narrationText)
        throw new Error('Production script has no narration text');
    const totalWords = wordCount(narrationText);
    const estimatedDurationSeconds = Math.max(1, Math.round((totalWords / wordsPerMinute) * 60));
    const targetDurationSeconds = Math.max(60, Math.round(Number(input.targetDurationMin || 8) * 60));
    const storyboard = Array.isArray(input.storyboard) ? input.storyboard : [];
    const sourceDuration = storyboard.reduce((total, scene) => total + Math.max(0, Number(scene.durationSeconds || 0)), 0) || targetDurationSeconds;
    const timingScale = estimatedDurationSeconds / sourceDuration;
    let cursor = 0;
    const sceneTiming = storyboard.map((scene, index) => {
        const sourceDurationSeconds = Math.max(1, Number(scene.durationSeconds || targetDurationSeconds / Math.max(1, storyboard.length)));
        const durationSeconds = Math.max(1, Number((sourceDurationSeconds * timingScale).toFixed(2)));
        const timing = {
            index: Number.isInteger(scene.index) ? scene.index : index,
            title: scene.title || `Scene ${index + 1}`,
            startSeconds: Number(cursor.toFixed(2)),
            durationSeconds,
            endSeconds: Number((cursor + durationSeconds).toFixed(2)),
        };
        cursor += durationSeconds;
        return timing;
    });
    const captionChunks = chunkWords(narrationText, 10);
    const secondsPerWord = estimatedDurationSeconds / Math.max(1, totalWords);
    let captionCursor = 0;
    const captions = captionChunks.map((text, index) => {
        const duration = Math.max(1.25, wordCount(text) * secondsPerWord);
        const caption = {
            index: index + 1,
            startSeconds: Number(captionCursor.toFixed(2)),
            endSeconds: Number((captionCursor + duration).toFixed(2)),
            text,
        };
        captionCursor += duration;
        return caption;
    });
    const srt = captions.map((caption) => [
        caption.index,
        `${secondsToSrtTime(caption.startSeconds)} --> ${secondsToSrtTime(caption.endSeconds)}`,
        caption.text,
    ].join('\n')).join('\n\n');
    return {
        narration: {
            provider: 'none-prep-only',
            status: 'prepared',
            wordsPerMinute,
            totalWords,
            estimatedDurationSeconds,
            ttsText: narrationText,
            sections: sectionNarrations,
        },
        captions: {
            status: 'draft',
            format: 'srt',
            count: captions.length,
            srt,
            cues: captions,
        },
        audio: {
            status: 'not_generated',
            targetDurationSeconds,
            estimatedDurationSeconds,
            timingScale: Number(timingScale.toFixed(4)),
            sceneTiming,
        },
    };
}
