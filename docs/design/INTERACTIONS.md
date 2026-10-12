# Marsfield Studio V2 Interactions

## Workspace anatomy

Studio V2 uses a stable interaction frame:

- **Workspace:** the primary surface for assets, comparisons, generated outputs, and direct manipulation.
- **Universal composer:** the persistent intent and generation entry point.
- **Contextual inspector:** controls and metadata for the current selection or pending generation.
- **Project navigation:** project identity, history, persistence state, and workspace-level actions.
- **Generation activity:** running, queued, completed, failed, and cancelled work without blocking the workspace.

The workspace remains primary. Panels support it and must not consume attention when they have nothing useful to show.

## Universal composer

The composer accepts natural-language intent and optional selected assets. It should remain available throughout the project, expose attached references and active selections, distinguish creator intent from generated model instructions, preview action/model/estimated cost/output type, preserve drafts per project, and prevent accidental credit-consuming submission.

The composer may route intent to an appropriate capability, but the interface must describe the action before generation begins.

## Contextual inspector

The inspector adapts to context:

- **No selection:** project guidance, recent activity, and suggested next steps.
- **Asset selected:** metadata, lineage summary, reusable references, and available actions.
- **Multiple assets selected:** shared actions, ordering, comparison, and compatibility warnings.
- **Generation prepared:** model, dimensions, duration, quality, cost, advanced settings, and validation.
- **Generation running:** progress, elapsed state, inputs, cancellation, and non-blocking navigation.

Selection changes should not discard unsaved composer content. Destructive context changes require confirmation.

## Asset selection and direct manipulation

Assets use consistent selected, focused, and active states. Creators can select one asset, multi-select compatible assets, drag assets into composer/reference roles, reorder references, open focused previews, compare candidates, mark preferred outputs, and invoke contextual actions such as vary, extend, remix, use as reference, or continue from here.

Direct manipulation must have keyboard and touch equivalents. Drop targets communicate accepted media and resulting action before release.

## Generation lifecycle

Every generation follows explicit states:

1. **Draft:** incomplete and costs nothing.
2. **Ready:** valid, with action and estimated cost visible.
3. **Queued:** accepted and awaiting execution.
4. **Running:** provider work is active.
5. **Succeeded:** outputs join the workspace and lineage.
6. **Failed:** cause, credit outcome, retry eligibility, and retained inputs are clear.
7. **Cancelled:** cancellation and any provider or credit consequence are clear.

The workspace remains usable during queued and running states. Retrying creates a linked generation rather than overwriting history.

## Lineage and actions

Each output records parent assets, references, prompt, model, settings, and generation status. The creator can inspect origins and move forward through variants and edits. Lineage appears as a concise trail first and expands into a graph when needed. Actions such as variation, continuation, and reuse establish explicit relationships rather than invisible copies.

## Characters and reusable references

Creators can save an asset or curated set as a named character or reference. Reuse exposes its source material, scope, ownership/deletion rules, generation usage, version history, and model compatibility. Updating a reference must not rewrite prior lineage.

## Project persistence

Projects persist composer drafts, workspace ordering, selected assets, inspector context, generations, lineage, and reusable references. Autosave is quiet when healthy and visible when delayed or failed. Reopening restores useful working context without restoring stale modal state.

## Loading, empty, and error states

- Use skeletons only when destination structure is known.
- Name the operation instead of showing generic spinners.
- Keep completed assets interactive while other work loads.
- Empty states offer one clear creative starting action.
- Errors state what failed, what was preserved, whether credits were affected, and the next safe action.
- Never imply work is saved during persistence or connectivity failure.
- Offer alternatives after repeated provider failures without silently changing model or cost.

## Responsive behavior

Desktop presents workspace, composer, and inspector concurrently when space permits. Tablet may overlay or collapse the inspector. Mobile uses a single primary surface with bottom-sheet composer and inspector modes. Across sizes, selection and lineage semantics remain consistent, the composer and generation status remain reachable, touch targets are accessible, keyboard and assistive-technology workflows remain complete, and controls collapse by priority rather than arbitrary omission.

