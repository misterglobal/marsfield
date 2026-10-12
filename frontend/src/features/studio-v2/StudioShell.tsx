"use client";

import { EmptyState, IconButton, SegmentedControl, StudioRegion } from "./StudioPrimitives";
import { StudioProvider, useStudio } from "./state";
import type { WorkspaceView } from "./types";
import styles from "./studio-v2.module.css";

function StudioNavigation() {
  const { state } = useStudio();

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
        <p>{state.projects.length === 0 ? "No Studio V2 projects yet" : `${state.projects.length} projects`}</p>
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
        <p>Select an asset or generation to see its settings, lineage, and available actions.</p>
        <dl>
          <div><dt>Selection</dt><dd>None</dd></div>
          <div><dt>Active jobs</dt><dd>{state.jobs.filter((job) => job.status === "running" || job.status === "queued").length}</dd></div>
          <div><dt>Workspace</dt><dd>{state.workspace.view}</dd></div>
        </dl>
      </div>
    </aside>
  );
}

function StudioComposer() {
  const { state, dispatch } = useStudio();

  return (
    <form className={styles.composer} aria-label="Universal composer" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="studio-v2-prompt">What do you want to create?</label>
      <div className={styles.composerInput}>
        <textarea
          id="studio-v2-prompt"
          value={state.workspace.composerDraft}
          onChange={(event) => dispatch({ type: "set-composer-draft", value: event.target.value })}
          placeholder="Describe the creative outcome. Tools and models will come later."
          rows={2}
        />
        <button type="submit" disabled title="Generation arrives in a later Studio V2 stage">Create</button>
      </div>
      <div className={styles.composerMeta}>
        <span>No references attached</span>
        <span>Generation disabled in foundation</span>
      </div>
    </form>
  );
}

function StudioWorkspace() {
  const { state, dispatch } = useStudio();

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
          <h1>Untitled project</h1>
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
        <EmptyState
          eyebrow="Studio V2 foundation"
          title="Start with the creative outcome"
          description="This workspace is ready for projects, assets, generations, and lineage. Existing tools remain unchanged while each capability moves here in later stages."
          action={<button type="button" onClick={() => document.getElementById("studio-v2-prompt")?.focus()}>Start describing</button>}
        />
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
  return <StudioProvider><StudioFrame /></StudioProvider>;
}
