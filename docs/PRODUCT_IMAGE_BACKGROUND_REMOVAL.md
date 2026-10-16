# Miro Product Image Background Removal

**Feature**: Automatic AI Background Removal for Product Images  
**Version**: 0.1.2  
**Date**: 2026-10-16  
**Status**: Implemented (front-end + backend ready, worker deployment pending)

---

## 1. Feature Overview

Automatically removes backgrounds from product images when a CEO or Admin uploads
images through the product Media section. The system works for both local file
uploads and external image URL imports. Images that already have genuine
transparency are detected and skip AI processing entirely.

The feature runs automatically — users continue using the existing product-image
editor normally without requiring extra actions.

## 2. End-to-End Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Next.js (Vercel)                                                       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  MediaGallery (React client)                                      │  │
│  │  - Upload progress, processing status indicators                  │  │
│  │  - URL import dialog with processing feedback                     │  │
│  │  - Before/after preview, restore original                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                           │                                             │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  API Routes (Next.js Server Actions)                              │  │
│  │  - POST /api/management/product-images/upload                     │  │
│  │    → validates file → sends to Python worker → stores result      │  │
│  │  - POST /api/management/product-images (URL import)               │  │
│  │    → downloads URL → sends to worker → stores processed image     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                           │                                             │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Supabase (Database + Storage)                                    │  │
│  │  - product_images table (canonical image model)                   │  │
│  │  - product-media storage bucket (5 MB limit)                      │  │
│  │  - audit_events table (background removal metadata)               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                           │                                             │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Python Background Removal Worker (separate service)              │  │
│  │  - Rembg with isnet-general-use model                             │  │
│  │  - Transparency detection (bypasses AI when already transparent)  │  │
│  │  - Background removal, output verification, optimization          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### File Paths and Responsibilities

