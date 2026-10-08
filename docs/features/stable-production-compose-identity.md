# Stable production Compose identity

## User outcome

Production deployment and rollback commands target the same MarsField containers and images regardless of whether the VPS selects Docker Compose v1 or v2.

## Acceptance checks

- The deployment script uses the explicit Compose project name `marsfield` by default.
- Docker Compose v2 uses v1-compatible resource separators by default.
- Existing deployments may override either compatibility value through a server-side environment variable.
- Backup, rollback, exact-SHA validation, schema approval, and health checks remain unchanged.

## Non-goals

- No production deployment or container replacement in this change.
- No changes to local-development Compose behavior.
- No changes to production data, secrets, billing, authentication, or generation controls.

## Verification plan

- Validate shell syntax with `bash -n`.
- Confirm the variables are exported before Compose implementation detection.
- Run hosted PR checks before team approval.
