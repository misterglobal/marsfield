"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planInfluencerScenes = planInfluencerScenes;
exports.rewriteInfluencerScene = rewriteInfluencerScene;
const sceneSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        title: { type: 'string' }, duration_seconds: { type: 'integer' }, location: { type: 'string' },
        description: { type: 'string' }, character_action: { type: 'string' }, expression: { type: 'string' },
        wardrobe: { type: 'string' }, camera_framing: { type: 'string' }, camera_movement: { type: 'string' },
        lighting: { type: 'string' }, product_visible: { type: 'boolean' }, dialogue: { type: 'string' },
        voiceover: { type: 'string' }, on_screen_text: { type: 'string' }, transition: { type: 'string' },
    },
    required: ['title', 'duration_seconds', 'location', 'description', 'character_action', 'expression', 'wardrobe', 'camera_framing', 'camera_movement', 'lighting', 'product_visible', 'dialogue', 'voiceover', 'on_screen_text', 'transition'],
};
async function structuredResponse(instructions, input, schema) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
        throw new Error('Scene planning is not configured. Set OPENAI_API_KEY.');
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            instructions,
            input,
            text: { format: { type: 'json_schema', name: 'influencer_scene_plan', strict: true, schema } },
        }),
    });
    const payload = await response.json();
    if (!response.ok)
        throw new Error(payload?.error?.message || 'OpenAI scene planning failed');
    const outputText = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
    if (!outputText)
        throw new Error('OpenAI returned no scene plan');
    return JSON.parse(outputText);
}
async function planInfluencerScenes(input) {
    const result = await structuredResponse('You are a social video director. Return a practical, chronological scene plan. Keep one adult fictional influencer visually consistent. Scene durations must be positive integers and their sum must exactly equal the requested duration. Use at most one product. Write dialogue or voiceover that can be naturally spoken in the allotted time. Do not include markdown.', JSON.stringify(input), { type: 'object', additionalProperties: false, properties: {
            creative_angle: { type: 'string' }, hook: { type: 'string' }, narrative_structure: { type: 'string' },
            script: { type: 'string' }, product_integration: { type: 'string' }, call_to_action: { type: 'string' },
            scenes: { type: 'array', minItems: input.sceneCount, maxItems: input.sceneCount, items: sceneSchema },
        }, required: ['creative_angle', 'hook', 'narrative_structure', 'script', 'product_integration', 'call_to_action', 'scenes'] });
    const scenes = result.scenes;
    if (scenes.length !== input.sceneCount || scenes.some((scene) => !Number.isInteger(scene.duration_seconds) || scene.duration_seconds < 1)) {
        throw new Error('Planner returned invalid scene durations');
    }
    const total = scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0);
    if (total !== input.durationSeconds)
        throw new Error('Planner scene durations do not match the project duration');
    return result;
}
async function rewriteInfluencerScene(scene, instruction, context) {
    return structuredResponse('Rewrite one social-video scene according to the instruction. Preserve its duration_seconds exactly. Return only the complete scene object.', JSON.stringify({ scene, instruction, context }), sceneSchema);
}
