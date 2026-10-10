# Production dependency remediation

## User outcome

MarsField uses patched production dependencies and CI rejects new production advisories without a temporary exception baseline.

## Acceptance checks

- Upgrade direct and transitive production packages to supported patched versions.
- Run Prisma client generation, the backend TypeScript build, and all backend tests.
- Run the Next.js production build and the complete Playwright suite.
- Run changed-file lint for any changed frontend files.
- Run `npm audit --omit=dev` with no remaining production advisories.
- Remove the temporary advisory allowlist and expiry date from CI.
- Review upload handling, proxy trust, image processing, authentication, billing, and provider-spend paths for regressions.

## Affected components

- Root and backend dependency manifests and lockfile.
- Production dependency audit CI.
- Multer upload parsing and Express proxy-address handling through patched package releases.
- Next.js image processing, PostCSS, source-map parsing, and browser compatibility metadata through patched resolutions.

## Risk boundaries

- Do not alter upload limits, proxy trust configuration, authentication, billing, credit accounting, rate limits, or provider-spend controls.
- Do not use production secrets, provider APIs, or production data during verification.
- Do not deploy or merge as part of this change.

## Verification plan

- Confirm a clean `npm ci` resolves the intended versions and `npm ls --all` reports a complete dependency tree.
- Run the complete repository build and test matrix.
- Review dependency changes and security-sensitive routes for behavior changes.
- Confirm hosted PR CI and dependency review pass.
