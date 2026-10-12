# Studio V2 persistent workspace context

## User outcome

Creators can resume Studio V2 with their selected project and composer draft, browse owned project assets, select an image reference, and generate through the unified layer without rebuilding context after a reload.

## Acceptance checks

- Existing owned projects and assets load through current APIs.
- Loading, empty, and error states remain accessible.
- Project selection and composer drafts restore after reload.
- An owned durable image can be selected and inspected as generation context.
- Unified image generation receives the selected project and storage reference identifiers.
- Desktop and mobile behavior remain usable.
- Automated tests mock all APIs and spend no provider credits.

## Non-goals

- Creating or editing projects, uploading assets, or persisting jobs.
- Multi-selection, lineage actions, or non-image references.
- Backend, database, billing, provider, navigation, deployment, or cutover changes.

## Risk boundaries

The workspace reads only the current user's data through existing authenticated endpoints. Reference identifiers and project ownership remain validated by the backend before provider submission.

## Verification plan

- Frontend changed-file lint and production build.
- Focused desktop and mobile workspace tests.
- Full Playwright regression suite.
- Prisma generation, backend build and tests, and production dependency audit.
