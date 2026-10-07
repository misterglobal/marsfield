# Guarded production deployment

## User outcome

The development team can deploy the current approved `main` commit to the MarsField VPS through a manual, approval-gated workflow instead of pulling a moving branch on the server.

## Acceptance checks

- A full current-`main` commit SHA and explicit `DEPLOY` confirmation are required.
- GitHub's protected `production` environment provides the human approval gate.
- Production refuses dirty tracked files, concurrent runs, schema changes, unhealthy prerequisites, and insufficient disk capacity.
- A validated private database backup and rollback images exist before application replacement.
- Container, localhost, and public HTTPS health checks pass before success is reported.
- Failed releases restore and verify the previous application images and source commit.
- No application, database, provider, or billing secrets leave the VPS.

## Non-goals

- Deploying this pull request.
- Automating Prisma schema changes or database rollback.
- Adding a second staging stack to the current VPS.

## Affected components

- GitHub Actions production workflow
- VPS deployment script
- Production operations documentation

## Verification

- Validate shell syntax and repository formatting.
- Run backend tests, backend/frontend builds, and the production dependency audit.
- Complete independent deployment-safety review.
- Require hosted pull-request CI before merge.
