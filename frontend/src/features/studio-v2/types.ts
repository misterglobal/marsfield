export type EntityId = string;

export type AssetKind = "image" | "video" | "audio" | "reference";

export type GenerationStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface GenerationError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface GenerationCredits {
  charged: number;
  unit: "credits";
}

export interface GenerationProviderMetadata {
  adapter: string;
  model?: string;
  providerJobId?: string;
  rawStatus?: string;
}

export interface Project {
  id: EntityId;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: EntityId;
  projectId: EntityId;
  kind: AssetKind;
  name: string;
  thumbnailUrl?: string;
  sourceGenerationId?: EntityId;
  createdAt: string;
}

export interface GenerationResult {
  id: EntityId;
  jobId: EntityId;
  assetId?: EntityId;
  kind: "image";
  url: string;
  createdAt: string;
}

export interface GenerationJob {
  id: EntityId;
  projectId: EntityId;
  action: CreativeAction;
  prompt: string;
  inputAssetIds: EntityId[];
  status: GenerationStatus;
  progress: number;
  results: GenerationResult[];
  credits: GenerationCredits;
  provider: GenerationProviderMetadata;
  error?: GenerationError;
  createdAt: string;
  updatedAt: string;
}

export type CreativeAction =
  | "generate-image"
  | "generate-video"
  | "generate-audio"
  | "vary"
  | "remix"
  | "extend"
  | "use-as-reference";

export type WorkspaceView = "board" | "grid";

export interface WorkspaceState {
  composerDraft: string;
  inspectorOpen: boolean;
  navigationOpen: boolean;
  view: WorkspaceView;
}