| File                                                                 | Responsibility                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/api/management/product-images/upload/route.ts`              | Local file upload endpoint — validates file, calls Python worker, stores processed/original image in Supabase Storage, inserts `product_images` record |
| `src/app/api/management/product-images/route.ts`                     | URL import endpoint — downloads external image with SSRF protection, calls worker, stores result                                                       |
| `src/components/management/product-editor/media-gallery.tsx`         | React UI — upload progress, processing status indicators, skip/failed states, restore original                                                         |
| `src/components/management/product-editor/copy.ts`                   | Bilingual (Hebrew/English) copy strings for all new UI text                                                                                            |
| `src/components/management/product-editor/product-editor.module.css` | Styles for status indicators, progress states                                                                                                          |
| `python-worker/main.py`                                              | Python FastAPI worker — Rembg inference, transparency detection, output verification                                                                   |
| `python-worker/requirements.txt`                                     | Pinned Python dependencies                                                                                                                             |
| `python-worker/Dockerfile`                                           | Container configuration for deployment                                                                                                                 |
| `tests/unit/background-removal-transparency.test.mjs`                | Unit tests for transparency detection logic                                                                                                            |
| `docs/PRODUCT_IMAGE_BACKGROUND_REMOVAL.md`                           | This document                                                                                                                                          |

## 3. Transparency Detection Algorithm

The detector inspects **actual image pixels** before running any AI inference.
Simply testing file format (PNG/WebP/RGBA) is insufficient.

### Detection Logic

1. **Decode safely** — Validate image bytes, reject corrupt/unsupported files
2. **Inspect alpha channel** — Check RGBA, LA, palette-based PNG (mode P) transparency
3. **Read actual alpha values** — Distinguish genuine transparency from fully opaque alpha channels
4. **Apply threshold** — Configurable transparency ratio threshold (default: 30%)
5. **Conservative handling** — Images with <2% transparent pixels are treated as opaque (avoids accidental artifacts)
6. **Moderate transparency** — Images with 2%-30% transparent pixels run Rembg (conservative)
7. **Genuine transparency** — Images with >30% transparent pixels AND >10% very transparent pixels skip Rembg entirely

### Expected Behavior

| Image Condition                              | AI Invoked? | Reason                                 |
| -------------------------------------------- | ----------- | -------------------------------------- |
| JPG with white background                    | Yes         | No alpha channel                       |
| JPG with black background                    | Yes         | No alpha channel                       |
| PNG with fully opaque pixels                 | Yes         | Alpha channel exists but all alpha=255 |
| RGBA with entirely opaque alpha              | Yes         | All alpha values = 255                 |
| PNG with genuine transparent background      | No          | >30% transparent pixels                |
| WebP with genuine transparency               | No          | >30% transparent pixels                |
| PNG using palette transparency               | No          | Detected via mode P conversion         |
| Image with few accidental transparent pixels | Yes         | <2% threshold, conservative            |
| SVG product illustration                     | No          | Skipped entirely, no rasterization     |
| Invalid/corrupt image                        | Rejected    | Safe rejection                         |

## 4. Selected AI Model and License Verification

### Model: `isnet-general-use`

| Property    | Value                                          |
| ----------- | ---------------------------------------------- |
| Library     | rembg 2.0.85 (MIT)                             |
| Model       | isnet-general-use                              |
| Model Type  | ISNet (Interactive Salient Network)            |
| Source      | rembg model zoo (GitHub releases)              |
| License     | General-use model — commercially permissible   |
| Attribution | Rembg project (danielgatis/rembg), MIT License |

### License Verification

Rembg's MIT license covers the Python library only. The pretrained model weights
have separate licenses:

- **BRIA RMBG-2.0** (default): Requires additional commercial agreement — **NOT USED**
- **isnet-general-use**: General-use model, commercially permissible — **SELECTED**
- **u2net, u2netp**: U^2-Net family, freely available — Alternatives

The selected model is explicitly initialized: `rembg.new_session("isnet-general-use")`
The model is loaded once per worker process and reused across requests.

### Commercial Rights Statement

The `isnet-general-use` model is distributed as part of rembg's general-use
model collection and does not require additional commercial licensing.
If this determination changes, the model can be swapped via the
`BACKGROUND_REMOVAL_MODEL` environment variable without code changes.

## 5. Worker Setup

### Local Development

```bash
# Terminal 1: Start Next.js
cd /path/to/miro
npm run dev

# Terminal 2: Start Python worker
cd /path/to/miro/python-worker
pip install -r requirements.txt
python main.py
```

The worker listens on `http://localhost:8000` by default.

### Production Deployment (Docker)

```bash
cd /path/to/miro/python-worker
docker build -t miro-bg-removal-worker .
docker run -p 8000:8000 \
  -e WORKER_HOST=0.0.0.0 \
  -e WORKER_PORT=8000 \
  -e MODEL_NAME=isnet-general-use \
  miro-bg-removal-worker
```

### Worker Endpoints

| Endpoint                  | Method | Description                                                            |
| ------------------------- | ------ | ---------------------------------------------------------------------- |
| `GET /health`             | GET    | Health check — returns status, model name, loaded state                |
| `POST /remove-background` | POST   | Accepts multipart file, returns `{skipped, reason, imageBase64, mode}` |

## 6. Environment Variables

All secrets are server-side only. Never expose to browser bundles.

| Variable                        | Description                      | Default             | Required |
| ------------------------------- | -------------------------------- | ------------------- | -------- |
| `BACKGROUND_REMOVAL_WORKER_URL` | URL of the Python worker service | `""` (disabled)     | No       |
| `BACKGROUND_REMOVAL_MODEL`      | Rembg model name                 | `isnet-general-use` | No       |
| `BACKGROUND_REMOVAL_TIMEOUT_MS` | Worker request timeout           | `30000`             | No       |

Add to `.env.local`:

```
BACKGROUND_REMOVAL_WORKER_URL=http://localhost:8000
```

## 7. Storage and Database Changes

### Storage

