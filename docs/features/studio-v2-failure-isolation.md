# Studio V2 failure isolation

## User outcome

A runtime rendering failure in the internal Studio V2 preview is contained within `/studio-v2`. The user receives clear recovery options and can return to the unchanged legacy Studio.

## Acceptance checks

- `/studio-v2` has a route-level error boundary.
- The failure state provides retry and return-to-legacy-Studio actions.
- A deterministic render failure can only be enabled by a server-side test environment flag.
- Browser coverage verifies the boundary renders and legacy Studio remains usable afterward.
- Existing generation behavior, API contracts, database schema, and provider integrations remain unchanged.

## Risk boundaries

The failure trigger requires `STUDIO_V2_FAILURE_TEST=enabled` on the server and an explicit query parameter. The test flag is set only by the Playwright development server configuration and is absent from production deployment configuration.

## Verification plan

- Frontend production build and changed-file lint.
- Focused Studio V2 foundation and failure-isolation Playwright tests.
- Full Playwright regression suite.
- Existing backend build and unit tests.
