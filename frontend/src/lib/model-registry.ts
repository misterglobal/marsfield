export type WorkflowId = 'text-to-video' | 'image-to-video' | 'lip-sync' | 'text-to-image' | 'multimodal-video' | 'video-edit' | 'video-enhance' | 'image-upscale' | 'video-caption' | 'social-resize';
export type ModelFamily = 'general' | 'seedance' | 'nano-banana' | 'recraft' | 'grok-video' | 'kling-edit' | 'video-enhance' | 'image-upscale' | 'caption' | 'local-processing';
export type ControlKey = 'target_resolution' | 'target_fps' | 'scale_factor' | 'extension_duration' | 'target_megapixels' | 'enhance_details' | 'enhance_realism' | 'upscale_factor' | 'quality' | 'creativity' | 'output_format';

export interface ModelControl {
  key: ControlKey;
  label: string;
  type: 'select' | 'range' | 'checkbox';
  defaultValue: string | number | boolean;
  options?: ReadonlyArray<{ label: string; value: string | number }>;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}

export interface ModelDefinition {
  id: string;
  name: string;
  workflow: WorkflowId;
  family: ModelFamily;
  speed: string;
  output: 'image' | 'video';
  supportsCinematic?: boolean;
  controls?: readonly ModelControl[];
}

const select = (key: ControlKey, label: string, defaultValue: string | number, options: ReadonlyArray<[string, string | number]>, help?: string): ModelControl => ({
  key, label, type: 'select', defaultValue, options: options.map(([optionLabel, value]) => ({ label: optionLabel, value })), help,
});

