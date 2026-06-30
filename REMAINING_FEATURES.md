# Marsfield Remaining Features: Design and Implementation Guide

This document explains how the remaining production features should work from the user's perspective and inside the current Next.js, Express, PostgreSQL, Replicate, and Cloudflare R2 architecture.

The recommended implementation order is:

1. Real upload pipeline
2. Lip-sync file handling
3. Storyboard-to-Studio generation
4. Thumbnail generation
5. API-key authentication
6. Review, commit, and push cleanup

The upload pipeline comes first because lip-sync, Seedance references, storyboard reference media, and future brand kits all need the same durable-file foundation.

## 1. Real upload pipeline for Seedance references

### User experience

When a user selects an image, video, or audio reference in Studio:

1. The browser validates the file type and size.
2. The file uploads immediately to Marsfield and shows upload progress.
3. Marsfield stores it in the user's private R2 namespace.
4. Studio keeps the returned upload ID and usable media URL.
5. The user can remove, replace, preview, and reference uploaded files as `[Image1]`, `[Video1]`, or `[Audio1]`.
6. Generation starts only after all required uploads have completed.

The browser will no longer convert files to large data URIs or include the file bytes in the generation JSON request.

### Backend flow

Add an authenticated multipart endpoint:

```text
POST /api/v1/uploads
Content-Type: multipart/form-data
Authorization: Bearer <JWT or API key>

file=<binary>
purpose=seedance-reference
project_id=<optional project UUID>
```

The API will:

1. Authenticate the user.
2. Stream or buffer the upload with strict size limits.
3. Verify the detected MIME type, not only the filename extension.
4. Calculate a SHA-256 checksum.
5. Upload the object to R2.
6. Create a `StorageObject` record owned by the user.
7. Return a safe upload response.

Example response:

```json
{
  "id": "storage-object-uuid",
  "url": "https://media.example.com/users/.../reference.jpg",
  "mime_type": "image/jpeg",
  "byte_size": 248123,
  "kind": "image"
}
```

The generation endpoint should accept storage object IDs instead of trusting arbitrary client URLs:

```json
{
  "params": {
    "reference_image_ids": ["storage-object-uuid"],
    "reference_video_ids": [],
    "reference_audio_ids": []
  }
}
```

Before calling Replicate, the backend verifies every object belongs to the authenticated user and converts the IDs to R2 URLs. Seedance limits remain enforced server-side: up to 9 images, 3 videos, and 3 audio files.

### Storage layout and lifecycle

Suggested R2 key pattern:

```text
users/{userId}/uploads/{year}/{month}/{storageObjectId}.{extension}
```

Uploaded references should be durable by default because users may reuse them. A later cleanup job can remove abandoned uploads that are not attached to a project, prediction, asset, or brand kit after a defined retention period.

If the R2 bucket is private, Marsfield should use short-lived signed URLs when sending inputs to Replicate. A public custom media domain is simpler initially, but object IDs and ownership checks must still be used in the Marsfield API.

### Validation and security

- Images: JPEG, PNG, and WebP; maximum 10 MB each.
- Video: MP4/WebM formats supported by the selected model; initial maximum 100 MB each.
- Audio: MP3, WAV, M4A, or AAC as supported by the selected model; initial maximum 50 MB each.
- Reject executable, archive, SVG, and mismatched MIME content.
- Sanitize filenames and never use the original filename as the object key.
- Apply per-user rate limits and storage quotas.
- Never expose R2 credentials to the frontend.
- Record upload failures without logging authorization headers, signed URLs, or secrets.

### Completion criteria

- Studio sends no data URIs for Seedance references.
- Upload progress and failure states are visible.
- A user cannot generate with another user's storage object ID.
- Refreshing Studio does not invalidate an uploaded reference.
- Seedance receives stable URLs and successfully generates from each supported media type.

## 2. Real lip-sync image and audio handling

### User experience

The lip-sync workflow requires a portrait image and an audio file. Both files upload through the shared upload pipeline. Studio displays previews, duration/file information, and clear validation errors before charging credits.

The user flow is:

1. Upload a portrait.
2. Upload or select an audio recording.
3. Optionally enter model-specific settings.
4. Review the credit estimate.
5. Submit the generation.
6. Track the prediction and receive the durable result in the asset library.

