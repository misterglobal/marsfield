"use client";

import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  useContext,
  useMemo,
  useReducer,
} from "react";
import type { Asset, EntityId, GenerationJob, Project, WorkspaceState, WorkspaceView } from "./types";

interface StudioState {
  projects: Project[];
  assets: Asset[];
  jobs: GenerationJob[];
  selectedProjectId: EntityId | null;
  selectedAssetId: EntityId | null;
  workspace: WorkspaceState;
}

type StudioAction =
  | { type: "select-project"; projectId: EntityId | null }
  | { type: "select-asset"; assetId: EntityId | null }
  | { type: "set-composer-draft"; value: string }
  | { type: "set-inspector-open"; open: boolean }
  | { type: "set-navigation-open"; open: boolean }
  | { type: "set-workspace-view"; view: WorkspaceView }
  | { type: "replace-jobs"; jobs: GenerationJob[] };

const initialState: StudioState = {
  projects: [],
  assets: [],
  jobs: [],
  selectedProjectId: null,
  selectedAssetId: null,
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
  }
}

interface StudioContextValue {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  selectedProject: Project | null;
  selectedAsset: Asset | null;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(studioReducer, initialState);
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
