import { planYoutubeProduction, YoutubePlannerInput } from './youtube-planner.service';

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

async function enrichStoryboard(baseline: any) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const sceneCount = baseline.storyboard.length;
  const input = {
    topic: baseline.topic, audience: baseline.audience, target_duration_minutes: baseline.targetDurationMin,
    strategy: { central_question: baseline.strategy.centralQuestion, viewer_promise: baseline.strategy.viewerPromise, format: baseline.strategy.format, tone: baseline.strategy.tone },
    production_bible: baseline.strategy.productionBible,
    scenes: baseline.storyboard.map((scene: any) => ({ index: scene.index, timecode: scene.timecode, duration_seconds: scene.durationSeconds, chapter: scene.chapter, sequence_phase: scene.sequencePhase, story_function: scene.storyFunction, existing_description: scene.sceneDescription, continuity_in: scene.continuityIn, continuity_out: scene.continuityOut, visual_thread: scene.visualThread })),
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      instructions: 'You are a senior YouTube documentary director and storyboard artist. Improve every supplied scene so it advances the argument, creates a filmable visual, and hands off clearly to the next scene. Preserve every index, timecode, duration, chapter, factual uncertainty, and continuity constraint. Avoid generic montage, decorative B-roll, unsupported factual claims, on-image text, logos, and repetitive shot design. Image prompts must be production-ready and must not contain invented evidence. Return every scene exactly once in index order.',
      input: JSON.stringify(input),
      text: { format: { type: 'json_schema', name: 'youtube_scene_plan', strict: true, schema: { type: 'object', additionalProperties: false, properties: { scenes: { type: 'array', minItems: sceneCount, maxItems: sceneCount, items: sceneSchema } }, required: ['scenes'] } } },
    }),
  });
  const payload = await response.json() as any;
  if (!response.ok) throw new Error(payload?.error?.message || 'OpenAI YouTube scene planning failed');
  const outputText = payload.output_text || payload.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === 'output_text')?.text;
  if (!outputText) throw new Error('OpenAI returned no YouTube scene plan');
  const parsed = JSON.parse(outputText);
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== sceneCount || parsed.scenes.some((scene: any, index: number) => scene.index !== index)) throw new Error('OpenAI returned an invalid YouTube scene sequence');
  return parsed.scenes;
}

export async function planYoutubeProductionWithAI(input: YoutubePlannerInput) {
  const baseline = planYoutubeProduction(input);
  try {
    const enriched = await enrichStoryboard(baseline);
    return {
      ...baseline,
      strategy: { ...baseline.strategy, plannerEngine: 'gpt-4o-mini', plannerFallback: false },
      storyboard: baseline.storyboard.map((scene: any, index: number) => {
        const ai = enriched[index];
        return { ...scene, title: ai.title, sceneDescription: ai.scene_description, narrativeChange: ai.narrative_change, narrationBeat: ai.narration_beat, shotType: ai.shot_type, cameraDirection: ai.camera_direction, transition: ai.transition, audioDirection: ai.audio_direction, imagePrompt: ai.image_prompt };
      }),
    };
  } catch (error) {
    console.warn('GPT-4o mini YouTube scene planning unavailable; using deterministic fallback:', error instanceof Error ? error.message : error);
    return { ...baseline, strategy: { ...baseline.strategy, plannerEngine: 'deterministic_fallback', plannerFallback: true, plannerWarning: error instanceof Error ? error.message : 'OpenAI scene planning failed' } };
  }
}
