# Reviewed schema deployment gate

## User outcome

Production deployments remain blocked from applying schema changes unless the exact deployment commit and its schema change receive separate explicit approval.

## Acceptance checks

- Ordinary deployments continue to reject Prisma schema differences.
- Schema-changing deployments require the exact `MIGRATE` confirmation.
- Any other schema confirmation is rejected during workflow validation and by the server-side script.
- Existing exact-SHA validation, production environment approval, database backup, rollback, and health checks remain required.

## Non-goals

- No automatic classification of schema changes as safe or unsafe.
- No production deployment or database modification in this change.
- No weakening of rollback, backup, or environment protections.

## Verification plan

- Validate shell syntax with `bash -n`.
- Review the workflow data flow from dispatch input to the remote script.
- Run hosted PR checks before team approval.
