"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planYoutubeProductionWithAI = planYoutubeProductionWithAI;
const youtube_planner_service_1 = require("./youtube-planner.service");
const youtube_topic_normalizer_service_1 = require("./youtube-topic-normalizer.service");
// Next.js proxies API requests to this service and may close long-running
// connections before OpenAI finishes. Enrichment is optional, so preserve
// enough time for the deterministic plan to be persisted and returned.
const YOUTUBE_AI_TIMEOUT_MS = Math.max(1_000, Math.min(25_000, Number(process.env.YOUTUBE_AI_TIMEOUT_MS) || 15_000));
const sceneSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        index: { type: 'integer' }, title: { type: 'string' }, scene_description: { type: 'string' },
        narrative_change: { type: 'string' }, narration_beat: { type: 'string' }, shot_type: { type: 'string' },
        camera_direction: { type: 'string' }, transition: { type: 'string' }, audio_direction: { type: 'string' },
        image_prompt: { type: 'string' },
    },
    required: ['index', 'title', 'scene_description', 'narrative_change', 'narration_beat', 'shot_type', 'camera_direction', 'transition', 'audio_direction', 'image_prompt'],
};
async function enrichStoryboard(baseline) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
        throw new Error('OPENAI_API_KEY is not configured');
    const sceneCount = baseline.storyboard.length;
    const input = {
        normalized_topic: baseline.normalizedTopic,
        audience: baseline.audience, target_duration_minutes: baseline.targetDurationMin,
        strategy: { central_question: baseline.strategy.centralQuestion, viewer_promise: baseline.strategy.viewerPromise, format: baseline.strategy.format, tone: baseline.strategy.tone },
        production_bible: baseline.strategy.productionBible,
        scenes: baseline.storyboard.map((scene) => ({ index: scene.index, timecode: scene.timecode, duration_seconds: scene.durationSeconds, chapter: scene.chapter, sequence_phase: scene.sequencePhase, story_function: scene.storyFunction, existing_description: scene.sceneDescription, continuity_in: scene.continuityIn, continuity_out: scene.continuityOut, visual_thread: scene.visualThread })),
    };
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(YOUTUBE_AI_TIMEOUT_MS),
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            instructions: 'You are a senior YouTube documentary director and storyboard artist. Improve every supplied scene so it advances the argument, creates a filmable visual, and hands off clearly to the next scene. Preserve every index, timecode, duration, chapter, factual uncertainty, and continuity constraint. Avoid generic montage, decorative B-roll, unsupported factual claims, on-image text, logos, and repetitive shot design. Image prompts must be production-ready and must not contain invented evidence. Return every scene exactly once in index order.',
            input: JSON.stringify(input),
            text: { format: { type: 'json_schema', name: 'youtube_scene_plan', strict: true, schema: { type: 'object', additionalProperties: false, properties: { scenes: { type: 'array', minItems: sceneCount, maxItems: sceneCount, items: sceneSchema } }, required: ['scenes'] } } },
        }),
    });
    const payload = await response.json();
    if (!response.ok)
        throw new Error(payload?.error?.message || 'OpenAI YouTube scene planning failed');
    const outputText = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
    if (!outputText)
        throw new Error('OpenAI returned no YouTube scene plan');
    const parsed = JSON.parse(outputText);
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== sceneCount || parsed.scenes.some((scene, index) => scene.index !== index))
        throw new Error('OpenAI returned an invalid YouTube scene sequence');
    return parsed.scenes;
}
async function planYoutubeProductionWithAI(input) {
    const baseline = (0, youtube_planner_service_1.planYoutubeProduction)(input);
    try {
        const enriched = await enrichStoryboard(baseline);
        return {
            ...baseline,
            strategy: { ...baseline.strategy, plannerEngine: 'gpt-4o-mini', plannerFallback: false },
            storyboard: baseline.storyboard.map((scene, index) => {
                const ai = enriched[index];
                const safe = (value, fallback) => (0, youtube_topic_normalizer_service_1.isMalformedGeneratedText)(value, String(input.topic || '')) ? fallback : String(value).trim();
                return {
                    ...scene,
                    title: (0, youtube_topic_normalizer_service_1.cleanGeneratedTitle)(ai.title, scene.title),
                    sceneDescription: safe(ai.scene_description, scene.sceneDescription),
                    narrativeChange: safe(ai.narrative_change, scene.narrativeChange),
                    narrationBeat: safe(ai.narration_beat, scene.narrationBeat),
                    shotType: safe(ai.shot_type, scene.shotType),
                    cameraDirection: safe(ai.camera_direction, scene.cameraDirection),
                    transition: safe(ai.transition, scene.transition),
                    audioDirection: safe(ai.audio_direction, scene.audioDirection),
                    imagePrompt: safe(ai.image_prompt, scene.imagePrompt),
                };
            }),
        };
    }
    catch (error) {
        console.warn('GPT-4o mini YouTube scene planning unavailable; using deterministic fallback:', error instanceof Error ? error.message : error);
        return { ...baseline, strategy: { ...baseline.strategy, plannerEngine: 'deterministic_fallback', plannerFallback: true, plannerWarning: error instanceof Error ? error.message : 'OpenAI scene planning failed' } };
    }
}
