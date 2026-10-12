# Studio V2 application foundation

## User outcome

The team can open an internal `/studio-v2` route and evaluate the responsive Studio V2 shell before any existing tool is migrated. The route establishes stable domain types, client state, layout regions, UI primitives, and implementation tokens for later roadmap stages.

## Acceptance checks

- `/studio-v2` renders a sidebar, workspace, inspector, and universal composer region.
- The route is internal and unlinked from existing production navigation.
- Core types define `Project`, `Asset`, `GenerationJob`, `GenerationResult`, and `CreativeAction`.
- Typed client state owns selected project, selected asset, jobs, and workspace state.
- Shared Studio V2 UI primitives and semantic tokens are reusable by later work.
- Empty, loading-ready, and responsive states have accessible landmarks and labels.
- Existing tools and production routes remain unchanged.

## Non-goals

- Migrating or wrapping existing generation tools.
- Calling backend or provider APIs.
- Persisting Studio V2 state to the database or browser storage.
- Changing credits, billing, authentication, authorization, models, or production infrastructure.
- Enabling Studio V2 in existing navigation or cutting over production traffic.

## Affected components

- New `frontend/src/app/studio-v2` route.
- New `frontend/src/features/studio-v2` domain, state, component, and style modules.
- New desktop and mobile Playwright coverage.

## Risk boundaries

The route is additive and unlinked. It uses static placeholder state, makes no network requests, and does not modify the existing application shell or generation paths.

## Verification plan

- Frontend production build.
- Changed-file frontend lint.
- Desktop and mobile Studio V2 Playwright tests.
- Full Playwright suite because a new workspace route and responsive shell are added.
