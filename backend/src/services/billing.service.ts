export interface GenerationBillingInput {
  workflow: string;
  model: string;
  params?: Record<string, unknown>;
}

export interface GenerationBillingQuote {
  baseCredits: number;
  variationCount: number;
  variationCredits: number;
  totalCredits: number;
}

const MAX_VARIATIONS_PER_REQUEST = 4;

function parseVariationCount(params?: Record<string, unknown>): number {
  const requested = params?.variations ?? params?.variation_count ?? 1;

  if (requested === undefined || requested === null || requested === '') {
    return 1;
  }

  if (typeof requested !== 'number' || !Number.isInteger(requested) || requested < 1 || requested > MAX_VARIATIONS_PER_REQUEST) {
    throw new Error(`Variations must be an integer from 1 to ${MAX_VARIATIONS_PER_REQUEST}`);
  }

  return requested;
}

function getBaseCredits(input: GenerationBillingInput): number {
  if (input.workflow === 'social-resize') return 0;
  if (input.workflow === 'video-caption') return 4;
  if (input.workflow === 'image-upscale') {
    if (input.model === 'google/upscaler') return 1;
    const outputMegapixels = Number(input.params?.output_megapixels || 0);
    if (!Number.isFinite(outputMegapixels) || outputMegapixels <= 0) throw new Error('Could not calculate upscale output size');
    if (input.model === 'prunaai/p-image-upscale') {
      const estimatedCost = outputMegapixels <= 4 ? 0.005
        : outputMegapixels <= 8 ? 0.01
          : outputMegapixels <= 16 ? 0.02
            : outputMegapixels <= 32 ? 0.04
              : outputMegapixels <= 64 ? 0.06 : 0.12;
      return Math.max(1, Math.ceil(estimatedCost * 31.25));
    }
    if (input.model === 'philz1337x/clarity-pro-upscaler') {
      return Math.max(1, Math.ceil(outputMegapixels * 0.03 * 31.25));
    }
  }

  if (input.workflow === 'video-enhance') {
    const duration = Number(input.params?.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not calculate enhancement duration');
    if (input.model === 'xai/grok-imagine-video-extension') {
      const outputDuration = Number(input.params?.output_duration || duration);
      return Math.max(1, Math.ceil(outputDuration * 0.05 * 31.25));
    }
    if (input.model === 'topazlabs/video-upscale') {
      const resolution = input.params?.target_resolution || '1080p';
      const fps = Number(input.params?.target_fps || 30);
      const costPerSecond30 = resolution === '4k' ? 0.0746 : resolution === '720p' ? 0.0054 : 0.0186;
      const estimatedCost = duration * costPerSecond30 * (fps > 30 ? 2 : 1);
      return Math.max(1, Math.ceil(estimatedCost * 31.25));
    }
    if (input.model === 'philz1337x/crystal-video-upscaler') {
      const inputMegapixels = Number(input.params?.input_megapixels || 0);
      const scaleFactor = Number(input.params?.scale_factor || 2);
      const inputFps = Number(input.params?.input_fps || 30);
      const outputMegapixels = Math.min(8.2944, inputMegapixels * scaleFactor * scaleFactor);
      const estimatedCost = duration * outputMegapixels * (inputFps > 30 ? 0.2 : 0.1);
      return Math.max(1, Math.ceil(estimatedCost * 31.25));
    }
  }

  if (input.model === 'google/nano-banana-pro') {
    return input.params?.resolution === '4K' ? 6 : 3;
  }
  if (input.model === 'google/nano-banana-2') {
    return input.params?.resolution === '4K' ? 2 : 1;
  }
  if (input.workflow === 'text-to-image') return 1;

  const requestedDuration = Number(input.params?.duration ?? 5);
  const effectiveDuration = requestedDuration === -1 ? 15 : requestedDuration;
  if (!Number.isFinite(effectiveDuration) || effectiveDuration <= 0) {
    throw new Error('Duration must be a positive number or -1 for automatic duration');
  }

  if (input.model === 'kwaivgi/kling-v3-omni-video') {
    const creditsPerSecond = input.params?.mode === 'standard' ? 5 : 7;
    return Math.ceil(effectiveDuration) * creditsPerSecond;
  }

  if (input.model === 'xai/grok-imagine-video-1.5') {
    return Math.ceil(effectiveDuration) * 2;
  }

  const durationBlocks = Math.max(1, Math.ceil(effectiveDuration / 5));
  if (input.model === 'bytedance/seedance-2.0-mini') return 2 * durationBlocks;
  if (input.model === 'bytedance/seedance-2.0-fast') return 3 * durationBlocks;
  if (input.model === 'bytedance/seedance-2.0') return 4 * durationBlocks;
  if (input.workflow.includes('video') || input.workflow === 'lip-sync') return 3 * durationBlocks;
  return 1;
}

export function quoteGeneration(input: GenerationBillingInput): GenerationBillingQuote {
  const baseCredits = getBaseCredits(input);
  const variationCount = parseVariationCount(input.params);
  if (baseCredits === 0) {
    return {
      baseCredits,
      variationCount: 1,
      variationCredits: 0,
      totalCredits: 0,
    };
  }
  const additionalOutputCredits = input.model === 'google/nano-banana-pro'
    ? baseCredits
    : Math.ceil(baseCredits * 0.75);
  const variationCredits = Math.max(0, variationCount - 1) * additionalOutputCredits;

  return {
    baseCredits,
    variationCount,
    variationCredits,
    totalCredits: baseCredits + variationCredits,
  };
}
