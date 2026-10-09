# Post-deployment smoke tests

## User outcome

Production releases are marked successful only after key public pages, API health, and unauthenticated access controls respond as expected.

## Acceptance checks

- The homepage and local frontend health check return HTTP 200.
- Projects, library, settings, email verification, and password reset pages return HTTP 200.
- The public API health endpoint returns HTTP 200.
- The protected account usage endpoint returns HTTP 401 without credentials.
- A failed smoke test triggers the existing automatic rollback before release markers are written.

## Non-goals

- No authenticated browser automation or production test account.
- No data mutation, provider calls, generation requests, or provider-credit spending.
- No changes to authentication policy or application behavior.

## Verification plan

- Run the same non-mutating HTTP checks against current production.
- Validate shell syntax with `bash -n`.
- Run hosted PR checks before team approval.
