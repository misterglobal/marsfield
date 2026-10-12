# Studio V2 unified image generation

## User outcome

Studio V2 can generate an image through the existing Marsfield backend while its UI depends only on a normalized generation lifecycle, result, credit, and error contract.

## Acceptance checks

- A frontend generation service separates Studio V2 components from existing API payloads.
- Lifecycle states are normalized to queued, processing, completed, failed, and cancelled.
- Progress, errors, credits, results, and provider metadata share one typed contract.
- The first adapter supports one text-to-image generation through the existing backend.
- Studio V2 displays progress, failure, credit, and completed image states.
- Legacy Studio and backend API contracts remain unchanged.
- Automated tests mock generation and spend no provider credits.

## Non-goals

- Migrating video, audio, reference-image, variation, or specialized workflows.
- Adding a new backend endpoint, provider, database model, or schema migration.
- Cancelling a provider job after submission; client cancellation currently stops local tracking only.
- Changing production navigation or making Studio V2 the default.

## Affected components

- Studio V2 generation domain types and reducer.
- A provider-neutral frontend generation service and existing-backend image adapter.
- Studio V2 composer and workspace result presentation.
- Mocked Playwright generation coverage.

## Risk boundaries

The adapter calls the same authenticated generation and prediction endpoints used by legacy Studio. Existing backend authorization, credit reservation, ownership, rate limits, safety controls, and provider-spend controls remain authoritative.

## Verification plan

- Frontend changed-file lint and production build.
- Mocked Studio V2 image lifecycle Playwright test.
- Studio V2 foundation and failure-isolation tests.
- Full Playwright regression suite.
- Existing Prisma generation, backend build, and backend unit tests.
