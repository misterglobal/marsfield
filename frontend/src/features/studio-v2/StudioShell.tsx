"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { useAuth } from "@/app/layout";
import { generateImage } from "./generation-service";
import { EmptyState, IconButton, SegmentedControl, StudioRegion } from "./StudioPrimitives";
import { StudioProvider, useStudio } from "./state";
import type { WorkspaceView } from "./types";
import styles from "./studio-v2.module.css";

function StudioNavigation() {
  const { state, dispatch } = useStudio();

  return (
    <aside
      id="studio-v2-navigation"
      className={`${styles.navigation} ${state.workspace.navigationOpen ? styles.navigationOpen : ""}`}
      aria-label="Studio V2 navigation"
    >
      <div className={styles.brand}>
        <span aria-hidden="true" className={styles.brandMark}>M</span>
        <div>
          <strong>Marsfield</strong>
          <small>Studio V2</small>
        </div>
      </div>
      <nav aria-label="Studio V2 sections">
        <button type="button" className={styles.navActive}>Workspace</button>
        <button type="button" disabled>Projects</button>
        <button type="button" disabled>Assets</button>
      </nav>
      <div className={styles.projectList}>
        <span className={styles.sectionLabel}>Projects</span>
        {state.projectsLoading ? <p>Loading projects…</p> : state.projects.length === 0 ? <p>No projects yet</p> : (
          <div className={styles.selectionList}>
            {state.projects.map((project) => (
              <button
                type="button"
                key={project.id}
                className={state.selectedProjectId === project.id ? styles.selectionActive : ""}
                aria-pressed={state.selectedProjectId === project.id}
                onClick={() => dispatch({ type: "select-project", projectId: project.id })}
              >
                {project.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className={styles.internalLabel}>Internal preview</p>
    </aside>
  );
}

function StudioInspector() {
  const { state, selectedAsset, selectedProject, dispatch } = useStudio();

  return (
    <aside
      id="studio-v2-inspector"
      className={`${styles.inspector} ${state.workspace.inspectorOpen ? styles.inspectorOpen : ""}`}
      aria-label="Contextual inspector"
    >
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.sectionLabel}>Inspector</span>
          <h2>{selectedAsset?.name ?? selectedProject?.name ?? "Nothing selected"}</h2>
        </div>
        <IconButton aria-label="Close inspector" onClick={() => dispatch({ type: "set-inspector-open", open: false })}>×</IconButton>
      </div>
      <div className={styles.inspectorBody}>
        <p>{selectedAsset ? "This owned asset is selected as the composer reference." : selectedProject ? "New generations will be saved to this project." : "Select a project or asset to establish creative context."}</p>
        <dl>
          <div><dt>Selection</dt><dd>{selectedAsset?.kind ?? (selectedProject ? "project" : "none")}</dd></div>
          {selectedAsset?.storageObjectId && <div><dt>Reference</dt><dd>Ready</dd></div>}
          <div><dt>Active jobs</dt><dd>{state.jobs.filter((job) => job.status === "processing" || job.status === "queued").length}</dd></div>
          <div><dt>Workspace</dt><dd>{state.workspace.view}</dd></div>
        </dl>
      </div>
    </aside>
  );
}

function StudioComposer() {
  const { state, dispatch } = useStudio();
  const abortController = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const activeUserId = useRef(state.activeUserId);
  const activeJob = state.jobs[0];

  useEffect(() => {
    activeUserId.current = state.activeUserId;
    return () => abortController.current?.abort();
  }, [state.activeUserId]);

  const submitGeneration = async () => {
    if (submitting.current) return;
    submitting.current = true;
    const generationUserId = state.activeUserId;
    abortController.current?.abort();
    abortController.current = new AbortController();
    try {
      await generateImage(
        {
          prompt: state.workspace.composerDraft,
          projectId: state.selectedProjectId ?? undefined,
          referenceStorageObjectId: state.assets.find((asset) => asset.id === state.selectedAssetId && asset.kind === "image")?.storageObjectId,
        },
        {
          signal: abortController.current.signal,
          onUpdate: (job) => {
            if (generationUserId && activeUserId.current === generationUserId) {
              dispatch({ type: "upsert-job", job });
            }
          },
        },
      );
    } finally {
      submitting.current = false;
    }
  };

  return (
    <form className={styles.composer} aria-label="Universal composer" onSubmit={(event) => {
      event.preventDefault();
      void submitGeneration();
    }}>
      <label htmlFor="studio-v2-prompt">What do you want to create?</label>
      <div className={styles.composerInput}>
        <textarea
          id="studio-v2-prompt"
          disabled={!state.activeUserId}
          value={state.workspace.composerDraft}
          onChange={(event) => dispatch({ type: "set-composer-draft", value: event.target.value })}
          placeholder="Describe the creative outcome. Tools and models will come later."
          rows={2}
        />
        <button
          type="submit"
          disabled={!state.activeUserId || !state.workspace.composerDraft.trim() || activeJob?.status === "queued" || activeJob?.status === "processing"}
        >
          {activeJob?.status === "queued" || activeJob?.status === "processing" ? "Creating…" : "Create image"}
        </button>
        {(activeJob?.status === "queued" || activeJob?.status === "processing") && (
          <button type="button" className={styles.cancelButton} onClick={() => abortController.current?.abort()}>
            Cancel tracking
          </button>
        )}
      </div>
      <div className={styles.composerMeta}>
        <span>{state.assets.some((asset) => asset.id === state.selectedAssetId && asset.kind === "image" && asset.storageObjectId) ? "1 image reference attached" : "No references attached"}</span>
        <span>Image generation · {activeJob ? `${activeJob.credits.charged} credits charged` : "existing Marsfield API"}</span>
      </div>
    </form>
  );
}

function StudioWorkspace() {
  const { state, selectedProject, dispatch } = useStudio();
  const activeJob = state.jobs[0];

  return (
    <div className={styles.workspace} role="region" aria-label="Studio V2 workspace">
      <header className={styles.workspaceHeader}>
        <div className={styles.mobileActions}>
          <IconButton
            aria-label="Open Studio navigation"
            aria-controls="studio-v2-navigation"
            aria-expanded={state.workspace.navigationOpen}
            onClick={() => dispatch({ type: "set-navigation-open", open: !state.workspace.navigationOpen })}
          >
            ☰
          </IconButton>
        </div>
        <div>
          <span className={styles.eyebrow}>Creative work first</span>
          <h1>{selectedProject?.name ?? "All creative work"}</h1>
        </div>
        <div className={styles.workspaceTools}>
          <SegmentedControl
            label="Workspace view"
            value={state.workspace.view}
            options={[{ label: "Board", value: "board" }, { label: "Grid", value: "grid" }]}
            onChange={(view) => dispatch({ type: "set-workspace-view", view: view as WorkspaceView })}
          />
          <IconButton
            aria-label="Open contextual inspector"
            aria-controls="studio-v2-inspector"
            aria-expanded={state.workspace.inspectorOpen}
            onClick={() => dispatch({ type: "set-inspector-open", open: !state.workspace.inspectorOpen })}
          >
            ⋯
          </IconButton>
        </div>
      </header>
      <StudioRegion label="Creative workspace" className={styles.canvas}>
        {state.loadError ? (
          <EmptyState eyebrow="Workspace unavailable" title="We couldn't load your workspace" description={state.loadError} />
        ) : activeJob ? (
          <article className={styles.generationCard} aria-live="polite" data-error-code={activeJob.error?.code}>
            <span className={styles.eyebrow}>Image generation</span>
            <h2>{activeJob.status === "completed" ? "Image ready" : activeJob.status === "failed" ? "Generation failed" : activeJob.status === "cancelled" ? "Tracking cancelled" : "Creating your image"}</h2>
            <p>{activeJob.prompt}</p>
            {(activeJob.status === "queued" || activeJob.status === "processing") && (
              <div className={styles.progress} role="progressbar" aria-label="Image generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={activeJob.progress}>
                <span style={{ width: `${activeJob.progress}%` }} />
              </div>
            )}
            {activeJob.error && <p className={styles.generationError}>{activeJob.error.message}</p>}
            {activeJob.error && (
              <p>{activeJob.error.retryable ? "You can try this request again." : "Review your account or request before trying again."}</p>
            )}
            {activeJob.results[0] && (
              <Image
                className={styles.generatedImage}
                src={activeJob.results[0].url}
                alt={`Generated result for ${activeJob.prompt}`}
                width={768}
                height={768}
                unoptimized
              />
            )}
            <p className={styles.generationMeta}>{activeJob.status} · {activeJob.progress}% · {activeJob.credits.charged} credits</p>
          </article>
        ) : state.projectsLoading || state.assetsLoading ? (
          <p role="status">Loading workspace…</p>
        ) : state.assets.length > 0 ? (
          <div className={styles.assetGrid} aria-label="Workspace assets">
            {state.assets.map((asset) => (
              <button
                type="button"
                key={asset.id}
                className={state.selectedAssetId === asset.id ? styles.assetSelected : ""}
                aria-pressed={state.selectedAssetId === asset.id}
                disabled={asset.kind !== "image" || !asset.storageObjectId}
                onClick={() => dispatch({ type: "select-asset", assetId: asset.id })}
              >
                {asset.kind === "image" && (asset.thumbnailUrl || asset.url) ? (
                  <Image src={asset.thumbnailUrl || asset.url} alt="" width={240} height={240} unoptimized />
                ) : <span className={styles.assetPlaceholder}>{asset.kind}</span>}
                <span>{asset.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            eyebrow="Unified generation"
            title="Start with the creative outcome"
            description="Describe an image and Studio V2 will handle the existing generation API, lifecycle, credits, and result without exposing provider-specific controls."
            action={<button type="button" onClick={() => document.getElementById("studio-v2-prompt")?.focus()}>Describe an image</button>}
          />
        )}
      </StudioRegion>
      <StudioComposer />
    </div>
  );
}

function StudioFrame() {
  return (
    <div className={styles.studioV2} data-testid="studio-v2-shell">
      <StudioNavigation />
      <StudioWorkspace />
      <StudioInspector />
    </div>
  );
}

export function StudioShell() {
  const { user } = useAuth();
  return <StudioProvider userId={user?.id}><StudioFrame /></StudioProvider>;
}
