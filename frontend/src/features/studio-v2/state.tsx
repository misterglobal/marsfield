"use client";

import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { api } from "@/lib/api";
import type { Asset, EntityId, GenerationJob, Project, WorkspaceState, WorkspaceView } from "./types";

interface StudioState {
  projects: Project[];
  assets: Asset[];
  jobs: GenerationJob[];
  selectedProjectId: EntityId | null;
  selectedAssetId: EntityId | null;
  projectsLoading: boolean;
  assetsLoading: boolean;
  loadError: string | null;
  restored: boolean;
  activeUserId: string | null;
  workspace: WorkspaceState;
}

type StudioAction =
  | { type: "select-project"; projectId: EntityId | null }
  | { type: "select-asset"; assetId: EntityId | null }
  | { type: "set-composer-draft"; value: string }
  | { type: "set-inspector-open"; open: boolean }
  | { type: "set-navigation-open"; open: boolean }
  | { type: "set-workspace-view"; view: WorkspaceView }
  | { type: "replace-jobs"; jobs: GenerationJob[] }
  | { type: "upsert-job"; job: GenerationJob }
  | { type: "restore-workspace"; projectId: EntityId | null; composerDraft: string }
  | { type: "replace-projects"; projects: Project[] }
  | { type: "replace-assets"; assets: Asset[] }
  | { type: "set-load-error"; message: string | null }
  | { type: "set-projects-loading"; loading: boolean }
  | { type: "set-assets-loading"; loading: boolean }
  | { type: "reset-user"; userId: string | null; projectId: EntityId | null; composerDraft: string };

const initialState: StudioState = {
  projects: [],
  assets: [],
  jobs: [],
  selectedProjectId: null,
  selectedAssetId: null,
  projectsLoading: true,
  assetsLoading: true,
  loadError: null,
  restored: false,
  activeUserId: null,
  workspace: {
    composerDraft: "",
    inspectorOpen: false,
    navigationOpen: false,
    view: "board",
  },
};

function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "select-project":
      return { ...state, selectedProjectId: action.projectId, selectedAssetId: null };
    case "select-asset":
      return { ...state, selectedAssetId: action.assetId };
    case "set-composer-draft":
      return { ...state, workspace: { ...state.workspace, composerDraft: action.value } };
    case "set-inspector-open":
      return { ...state, workspace: { ...state.workspace, inspectorOpen: action.open } };
    case "set-navigation-open":
      return { ...state, workspace: { ...state.workspace, navigationOpen: action.open } };
    case "set-workspace-view":
      return { ...state, workspace: { ...state.workspace, view: action.view } };
    case "replace-jobs":
      return { ...state, jobs: action.jobs };
    case "upsert-job": {
      const exists = state.jobs.some((job) => job.id === action.job.id);
      return {
        ...state,
        jobs: exists
          ? state.jobs.map((job) => job.id === action.job.id ? action.job : job)
          : [action.job, ...state.jobs],
      };
    }
    case "restore-workspace":
      return {
        ...state,
        selectedProjectId: action.projectId,
        workspace: { ...state.workspace, composerDraft: action.composerDraft },
        restored: true,
      };
    case "replace-projects":
      return {
        ...state,
        projects: action.projects,
        selectedProjectId: state.selectedProjectId && action.projects.some((project) => project.id === state.selectedProjectId)
          ? state.selectedProjectId
          : null,
        projectsLoading: false,
      };
    case "replace-assets":
      return { ...state, assets: action.assets, selectedAssetId: null, assetsLoading: false };
    case "set-load-error":
      return { ...state, loadError: action.message };
    case "set-projects-loading":
      return { ...state, projectsLoading: action.loading };
    case "set-assets-loading":
      return { ...state, assetsLoading: action.loading };
    case "reset-user":
      return {
        ...initialState,
        selectedProjectId: action.projectId,
        workspace: { ...initialState.workspace, composerDraft: action.composerDraft },
        restored: true,
        activeUserId: action.userId,
      };
  }
}

interface StudioContextValue {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  selectedProject: Project | null;
  selectedAsset: Asset | null;
}

