Marsfield — AI Video Generation Platform
Overview
A full-stack AI media generation app with a Next.js frontend and Express backend, letting users create videos/images via AI models (Replicate/Kling/Seedance) and manage generations in projects.

---

Frontend — Next.js 16 (React 19)
Routes:
/ — Studio — Main generation UI (video studio, asset library, settings)
/library — Generated assets grid
/projects — User projects
/settings — Account, API keys, billing

Stack: Next.js 16, React 19, pure CSS (no UI library visible), API client at src/lib/api.ts
───

Backend — Express on port 3001

Database: PostgreSQL via Prisma ORM
Queue: BullMQ + Redis (async job tracking)
AI Provider: Replicate API (bytedance/seedance-2.0, kwaivgi/kling-v3-omni-video, bytedance/omni-human, etc.)
Storage: Cloudflare R2 for durable asset storage
Billing: Freemius subscription platform, credit-based

Routes:

| Route            | Purpose                       |
| ---------------- | ----------------------------- |
| /api/v1/auth     | Login/signup                  |
| /api/v1/account  | Account management + API keys |
| /api/v1/assets   | List/query generated assets   |
| /api/v1/projects | CRUD for projects             |
| /api/v1/uploads  | File upload to R2             |
| /api/v1/generate | Submit a generation job |
| /api/v1/webhooks/replicate | Replicate completion callback |

Key services:
replicate.service.ts — wraps Replicate API, handles webhooks
storage.service.ts — R2 file uploads/downloads
billing.service.ts — credit quoting before generation
free-tier-risk.service.ts — atomic user/risk-group credit, concurrency, and daily platform budget reservations
queue.service.ts — BullMQ job tracking for async predictions
freemius.service.ts — subscription management

---

Free-tier risk controls

- New accounts complete Turnstile and email verification. Twilio Verify provides step-up phone verification when multiple risk signals match.
- Free credits are lifetime credits. Accounts connected through hashed phone, card, or device signals share one allowance; IP, company-domain, and repeated-content matches contribute to a score but IP alone never blocks an account.
- Provider work starts only after a serializable database transaction reserves user/group credits, a concurrent-job slot, the daily free budget, and the platform safety budget.
- Defaults and provider credentials are documented in `.env.example`. Production Compose requires both Turnstile keys and `RISK_SIGNAL_PEPPER`.

---

Generation Flow
User submits generation in Studio → POST /api/v1/generate
Backend validates credit balance, creates Prediction record
Replicate API called → returns prediction ID
If async (status !== 'succeeded'), job added to BullMQ queue
Replicate calls webhook on completion → /api/v1/webhooks/replicate
Backend copies output to R2 → creates Asset record
Frontend polls or receives result

---

Supported Workflows
Text-to-Video — basic prompt → video
Image-to-Video — image + prompt → video
Lip-Sync — portrait image + audio → talking head video
Text-to-Image — prompt → image
Seedance 2.0 — multi-reference video generation (images, video, audio refs + first/last frame)
Character Replace — Kling 3 Omni Video, replaces person in video with a reference image

---

What's Incomplete (per REMAINING_FEATURES.md)
The app is in active development. Several features aren't wired up yet:

Upload pipeline — references currently sent as base64 data URIs; needs real R2 upload flow
Lip-sync file handling — needs real file storage, not filenames
Storyboard → Studio — generate-from-scene workflow incomplete
Thumbnail generation — assets show full res instead of thumbnails in library
API key auth — keys can be created in Settings but auth middleware doesn't use them yet
Freemius billing — configured but not fully wired for plan upgrades
