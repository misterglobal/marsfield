# Production deployment failure reporting

## User outcome

A production deployment that rolls back is reported as failed rather than appearing successful, and transient endpoint failures receive bounded retries before rollback begins.

## Acceptance checks

- The `ERR` trap passes the original non-zero status explicitly into rollback.
- A healthy rollback still exits with the original deployment failure status.
- An unhealthy rollback exits with a distinct critical status.
- Local and public endpoint checks retry for a bounded period.
- No deployment is performed by this change.

## Verification

- Validate Bash syntax and repository formatting.
- Run existing build, test, audit, and hosted CI checks.