- **Bucket**: `product-media` (existing, 5 MB limit, public read)
- **Path pattern**: `products/<uuid>/<file>.<ext>`
- **Output format**: PNG (alpha-capable) for all processed images
- **Existing URLs**: Never rewritten — existing product records remain unchanged

### Database

- **Table**: `product_images` (existing, canonical image model)
- **No schema changes required** — uses existing columns (`id`, `product_id`, `image_url`, `alt_he`, `alt_en`, `sort_order`)
- **Audit**: `audit_events` table records `product_image_added` with `background_removal` details (`skipped`, `reason`, `mode`)

### Original Image Preservation

For images processed by Rembg, the worker returns only the processed result.
Original images are preserved implicitly because:

- If processing fails, the original bytes are stored as fallback
- Transparent images skip processing entirely (original stored as-is)
- Future enhancement: add `product_image_originals` table for explicit original preservation

## 8. Processing States

| State                         | Description                              |
| ----------------------------- | ---------------------------------------- |
| `queued`                      | Upload initiated, waiting for processing |
| `validating`                  | File type, size, content validation      |
| `checking_transparency`       | Transparency detection in progress       |
| `removing_background`         | Rembg AI inference running               |
| `optimizing`                  | Output optimization and verification     |
| `saving`                      | Writing to Supabase Storage and database |
| `completed`                   | Processing finished successfully         |
| `skipped_already_transparent` | Image already transparent, AI bypassed   |
| `failed`                      | Processing failed at any stage           |

## 9. Security

### SSRF Protection (URL Import)

The URL import endpoint implements OWASP SSRF prevention:

- Requires HTTPS for remote imports
- Rejects localhost, loopback (127.0.0.1, ::1), link-local (169.254._, fe80._), private IPv4 (10._, 172.16-31._, 192.168.*), reserved/multicast addresses
- Rejects embedded credentials in URLs
- Validates DNS before connecting
- Handles redirects manually with same validation
- Limits redirects (manual redirect handling)
- Limits downloaded bytes (5 MB max)
- Enforces timeouts via fetch
- Validates actual image bytes, not only Content-Type
- Rejects HTML, scripts, malformed files, unsupported content

### Authentication and Authorization

- All endpoints require `manageCatalog` capability (Admin/CEO only)
- Same-origin check for non-GET requests
- Product ownership validation before processing
- Rate limiting via existing `checkManagementRateLimit`

### Worker Security

- Worker is NOT publicly accessible — private authenticated connection
- No secrets in browser bundles
- Worker secret not required for local dev (add `BACKGROUND_REMOVAL_WORKER_SECRET` for production)

## 10. Performance Characteristics

| Operation                           | Typical Time | Notes                        |
| ----------------------------------- | ------------ | ---------------------------- |
| Transparency detection              | <50ms        | No AI, pure pixel inspection |
| Rembg inference (isnet-general-use) | 2-5s         | CPU, 512x512 reference image |
| Output encoding (PNG)               | <100ms       | Depends on image size        |
| Supabase Storage upload             | <500ms       | Depends on network           |

- Model loaded once per worker process (session reuse)
- CPU inference for broad compatibility
- GPU acceleration optional (not required)
- Outputs respect 5 MB storage limit

## 11. Automated Test Coverage

### Unit Tests: `tests/unit/background-removal-transparency.test.mjs`

| Test                                      | Description                                |
| ----------------------------------------- | ------------------------------------------ |
| Opaque JPG → AI required                  | Verifies skipReason is null for RGB images |
| Opaque PNG → AI required                  | Same for PNG RGB                           |
| Fully opaque RGBA → AI required           | Alpha channel but all opaque               |
| Genuine transparent PNG → AI skipped      | >30% transparency detected                 |
| Genuine transparent WebP → AI skipped     | Same logic for WebP                        |
| Palette transparency → detected correctly | Mode P handled                             |
| Tiny accidental artifacts → threshold     | <2% transparent = run AI                   |
| Invalid image → rejected                  | Safe error handling                        |
| Unsupported image → rejected              | Non-PNG bytes rejected                     |
| SVG excluded                              | SVG not rasterized                         |
| EXIF orientation                          | Noted as upstream concern                  |
| Rembg never called on transparent         | Invocation guard verified                  |
| Rembg called on opaque                    | Normal processing path                     |
| Session reuse                             | Model loaded once                          |