export const MODEL_REGISTRY: readonly ModelDefinition[] = [
  { id: 'alibaba/happyhorse-1.1', name: 'Happy Horse 1.1', workflow: 'text-to-video', family: 'general', speed: 'Fast', output: 'video', supportsCinematic: true },
  { id: 'openai/sora-2', name: 'Sora 2', workflow: 'text-to-video', family: 'general', speed: 'High Quality', output: 'video', supportsCinematic: true },
  { id: 'kuaishou/kling-v2-1', name: 'Kling 2.1', workflow: 'text-to-video', family: 'general', speed: 'Balanced', output: 'video', supportsCinematic: true },
  { id: 'xai/grok-imagine-video-1.5', name: 'Grok Imagine Video 1.5', workflow: 'image-to-video', family: 'grok-video', speed: 'Native Audio', output: 'video', supportsCinematic: true },
  { id: 'bytedance/wan-2.5-fast', name: 'Wan 2.5 Fast', workflow: 'image-to-video', family: 'general', speed: 'Ultrafast', output: 'video', supportsCinematic: true },
  { id: 'minimax/hailuo-live', name: 'Hailuo Live', workflow: 'image-to-video', family: 'general', speed: 'Cinematic', output: 'video', supportsCinematic: true },
  { id: 'bytedance/omni-human', name: 'OmniHuman V1', workflow: 'lip-sync', family: 'general', speed: 'High Fidelity', output: 'video' },
  { id: 'bytedance/omni-human-1.5', name: 'OmniHuman 1.5', workflow: 'lip-sync', family: 'general', speed: 'Latest', output: 'video' },
  { id: 'black-forest-labs/flux-schnell', name: 'Flux Schnell', workflow: 'text-to-image', family: 'general', speed: 'Speed', output: 'image', supportsCinematic: true },
  { id: 'stability-ai/stable-diffusion-3', name: 'Stable Diffusion 3', workflow: 'text-to-image', family: 'general', speed: 'Accurate', output: 'image', supportsCinematic: true },
  { id: 'google/nano-banana-2', name: 'Nano Banana 2', workflow: 'text-to-image', family: 'nano-banana', speed: 'Fast + Editing', output: 'image', supportsCinematic: true },
  { id: 'google/nano-banana-pro', name: 'Nano Banana Pro', workflow: 'text-to-image', family: 'nano-banana', speed: 'Premium Quality', output: 'image', supportsCinematic: true },
  { id: 'recraft-ai/recraft-v3', name: 'Recraft V3', workflow: 'text-to-image', family: 'recraft', speed: 'Design + Typography', output: 'image', supportsCinematic: true },
  { id: 'bytedance/seedance-2.0', name: 'Seedance 2.0', workflow: 'multimodal-video', family: 'seedance', speed: 'Best Quality', output: 'video', supportsCinematic: true },
  { id: 'bytedance/seedance-2.0-fast', name: 'Seedance 2.0 Fast', workflow: 'multimodal-video', family: 'seedance', speed: 'Fast', output: 'video', supportsCinematic: true },
  { id: 'bytedance/seedance-2.0-mini', name: 'Seedance 2.0 Mini', workflow: 'multimodal-video', family: 'seedance', speed: 'Lower Cost', output: 'video', supportsCinematic: true },
  { id: 'kwaivgi/kling-v3-omni-video', name: 'Kling V3 Omni Video', workflow: 'video-edit', family: 'kling-edit', speed: 'Video Editing', output: 'video' },
  {
    id: 'topazlabs/video-upscale', name: 'Topaz Video Upscale', workflow: 'video-enhance', family: 'video-enhance', speed: 'Professional', output: 'video',
    controls: [
      select('target_resolution', 'Target Resolution', '1080p', [['720p', '720p'], ['1080p', '1080p'], ['4K', '4k']]),
      select('target_fps', 'Target FPS', 30, [['24 FPS', 24], ['30 FPS', 30], ['60 FPS', 60]]),
    ],
  },
  {
    id: 'philz1337x/crystal-video-upscaler', name: 'Crystal Video Upscaler', workflow: 'video-enhance', family: 'video-enhance', speed: 'Faces + Products', output: 'video',
    controls: [select('scale_factor', 'Upscale Factor', 2, [['2×', 2], ['3×', 3], ['4×', 4]], 'Output is capped at 4K. Premium-priced by output megapixels per second.')],
  },
  {
    id: 'xai/grok-imagine-video-extension', name: 'Grok Video Extension', workflow: 'video-enhance', family: 'video-enhance', speed: 'Extend Scene', output: 'video',
    controls: [select('extension_duration', 'Extension Length', 6, [[2, 2], [4, 4], [6, 6], [8, 8], [10, 10]].map(([label, value]) => [`${label} seconds`, value]))],
  },
  {
    id: 'prunaai/p-image-upscale', name: 'P-Image Upscale', workflow: 'image-upscale', family: 'image-upscale', speed: 'Fast', output: 'image',
    controls: [
      select('target_megapixels', 'Target Megapixels', 8, [4, 8, 16, 32, 64, 128].map((value) => [`${value} MP`, value])),
      { key: 'enhance_details', label: 'Enhance details', type: 'checkbox', defaultValue: false },
      { key: 'enhance_realism', label: 'Enhance realism', type: 'checkbox', defaultValue: false },
      select('output_format', 'Output Format', 'jpg', [['JPG', 'jpg'], ['PNG', 'png'], ['WebP', 'webp']]),
      { key: 'quality', label: 'Quality', type: 'range', defaultValue: 90, min: 50, max: 100, step: 1 },
    ],
  },
  {
    id: 'google/upscaler', name: 'Google Upscaler', workflow: 'image-upscale', family: 'image-upscale', speed: 'Clean 2× / 4×', output: 'image',
    controls: [select('upscale_factor', 'Upscale Factor', 2, [['2×', 2], ['4×', 4]]), { key: 'quality', label: 'Quality', type: 'range', defaultValue: 90, min: 50, max: 100, step: 1 }],
  },
  {
    id: 'philz1337x/clarity-pro-upscaler', name: 'Clarity Pro Upscaler', workflow: 'image-upscale', family: 'image-upscale', speed: 'Creative Detail', output: 'image',
    controls: [
      select('scale_factor', 'Upscale Factor', 2, [['2×', 2], ['4×', 4]]),
      { key: 'creativity', label: 'Creativity', type: 'range', defaultValue: 0, min: -10, max: 10, step: 1 },
      select('output_format', 'Output Format', 'png', [['PNG', 'png'], ['JPG', 'jpg']]),
    ],
  },
  { id: 'fictions-ai/autocaption:18a45ff0d95feb4449d192bbdc06b4a6df168fa33def76dfc51b78ae224b599b', name: 'AutoCaption', workflow: 'video-caption', family: 'caption', speed: 'Styled + Transcript', output: 'video' },
  { id: 'local/ffmpeg-social-resize', name: 'Social Resize', workflow: 'social-resize', family: 'local-processing', speed: 'Free Local Export', output: 'video' },
] as const;

export const getModelsForWorkflow = (workflow: string) => MODEL_REGISTRY.filter((model) => model.workflow === workflow);
export const getModelDefinition = (id: string) => MODEL_REGISTRY.find((model) => model.id === id);
