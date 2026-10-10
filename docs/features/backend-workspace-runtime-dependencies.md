# Backend workspace runtime dependencies

## User outcome

Production backend images include runtime packages regardless of whether npm hoists them to the workspace root or installs them under `backend/node_modules`.

## Acceptance checks

- Copy backend workspace-local dependencies from the build stage into the runtime image.
- Preserve root workspace dependencies, non-root execution, and existing file ownership.
- Build the production backend image in CI.
- Load Express and Multer inside the built runtime image before a PR can pass.
- Run the existing build, unit, browser, lint, dependency-tree, and production-audit checks.

## Non-goals

- No application behavior, database schema, authentication, billing, credit, rate-limit, or provider-spend changes.
- No deployment or production-data access as part of the repair.

## Affected components

- `backend/Dockerfile`
- Pull-request build-and-test workflow

## Verification

- Build the backend image from a clean checkout.
- Run a Node module-load check for Express and Multer inside the runtime image.
- Confirm hosted PR CI passes before team review.