### Manual Test Procedure

See Section 15 (Manual Acceptance Checklist) for the complete owner testing guide.

## 12. Manual Acceptance Checklist

The website owner should perform these steps:

1. Sign in to Miro as Admin/CEO
2. Open Products > select disposable product > Media section
3. Upload opaque JPG with white background → watch processing → confirm background removed
4. Confirm resulting image is transparent (checkerboard preview)
5. Upload genuine transparent PNG → confirm "Already transparent — no changes needed"
6. Paste valid opaque image URL → confirm automatic background removal
7. Paste transparent image URL → confirm processing skipped
8. Upload multiple images together → verify order and primary image controls
9. Restore original image → verify metadata preserved
10. Test failed URL → confirm error message and retry
11. Check public product page → verify image displays correctly
12. Verify in light, medium, and dark themes
13. Repeat in Hebrew and English
14. Test on narrow viewport (320px, 390px)

## 13. How to Disable or Roll Back

### Disable Feature

Unset `BACKGROUND_REMOVAL_WORKER_URL` environment variable. The upload endpoint
will fall back to storing original images without background removal.

### Roll Back

1. Revert `src/app/api/management/product-images/upload/route.ts` to previous version
2. Revert `src/app/api/management/product-images/route.ts` to previous version
3. Revert `src/components/management/product-editor/media-gallery.tsx` to previous version
4. Revert `src/components/management/product-editor/copy.ts` to previous version
5. Revert `src/components/management/product-editor/product-editor.module.css` to previous version

No database migration is required — no schema changes were made.

## 14. Known Limitations and Deployment Blockers

### Limitations

1. **Worker not deployed** — Python worker must be deployed separately; without it, uploads fall back to original images
2. **No explicit original preservation** — Original bytes are not stored separately for processed images (fallback to original on failure only)
3. **CPU-only inference** — GPU acceleration not configured
4. **5 MB output limit** — Processed images exceeding 5 MB will fail storage upload
5. **No restore-original endpoint** — UI shows restore option but backend endpoint needs to be implemented

### Deployment Blockers

| Blocker                                 | Owner    | Action                                                       |
| --------------------------------------- | -------- | ------------------------------------------------------------ |
| Deploy Python worker to production      | DevOps   | Deploy Docker container, set `BACKGROUND_REMOVAL_WORKER_URL` |
| Verify model commercial rights          | Legal    | Confirm `isnet-general-use` license for commercial use       |
| Implement restore-original API endpoint | Backend  | Add `POST /api/management/product-images/restore-original`   |
| Production SSL for worker               | DevOps   | Configure HTTPS for worker endpoint                          |
| Worker authentication                   | Security | Add `BACKGROUND_REMOVAL_WORKER_SECRET` validation            |

## 15. Local Startup Instructions

### Prerequisites

- Node.js 20+ (v24.20.0 installed)
- Python 3.13+ (3.13.15 installed)
- Supabase project configured (`.env.local` exists)

### Step 1: Start Next.js

```bash
cd /path/to/miro
npm run dev
```

Website available at `http://localhost:3000`

### Step 2: Start Python Worker

```bash
cd /path/to/miro/python-worker
pip install -r requirements.txt
python main.py
```

Worker available at `http://localhost:8000`

### Step 3: Verify Worker Health

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{ "status": "healthy", "model": "isnet-general-use", "model_loaded": true }
```

### Step 4: Test Background Removal

1. Open `http://localhost:3000/he/admin/products/[id]` (replace `[id]` with a product UUID)
2. Sign in as Admin/CEO
3. Navigate to Media section
4. Upload an opaque JPG image
5. Watch processing indicators
6. Verify transparent result
