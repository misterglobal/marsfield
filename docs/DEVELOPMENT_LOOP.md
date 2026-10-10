# MarsField automated development loop

MarsField uses a human-approved development loop modeled on the proven MarsTV process.

## Flow

1. The team creates a GitHub feature issue using the feature template, then explicitly adds `codex-ready` after approving it for automation.
2. Codex clarifies the outcome, records acceptance checks, and identifies affected components.
3. Codex works from a fresh checkout of `origin/main` on a dedicated branch.
4. The implementation includes focused tests and updates the feature document under `docs/features/`.
5. Pull-request CI builds the backend and frontend, runs backend and browser tests, checks changed frontend files with ESLint, and reviews dependency changes.
6. Codex reviews and repairs failures in a bounded loop, then leaves a draft pull request for team review.
7. The team tests and approves the result before merge.

Merging, VPS deployment, database migration, billing changes, provider spending, and production release are separate approval-gated operations.

## Queue labels

- `codex-ready`: approved for the automation to claim.
- `codex-working`: currently being implemented or repaired.
- `codex-review`: pull request is ready for team review.
- `codex-blocked`: a specific decision or external action is required.

The automation handles one issue at a time and resumes `codex-working` work before claiming another issue.

## Current validation baseline

- Backend TypeScript build passes.
- All 11 backend unit tests pass.
- The Next.js production build passes.
- All 39 Playwright browser tests pass on desktop and mobile Chromium projects.
- The existing full frontend lint has pre-existing debt. CI therefore lints every changed frontend JavaScript or TypeScript file strictly, preventing new lint debt without hiding the existing findings.
- The production dependency audit passes with no known advisories. CI runs `npm audit --omit=dev` directly and rejects any new production advisory.

CI uses only the repository and debug/test dependencies. It does not receive production database credentials, provider API tokens, billing secrets, R2 credentials, or Hetzner SSH keys.

## Deployment boundary

Local development continues in the existing Docker environment. Production runs on the Hetzner VPS. Staging and production delivery will be implemented separately after the server layout, domain, Compose project, migration strategy, health checks, rollback process, and approval environments are documented.
