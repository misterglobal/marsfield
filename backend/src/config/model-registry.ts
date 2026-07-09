export type BackendWorkflow = 'text-to-video' | 'image-to-video' | 'lip-sync' | 'text-to-image' | 'multimodal-video' | 'video-edit' | 'video-enhance' | 'image-upscale' | 'video-caption' | 'social-resize';
export type BackendModelFamily = 'general' | 'seedance' | 'nano-banana' | 'recraft' | 'grok-video' | 'kling-edit' | 'video-enhance' | 'image-upscale' | 'caption' | 'local-processing';

export interface BackendModelDefinition {
  id: string;
  workflow: BackendWorkflow;
  family: BackendModelFamily;
  output: 'image' | 'video';
}

export const MODEL_REGISTRY: readonly BackendModelDefinition[] = [
  { id: 'alibaba/happyhorse-1.1', workflow: 'text-to-video', family: 'general', output: 'video' },
  { id: 'openai/sora-2', workflow: 'text-to-video', family: 'general', output: 'video' },
  { id: 'kuaishou/kling-v2-1', workflow: 'text-to-video', family: 'general', output: 'video' },
  { id: 'xai/grok-imagine-video-1.5', workflow: 'image-to-video', family: 'grok-video', output: 'video' },
  { id: 'bytedance/wan-2.5-fast', workflow: 'image-to-video', family: 'general', output: 'video' },
  { id: 'minimax/hailuo-live', workflow: 'image-to-video', family: 'general', output: 'video' },
  { id: 'bytedance/omni-human', workflow: 'lip-sync', family: 'general', output: 'video' },
  { id: 'bytedance/omni-human-1.5', workflow: 'lip-sync', family: 'general', output: 'video' },
  { id: 'black-forest-labs/flux-schnell', workflow: 'text-to-image', family: 'general', output: 'image' },
  { id: 'stability-ai/stable-diffusion-3', workflow: 'text-to-image', family: 'general', output: 'image' },
  { id: 'google/nano-banana-2', workflow: 'text-to-image', family: 'nano-banana', output: 'image' },
  { id: 'google/nano-banana-pro', workflow: 'text-to-image', family: 'nano-banana', output: 'image' },
  { id: 'recraft-ai/recraft-v3', workflow: 'text-to-image', family: 'recraft', output: 'image' },
  { id: 'bytedance/seedance-2.0', workflow: 'multimodal-video', family: 'seedance', output: 'video' },
  { id: 'bytedance/seedance-2.0-fast', workflow: 'multimodal-video', family: 'seedance', output: 'video' },
  { id: 'bytedance/seedance-2.0-mini', workflow: 'multimodal-video', family: 'seedance', output: 'video' },
  { id: 'kwaivgi/kling-v3-omni-video', workflow: 'video-edit', family: 'kling-edit', output: 'video' },
  { id: 'topazlabs/video-upscale', workflow: 'video-enhance', family: 'video-enhance', output: 'video' },
  { id: 'philz1337x/crystal-video-upscaler', workflow: 'video-enhance', family: 'video-enhance', output: 'video' },
  { id: 'xai/grok-imagine-video-extension', workflow: 'video-enhance', family: 'video-enhance', output: 'video' },
  { id: 'prunaai/p-image-upscale', workflow: 'image-upscale', family: 'image-upscale', output: 'image' },
  { id: 'google/upscaler', workflow: 'image-upscale', family: 'image-upscale', output: 'image' },
  { id: 'philz1337x/clarity-pro-upscaler', workflow: 'image-upscale', family: 'image-upscale', output: 'image' },
  { id: 'fictions-ai/autocaption:18a45ff0d95feb4449d192bbdc06b4a6df168fa33def76dfc51b78ae224b599b', workflow: 'video-caption', family: 'caption', output: 'video' },
  { id: 'local/ffmpeg-social-resize', workflow: 'social-resize', family: 'local-processing', output: 'video' },
] as const;

export const getModelDefinition = (id: string) => MODEL_REGISTRY.find((model) => model.id === id);
export const modelIdsForFamily = (family: BackendModelFamily) => new Set(MODEL_REGISTRY.filter((model) => model.family === family).map((model) => model.id));

export function modelSupportsWorkflow(modelId: string, workflow: string): boolean {
  const definition = getModelDefinition(modelId);
  if (!definition) return false;
  if (workflow === 'character-replace') return modelId === 'kwaivgi/kling-v3-omni-video';
  return definition.workflow === workflow;
}
