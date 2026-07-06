import Replicate from 'replicate';

export interface PredictionInput {
  prompt?: string;
  duration?: number;
  fps?: number;
  camera_move?: string;
  aspect_ratio?: string;
  image?: string;
  resolution?: string;
  generate_audio?: boolean;
  seed?: number;
  reference_images?: Array<string | Blob>;
  reference_videos?: Array<string | Blob>;
  reference_audio?: Array<string | Blob>;
  first_frame_image?: string | Blob;
  last_frame_image?: string | Blob;
  reference_video?: string;
  video_reference_type?: 'feature' | 'base';
  keep_original_sound?: boolean;
  mode?: string;
  [key: string]: unknown;
}

export class ReplicateService {
  private replicate: Replicate | null = null;

  constructor() {
    const token = process.env.REPLICATE_API_TOKEN;
    if (token) {
      this.replicate = new Replicate({ auth: token });
    } else {
      console.warn("REPLICATE_API_TOKEN is not defined. Falling back to Mock predictions generator.");
    }
  }

  public async createPrediction(
    model: string,
    input: PredictionInput,
    webhookUrl?: string
  ): Promise<{ id: string; status: string; outputUrl?: string }> {
    // If Replicate token exists, use real API
    if (this.replicate) {
      try {
        const payload: any = {
          model,
          input,
        };

        if (webhookUrl) {
          payload.webhook = webhookUrl;
          payload.webhook_events_filter = ['completed'];
        }

        const prediction = await this.replicate.predictions.create(payload);
        return {
          id: prediction.id,
          status: prediction.status,
          outputUrl: this.getOutputUrl(prediction.output),
        };
      } catch (error) {
        console.error("Replicate API Error:", this.formatReplicateError(error));
        throw error;
      }
    }

    // Mock response fallback for offline testing
    const mockId = `mock_pred_${Math.random().toString(36).substring(7)}`;
    return {
      id: mockId,
      status: 'succeeded',
      outputUrl: model.includes('flux') || model.includes('diffusion') || model.includes('banana') || model.includes('recraft')
        ? 'https://picsum.photos/800/600' // Mock Image
        : 'https://www.w3schools.com/html/mov_bbb.mp4', // Mock Video
    };
  }

  public async getPrediction(id: string): Promise<{ id: string; status: string; outputUrl?: string; error?: string }> {
    if (this.replicate && !id.startsWith('mock_')) {
      try {
        const prediction = await this.replicate.predictions.get(id);
        return {
          id: prediction.id,
          status: prediction.status,
          outputUrl: this.getOutputUrl(prediction.output),
          error: prediction.error,
        };
      } catch (error) {
        console.error("Replicate status retrieve error:", this.formatReplicateError(error));
        throw error;
      }
    }

    return {
      id,
      status: 'succeeded',
      outputUrl: id.includes('image')
        ? 'https://picsum.photos/800/600'
        : 'https://www.w3schools.com/html/mov_bbb.mp4',
    };
  }

  private getOutputUrl(output: unknown): string | undefined {
    const value = Array.isArray(output) ? output[0] : output;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const candidate = value as { url?: string; uri?: string };
      return candidate.url || candidate.uri;
    }
    return undefined;
  }

  private formatReplicateError(error: unknown): Record<string, unknown> {
    if (!error || typeof error !== 'object') {
      return { message: String(error) };
    }

    const value = error as {
      name?: string;
      message?: string;
      response?: { status?: number; statusText?: string; url?: string };
    };

    return {
      name: value.name,
      message: value.message,
      status: value.response?.status,
      statusText: value.response?.statusText,
      url: value.response?.url,
    };
  }
}
