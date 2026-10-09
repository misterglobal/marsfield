# Scheduled VPS maintenance

## Outcome

MarsField runs a weekly, approval-protected production maintenance check. The same workflow can be started manually from GitHub Actions.

## Acceptance checks

- Verify the production Postgres, Redis, backend, and frontend containers are healthy.
- Verify the public API health endpoint returns HTTP 200.
- Verify a non-empty pre-deployment backup exists and is no more than 14 days old.
- Report available disk space before and after maintenance.
- When free space is below 15 GiB, prune only dangling Docker images and unused build cache.
- Fail the workflow if free space remains below 12 GiB.
- Require the existing production environment approval before connecting to the VPS.

## Safety boundaries

- Never prune Docker volumes.
- Never remove active container images.
- Never remove tagged rollback images.
- Never restart containers, deploy code, or modify the database.
- Never bypass SSH host verification or expose production secrets.

## Operations

The workflow runs Sundays at 08:00 UTC and supports manual dispatch. Scheduled runs wait for the production environment approval, providing a supervised trial period before considering a separately restricted maintenance credential and unattended execution.
