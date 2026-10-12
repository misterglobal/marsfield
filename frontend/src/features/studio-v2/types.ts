export type EntityId = string;

export type AssetKind = "image" | "video" | "audio" | "reference";

export type GenerationStatus =
  | "draft"
  | "ready"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

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
  assetId: EntityId;
  createdAt: string;
}

export interface GenerationJob {
  id: EntityId;
  projectId: EntityId;
  action: CreativeAction;
  prompt: string;
  inputAssetIds: EntityId[];
  status: GenerationStatus;
  progress?: number;
  results: GenerationResult[];
  errorMessage?: string;
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