const StudioContext = createContext<StudioContextValue | null>(null);

const projectKey = (userId: string) => `marsfield_studio_v2_project_${userId}`;
const draftKey = (userId: string) => `marsfield_studio_v2_draft_${userId}`;

function normalizeProject(project: Record<string, unknown>): Project {
  return {
    id: String(project.id),
    name: String(project.name || "Untitled project"),
    description: typeof project.description === "string" ? project.description : undefined,
    createdAt: String(project.createdAt || ""),
    updatedAt: String(project.updatedAt || ""),
  };
}

function normalizeAsset(asset: Record<string, unknown>): Asset {
  const prediction = asset.prediction as Record<string, unknown> | undefined;
  return {
    id: String(asset.id),
    projectId: asset.projectId ? String(asset.projectId) : undefined,
    kind: String(asset.type || "image") as Asset["kind"],
    name: typeof prediction?.prompt === "string" && prediction.prompt.trim()
      ? prediction.prompt
      : `${String(asset.type || "media")} asset`,
    url: String(asset.url || ""),
    thumbnailUrl: typeof asset.thumbnailUrl === "string" ? asset.thumbnailUrl : undefined,
    storageObjectId: asset.storageObjectId ? String(asset.storageObjectId) : undefined,
    sourceGenerationId: asset.predictionId ? String(asset.predictionId) : undefined,
    createdAt: String(asset.createdAt || ""),
  };
}

export function StudioProvider({ children, userId }: PropsWithChildren<{ userId?: string }>) {
  const [state, dispatch] = useReducer(studioReducer, initialState);

  useEffect(() => {
    dispatch(userId ? {
      type: "reset-user",
      userId,
      projectId: localStorage.getItem(projectKey(userId)),
      composerDraft: localStorage.getItem(draftKey(userId)) || "",
    } : { type: "reset-user", userId: null, projectId: null, composerDraft: "" });
  }, [userId]);

  useEffect(() => {
    if (!state.restored || !userId) return;
    if (state.selectedProjectId) localStorage.setItem(projectKey(userId), state.selectedProjectId);
    else localStorage.removeItem(projectKey(userId));
    localStorage.setItem(draftKey(userId), state.workspace.composerDraft);
  }, [state.restored, state.selectedProjectId, state.workspace.composerDraft, userId]);

  useEffect(() => {
    if (!userId || !state.restored) return;
    let active = true;
    dispatch({ type: "set-projects-loading", loading: true });
    dispatch({ type: "set-load-error", message: null });
    void api.getProjects()
      .then((projects: Record<string, unknown>[]) => {
        if (!active) return;
        const normalized = projects.map(normalizeProject);
        dispatch({ type: "replace-projects", projects: normalized });
      })
      .catch((error: unknown) => {
        if (active) {
          dispatch({ type: "set-projects-loading", loading: false });
          dispatch({ type: "set-load-error", message: error instanceof Error ? error.message : "Unable to load projects." });
        }
      });
    return () => { active = false; };
  }, [userId, state.restored]);

  useEffect(() => {
    if (!userId || !state.restored) return;
    let active = true;
    dispatch({ type: "set-assets-loading", loading: true });
    dispatch({ type: "set-load-error", message: null });
    void api.getAssets(state.selectedProjectId ?? undefined)
      .then((assets: Record<string, unknown>[]) => {
        if (active) dispatch({ type: "replace-assets", assets: assets.map(normalizeAsset) });
      })
      .catch((error: unknown) => {
        if (active) {
          dispatch({ type: "set-assets-loading", loading: false });
          dispatch({ type: "set-load-error", message: error instanceof Error ? error.message : "Unable to load assets." });
        }
      });
    return () => { active = false; };
  }, [userId, state.restored, state.selectedProjectId]);
  const value = useMemo<StudioContextValue>(() => ({
    state,
    dispatch,
    selectedProject: state.projects.find((project) => project.id === state.selectedProjectId) ?? null,
    selectedAsset: state.assets.find((asset) => asset.id === state.selectedAssetId) ?? null,
  }), [state]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used within StudioProvider");
  return context;
}
