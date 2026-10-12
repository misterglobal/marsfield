# Studio V2 Roadmap

## Goal

Deliver Studio V2 as reviewable pull requests while preserving the current production experience until an explicit cutover. The target follows **Creative work first. Tools second.** Each stage is independently testable, reversible, and protected by existing authorization, ownership, credit, safety, and provider-spend controls.

## Delivery rules

- Keep production behavior unchanged until cutover.
- Prefer adapters around existing generation capabilities before replacement.
- Add observability and tests before migrating high-risk flows.
- Preserve project and generation data; migrations require explicit review and deployment confirmation.
- Ship accessibility and responsive behavior with each stage.
- Avoid provider calls in automated tests.

## Seven-stage PR roadmap

### 1. Foundation

Establish ethos, interaction contract, tokens, vocabulary, architecture decisions, feature flags, and baseline accessibility/responsive criteria. Inventory current tools, routes, generation states, assets, and persistence. No production UI refactor occurs here.

**Exit:** approved foundation, domain language, migration inventory, compatibility plan, and test plan.

### 2. Unified generation layer

Introduce a provider-neutral request and lifecycle model covering drafts, validation, estimated cost, queueing, execution, cancellation, success, failure, and retry. Normalize output metadata and lineage identifiers while preserving existing endpoints through adapters.

**Exit:** existing tools can use the unified layer without visible change; lifecycle and credit tests cover success and failure.

### 3. Workspace and universal composer

Build the feature-flagged persistent workspace, asset selection, universal composer, and contextual inspector. Support project restoration, composer drafts, responsive panels, keyboard operation, and clear loading/error states.

**Exit:** a bounded generation flow works in the new workspace without removing legacy tools.

### 4. Lineage and contextual actions

Expose provenance, candidate comparison, direct manipulation, multi-selection, retry, variation, remix, continuation, and reference actions. Provide concise lineage trails with expandable graph views.

**Exit:** every output has inspectable provenance and safe next actions that survive project reload.

### 5. Tool migration

Move image, video, audio, and specialized workflows into the unified composer and inspector one capability at a time. Preserve compatibility links and analytics while eliminating duplicate configuration. Add character and reusable-reference creation and version-aware reuse.

**Exit:** priority legacy tools have equivalent or improved Studio V2 flows with regression coverage and documented gaps.

### 6. Creative Director and model intelligence

Add intent interpretation, model recommendations, compatibility guidance, prompt assistance, and multi-step planning. Recommendations remain explainable and editable; final model, action, expected cost, and inputs are visible before commitment.

**Exit:** intelligence improves completion without silent model changes, hidden spend, or loss of creator control.

### 7. Cutover and cleanup

Run controlled acceptance, accessibility, responsive, performance, persistence, and rollback validation. Make Studio V2 the default through an approved release plan, retain a time-bounded fallback, then remove obsolete routes, components, adapters, and flags after stability is proven.

**Exit:** cutover is approved, monitoring and rollback are proven, and legacy removal follows the fallback window.

## Cross-stage quality gates

Every implementation PR identifies the user outcome and non-goals; affected project, asset, generation, and lineage contracts; authorization/ownership/credit/provider-spend/data risks; loading/empty/error/cancellation/retry behavior; desktop/tablet/mobile/keyboard/assistive behavior; local and hosted verification; and rollout/rollback/cleanup plans.

## Success measures

Studio V2 should reduce time from idea to useful output, repeated configuration, and recovery effort; increase reuse of assets and references; and improve project resumption. Track generation failures, accidental spend, accessibility regressions, and persistence errors as safeguards.
