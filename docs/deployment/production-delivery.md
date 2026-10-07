# Production delivery

## Purpose

Deploy an exact commit already contained in `main` to the MarsField Hetzner VPS. Production delivery is manual, approval-gated, serialized, and separate from pull-request CI.

## GitHub environment

Create a `production` environment and require the development team's approval. Add these environment secrets:

- `MARSFIELD_SSH_HOST`: VPS hostname or IP address.
- `MARSFIELD_SSH_PORT`: SSH port, normally `22`.
- `MARSFIELD_SSH_USER`: `root` for the current `/root/marsfield/marsfield` installation. A future dedicated user requires moving the checkout and granting narrowly scoped Docker access first.
- `MARSFIELD_SSH_PRIVATE_KEY`: unencrypted private key limited to this deployment host.
- `MARSFIELD_SSH_KNOWN_HOSTS`: pinned host-key line produced from a separately verified server fingerprint.

Set the environment variable `MARSFIELD_PUBLIC_HEALTH_URL` to the public HTTPS application URL used for an unauthenticated availability check.

The workflow receives no database, provider, billing, R2, email, or application secrets. Those remain only in the VPS environment files.

## Deployment behavior

The workflow requires a full commit SHA and the confirmation value `DEPLOY`. It verifies the commit is the current `origin/main` tip, then pauses for the `production` environment approval. Historical commits must be restored through a reviewed revert on `main`, not deployed directly.

The VPS script:

1. Takes a server-side deployment lock and refuses deployment when tracked files are dirty, the target is not the current `main` tip, running application containers are unavailable, or less than 12 GiB is free.
2. Refuses commits that change the Prisma schema. Schema changes require a separate reviewed migration procedure because application rollback cannot safely reverse arbitrary database changes.
3. Retains one prior pair of application images and tags the currently running backend and frontend images for rollback.
4. Creates a private PostgreSQL custom-format backup, validates its archive listing, and writes a SHA-256 checksum under `/root/marsfield-backups`.
5. Checks out the exact source commit in detached-head mode and builds it from the server's installed base images. It verifies at least 5 GiB remains after the build before replacing a running container.
6. Replaces and health-checks the backend before replacing the frontend, then checks both localhost and the public HTTPS path.
7. Restores the previous source commit and application images automatically if a deployment command or health check fails, then verifies the restored backend, frontend, localhost, and public HTTPS path. A failed rollback is reported as a critical error.
8. Records the current and previous commit under `/root/marsfield-server`, removes dangling images, and retains the ten newest deployment backups.

Database rollback is intentionally not automatic. Automated releases therefore reject Prisma schema changes, and each release backup remains available for a separately approved recovery operation.

## First-run checklist

- Confirm `main` is clean on the VPS and production containers are healthy.
- Confirm at least 12 GiB is free with `df -h /`.
- Confirm `/root/marsfield-backups` and `/root/marsfield-server` are writable.
- Configure the protected GitHub environment and SSH secrets.
- Run the workflow with an approved commit SHA.
- Verify the public application, sign-in, Settings usage, and one low-cost generation after deployment.

Do not invoke the legacy untracked `deploy.sh`; it pulls a moving branch and is not part of this workflow.
