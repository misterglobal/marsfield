# Signup and trial protection

Registration accepts at most 5 attempts per minute, 5 per hour, and 10 per day per resolved client IP. The minute limit also tracks normalized email. Limits count attempts, including failed registration. Shared networks can reach these limits. Production rate-limited routes return 503 if Redis is unavailable; they do not fall back to independent process counters.

Production registration already requires server-validated Turnstile and configured verification email delivery. Unverified users cannot sign in or spend free generation credits. Verification links expire after 24 hours and are single-use. Known disposable domains and their subdomains are blocked; SIGNUP_BLOCKED_EMAIL_DOMAINS extends the built-in list. This is not an exhaustive disposable-email database, and public mailbox providers are not blanket blocked.

Verified email unlocks 5 credits by default (FREE_TRIAL_EMAIL_CREDITS). Phone verification in Settings unlocks the rest of the account's existing allowance, normally 15 total. Existing shared-signal risk scoring can require phone verification earlier. Linked accounts continue sharing a lifetime allowance. The staged check runs within the serializable credit reservation transaction. Usage responses report the unlocked limit and expose trial_total_credits separately.

## Rollout

- Configure production NODE_ENV, Redis, Turnstile secret and public site key, Resend API key and a verified ACCOUNT_EMAIL_FROM sender, PUBLIC_APP_URL, and RISK_SIGNAL_PEPPER. The public Turnstile key must be supplied at frontend build time.
- Configure Twilio Verify credentials before enabling the staged trial in production so users can unlock their remaining credits. Settings already includes phone verification.
- Set TRUST_PROXY_HOPS to match the actual proxy topology. The backend must only be reachable through those trusted proxies, which must supply a trustworthy client address. Verify that two real clients resolve to different addresses through the deployed frontend/proxy chain.
- Rebuild and deploy the application. No new database fields are introduced by this change; the existing verification/risk schema must already be installed.
- Smoke-test signup, verification delivery/resend, CAPTCHA rejection, phone verification, the 5-credit boundary, and Redis outage handling in staging.

The new spending gate applies to existing free accounts as well: an account already past 5 lifetime credits needs phone verification before another generation. This change does not delete accounts or classify users as bots based on email prefixes or similar usage alone. No live account cleanup or production deployment was performed.

Validation: npm.cmd run test:risk --workspace=backend builds TypeScript and runs policy/rate-limit regression tests. These tests do not exercise live Redis, PostgreSQL concurrency, email delivery, or CAPTCHA/SMS providers.
