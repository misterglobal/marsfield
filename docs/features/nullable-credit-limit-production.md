# Production-compatible credit limits

## User outcome

Production deployments preserve explicitly unlimited administrative test accounts without weakening credit enforcement for other users.

## Acceptance checks

- The Prisma user model accepts the existing nullable `credits_limit` production value.
- Only `unlimitedCredits=true` removes the account credit ceiling.
- A limited account with a missing numeric limit fails closed at zero credits.
- Account usage remains compatible with the existing `credits_unlimited` frontend behavior.
- Prisma generation, backend build and risk tests pass.

## Non-goals

- No production database edits or migrations.
- No changes to billing plans, provider spending controls, rate limits, or authentication policy.
- No deployment from this development change.

## Affected components

- Prisma user schema.
- Authentication user typing.
- Credit reservation and account usage calculations.
- Free-tier risk tests.

## Verification plan

- Generate the Prisma client.
- Build the backend and run its risk tests.
- Build the frontend and run changed-file lint through CI.
- Confirm hosted PR checks before team review.
