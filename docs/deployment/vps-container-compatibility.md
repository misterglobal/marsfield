# VPS Container Compatibility

## Purpose

Preserve the container networking settings currently required by the MarsField VPS without including server secrets or deployment state.

## Acceptance Criteria

- The backend listens on all container interfaces so the frontend proxy and host health checks can reach it.
- Compose fails fast unless an explicit `DATABASE_URL` is configured, rather than synthesizing a potentially incorrect production fallback.
- No production credentials, environment files, data, or server-only deployment files are committed.

## Affected Components

- `backend/src/index.ts`
- `docker-compose.yml`

## Non-Goals

- Deploying to the VPS.
- Changing credit limits, authentication, billing, risk controls, or database schema.
- Adding the server-only blue/green deployment files.