### Generation payload

Replace the current `audio_filename` placeholder and base64 image with owned storage references:

```json
{
  "workflow": "lip-sync",
  "model": "<supported-model>",
  "image_storage_object_id": "image-uuid",
  "audio_storage_object_id": "audio-uuid",
  "project_id": "optional-project-uuid",
  "params": {}
}
```

The backend resolves both objects, verifies ownership and MIME type, builds the exact input expected by the selected Replicate model, and submits the prediction.

Lip-sync model schemas differ, so Marsfield should keep a server-side model configuration that maps the normalized Marsfield fields (`image`, `audio`, and settings) to each provider's input names. This prevents model-specific details from leaking throughout the frontend.

### Failure and billing behavior

- Invalid files fail before prediction creation and before credits are charged.
- A provider submission failure does not charge credits.
- A provider processing failure creates a visible failed prediction and follows the platform's refund policy.
- The generated video is copied into R2 through the existing durable-output process.

### Completion criteria

- The real audio bytes reach the provider; the filename is never used as media input.
- Ownership and type checks exist for both inputs.
- The completed lip-sync video appears in the selected project and asset library.
- Billing history identifies the workflow, model, and credit charge.

## 3. Storyboard: generate a scene in Studio

### User experience

Each storyboard scene card should include a **Generate in Studio** action. Clicking it opens Studio with the scene context already loaded:

- selected project
- storyboard scene ID
- scene prompt
- preferred duration
- previously selected model/settings when available

A simple first version can use URL query parameters:

```text
/?project_id={projectId}&scene_id={sceneId}
```

Studio should fetch the scene by its ID rather than placing the full prompt in the URL. This avoids stale data and keeps long or sensitive prompts out of browser history.

### Backend changes

Add a user-owned scene endpoint if the project response is not sufficient:

```text
GET /api/v1/projects/{projectId}/storyboard-scenes/{sceneId}
```

Generation already supports `project_id` and `storyboard_scene_id`. Studio must include both fields when submitting. The backend continues to verify that the project and scene belong to the authenticated user and that the scene belongs to the selected project.

### Scene result behavior

After generation:

- The prediction is linked to the scene.
- The scene card displays its latest generations, status, and thumbnail.
- Variations remain grouped under that scene.
- A user can regenerate the scene without overwriting prior results.
- A user can choose a preferred result later for timeline assembly.

The first release does not need drag-and-drop reordering. Scene editing, generation linkage, and visible results provide the useful vertical slice; ordering controls can follow.

### Completion criteria

- Generate in Studio preserves project and scene context.
- The scene prompt and duration populate correctly.
- Generated predictions and assets are linked to the scene.
- Returning to Projects shows the latest scene results without manual data repair.

## 4. Thumbnail generation

### Purpose

The asset library should not load full-resolution images or entire videos just to render a grid. Thumbnails improve page speed, bandwidth use, and visual consistency.

### Processing flow

Thumbnail creation should run after the durable output has been copied into R2:

```text
Provider succeeds
  -> original output copied to R2
  -> Asset and StorageObject created
  -> thumbnail job queued
  -> thumbnail uploaded to R2
  -> Asset.thumbnailUrl updated
```

For images, generate a resized WebP thumbnail, preserving aspect ratio. For videos, extract a representative frame and resize it to WebP. A practical default is a maximum dimension of 640 pixels with moderate quality.

Suggested object key:

```text
users/{userId}/thumbnails/{assetId}.webp
```

The thumbnail should ideally receive its own `StorageObject` relation in a later schema refinement. The current `Asset.thumbnailUrl` is enough for an initial version, but a relation makes deletion, accounting, and integrity more reliable.

### Reliability

Thumbnail failure must not mark an otherwise successful generation as failed. The asset can use a generic placeholder while a retryable background job records the thumbnail error.

Existing assets with an empty `thumbnailUrl` should be processed by a bounded backfill command or worker job.

### Completion criteria

- New image and video assets receive thumbnails automatically.
- Library cards use thumbnails and open the original asset on demand.
- Thumbnail failures are retryable and do not hide the original asset.
- A backfill can process existing assets safely and idempotently.

## 5. API-key authentication for external requests

### User experience

