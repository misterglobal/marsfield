import { api, ApiRequestError } from "@/lib/api";
import type { GenerationJob, GenerationProviderMetadata, GenerationResult, GenerationStatus } from "./types";

interface ExistingGenerationResponse {
  id: string;
  status: string;
  output_url?: string | null;
  asset_id?: string;
  error?: string | null;
  credits_charged?: number;
}

export interface ImageGenerationRequest {
  prompt: string;
  projectId?: string;
  referenceStorageObjectId?: string;
}

export interface GenerationOptions {
  signal?: AbortSignal;
  onUpdate?: (job: GenerationJob) => void;
}

const IMAGE_ADAPTER: GenerationProviderMetadata = {
  adapter: "marsfield-text-to-image",
  model: "google/nano-banana-2",
};

const POLL_INTERVAL_MS = 1_500;
const MAX_POLLS = 120;

function normalizeStatus(response: ExistingGenerationResponse): GenerationStatus {
  if (response.status === "succeeded" && response.output_url) return "completed";
  if (response.status === "succeeded") return "processing";
  if (response.status === "failed") return "failed";
  if (response.status === "cancelled" || response.status === "canceled") return "cancelled";
  if (response.status === "starting" || response.status === "processing") return "processing";
  return "queued";
}

function makeResult(jobId: string, response: ExistingGenerationResponse): GenerationResult[] {
  if (!response.output_url) return [];
  return [{
    id: response.id,
    jobId,
    assetId: response.asset_id,
    kind: "image",
    url: response.output_url,
    createdAt: new Date().toISOString(),
  }];
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Generation tracking cancelled", "AbortError"));
      return;
    }
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Generation tracking cancelled", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function isRetryable(error: unknown) {
  if (!(error instanceof ApiRequestError)) return true;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

export async function generateImage(
  request: ImageGenerationRequest,
  options: GenerationOptions = {},
): Promise<GenerationJob> {
  const prompt = request.prompt.trim();
  if (!prompt) throw new Error("Describe the image you want to create.");

  const now = new Date().toISOString();
  const jobId = crypto.randomUUID();
  let job: GenerationJob = {
    id: jobId,
    projectId: request.projectId ?? "studio-v2-unassigned",
    action: "generate-image",
    prompt,
    inputAssetIds: [],
    status: "queued",
    progress: 5,
    results: [],
    credits: { charged: 0, unit: "credits" },
    provider: IMAGE_ADAPTER,
    createdAt: now,
    updatedAt: now,
  };
  options.onUpdate?.(job);

  try {
    const submitted = await api.generate({
      workflow: "text-to-image",
      model: IMAGE_ADAPTER.model,
      prompt,
      project_id: request.projectId,
      params: {
        aspect_ratio: "1:1",
        resolution: "1K",
        output_format: "jpg",
        variations: 1,
        reference_image_ids: request.referenceStorageObjectId
          ? [request.referenceStorageObjectId]
          : undefined,
      },
    }, { signal: options.signal }) as ExistingGenerationResponse;

    let response = submitted;
    let polls = 0;
    while (true) {
      const status = normalizeStatus(response);
      const terminal = status === "completed" || status === "failed" || status === "cancelled";
      job = {
        ...job,
        status,
        progress: status === "completed" ? 100 : terminal ? job.progress : Math.min(90, 15 + polls),
        results: makeResult(jobId, response),
        credits: { charged: submitted.credits_charged ?? 0, unit: "credits" },
        provider: { ...IMAGE_ADAPTER, providerJobId: response.id, rawStatus: response.status },
        error: status === "failed" ? {
          code: "generation_failed",
          message: response.error || "Image generation failed.",
          retryable: false,
        } : undefined,
        updatedAt: new Date().toISOString(),
      };
      options.onUpdate?.(job);
      if (terminal) return job;

      if (polls >= MAX_POLLS) {
        job = {
          ...job,
          status: "failed",
          error: {
            code: "generation_timeout",
            message: "Generation is taking longer than expected. Check the asset library shortly.",
            retryable: true,
          },
          updatedAt: new Date().toISOString(),
        };
        options.onUpdate?.(job);
        return job;
      }

      await wait(POLL_INTERVAL_MS, options.signal);
      polls += 1;
      response = await api.getPrediction(submitted.id, { signal: options.signal }) as ExistingGenerationResponse;
    }
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === "AbortError";
    job = {
      ...job,
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? undefined : {
        code: error instanceof ApiRequestError
          ? error.code ?? `http_${error.status}`
          : "generation_request_failed",
        message: error instanceof Error ? error.message : "Unable to generate the image.",
        retryable: isRetryable(error),
      },
      updatedAt: new Date().toISOString(),
    };
    options.onUpdate?.(job);
    return job;
  }
}
