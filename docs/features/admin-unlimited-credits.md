# Unlimited credits entitlement

## User outcome

The development team can explicitly grant a trusted production test account unlimited generation credits without making credit limits nullable or changing limits for other users.

## Acceptance checks

- A user with `unlimitedCredits` can reserve generation credits after exceeding the account credit limit.
- Usage is still recorded and displayed, while Settings labels the account allowance as Unlimited.
- Existing numeric credit response fields remain available for older clients; `credits_unlimited` is authoritative.
- Platform-wide safety budgets, provider-spend controls, concurrency limits, and plan feature restrictions remain enforced.
- New and existing users remain limited unless the entitlement is deliberately enabled.
- The entitlement cannot be changed through a public account endpoint.

## Non-goals

- No production database update, deployment, billing change, or automatic account promotion.
- No general administrator role or authorization system.
- No bypass of platform safety controls.

## Affected components

- Prisma user schema
- Authentication user projection
- Generation credit reservation
- Account usage response and Settings display

## Verification

- Generate the Prisma client and build the backend and frontend.
- Run backend risk tests and relevant UI tests.
- Confirm ordinary accounts retain their existing numeric limits.