Users can already create, list, and revoke API keys in Settings. Once authentication is wired, a key can be used for programmatic generation:

```http
Authorization: Bearer mf_live_<secret>
```

The full secret is shown only once at creation. Marsfield stores only its SHA-256 hash, which matches the current account route design.

### Authentication flow

Refactor the current authentication middleware to support two token types:

1. Tokens starting with `mf_live_` are hashed and looked up in `ApiKey.key`.
2. Other bearer tokens are verified as login JWTs.

For a valid API key, the middleware loads the owning user into the same `req.user` shape used by JWT authentication. Existing generation, project ownership, billing, and quota checks then work without duplicate route logic.

On successful API-key authentication, update `lastUsedAt` asynchronously or with a throttled update so frequent requests do not create unnecessary database writes.

### Recommended schema improvements

Before public API launch, extend `ApiKey` with:

- `prefix` or `lastFour` for recognizable masked display
- `revokedAt` instead of relying only on deletion, if audit history is required
- `expiresAt` for optional expiration
- `scopes` for permissions such as `generation:write` and `assets:read`
- `lastUsedIp` only if the privacy policy and retention rules cover it

The initial release can authenticate active keys without scopes, but it should be structured so scopes can be added without changing every route.

### Security and operations

- Compare hashes using a timing-safe method where practical.
- Rate-limit API-key traffic by key and user.
- Never log bearer tokens.
- Return the same generic unauthorized response for invalid, revoked, or missing keys.
- Ensure key revocation takes effect immediately.
- Include API-key usage in usage history without exposing the secret.

### Completion criteria

- A valid API key can call generation and other intentionally public API routes.
- An invalid or revoked key receives `401`.
- API-key requests use the same ownership, credit, and quota rules as the web app.
- `lastUsedAt` updates without exposing the key.
- Browser JWT login behavior remains unchanged.

## 6. Commit and push cleanup

This step happens after the feature slice builds and passes its checks. It is not only cosmetic: it prevents generated files, local secrets, and unrelated work from being mixed into a difficult-to-review commit.

### Review process

1. Inspect `git status` and the complete diff.
2. Confirm `.env` and `backend/.env` remain ignored and untracked.
3. Check that `.env.example` contains placeholders only.
4. Decide intentionally whether tracked `backend/dist` output belongs in the repository.
5. Preserve user-created or unrelated files, including product documents, unless they are explicitly part of the commit.
6. Run backend and frontend production builds.
7. Validate `docker compose config` and rebuild the affected services.
8. Run focused smoke tests for login, upload, generation submission, projects, and Settings.
9. Scan the staged diff for secrets before committing.
10. Commit a coherent feature slice, push a feature branch, and open a draft pull request or merge according to the repository workflow.

### Suggested commit boundaries

If the changes are split into reviewable commits, use boundaries such as:

1. `Add durable user upload pipeline`
2. `Wire Seedance and lip-sync inputs to stored uploads`
3. `Link storyboard scenes to Studio generation`
4. `Generate asset thumbnails`
5. `Authenticate API requests with account keys`
6. `Document and verify production workflow`

### Completion criteria

- No secret or local environment file is staged.
- Backend and frontend builds pass from a clean checkout.
- Docker Compose starts the required services successfully.
- The pushed branch contains only the intended work.
- Deployment documentation lists any new environment variables and operational steps.

## Cross-feature architectural rules

These rules should apply across the entire slice:

- The database stores ownership and metadata; R2 stores file bytes.
- Frontend-provided URLs or object IDs are never trusted without ownership validation.
- Provider outputs are temporary sources; Marsfield's R2 copy is the durable asset.
- Credit checks happen before provider submission, and every charge is explainable in usage history.
- Long-running media work belongs in background jobs with retryable, idempotent handlers.
- Failed secondary processing, such as thumbnails, must not destroy successful primary outputs.
- User-facing APIs must not reveal bucket names, R2 credentials, internal object paths, or provider secrets.

## Definition of done for the complete slice

The slice is complete when a signed-in user can upload durable references, generate with Seedance or lip-sync using those references, start a generation from a storyboard scene, see thumbnail-backed results in the appropriate project and library, and perform an authorized generation through an API key. The entire stack must build and run through Docker Compose, with no secrets included in the committed history.
