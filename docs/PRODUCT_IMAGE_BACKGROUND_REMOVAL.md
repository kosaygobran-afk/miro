# Product image background removal

Reviewed: 2026-10-17. This document supersedes the original implementation notes.

Catalog managers upload a file or import a public HTTPS image in Product Editor → Media. Both routes validate the image, call the same optional private worker, save the resulting file in `product-media`, insert `product_images`, and record the actual processing outcome in the audit event. Authorization and same-origin checks remain in `withManagementAuth(..., "manageCatalog")`.

Existing gallery images now have a separate **Remove background** button. The upload checkbox applies to new images; product **Save** does not run image processing. The explicit action processes the existing saved image immediately through `/api/management/product-images/remove-background`. On success it replaces only that image row's URL with a new PNG URL, preserving its ID, order and alt text. A conditional update rejects concurrent replacement, and cache invalidation covers home, category and detail pages in both locales. It is shared by all products.

Unavailable processing and unsupported SVG return an error without changing the existing image. Already-transparent input leaves its reference unchanged. The original object is retained, with its previous URL in the audit event; there is still no one-click restore UI. Failed confirmed updates clean up only the new cutout; unknown write outcomes retain it for reconciliation and require a gallery refresh before retry.

## Actual behavior

- Supported uploads: JPEG, PNG, WebP, AVIF and sanitized SVG. Maximum 5 MB and 16 megapixels; animated images are rejected. Raster files are decoded before processing/storage. Local filenames must match their detected format.
- Operators can turn off automatic removal for either file uploads or URL imports; the validated original is saved with `reason: "user_requested_original"`.
- SVG stays sanitized SVG and never enters the model. External SVG imports use the same sanitizer as local uploads.
- No worker URL: save the original, with `status: "original"` and `reason: "worker_not_configured"`.
- Worker failure, timeout, malformed/oversized response, or unusable cutout: preserve the original with `status: "original"` and `reason: "processing_unavailable"`. No automatic retry of the catalog write.
- Already-transparent input: preserve exact original bytes and format, including transparent WebP. Return `status: "transparent"`.
- Successful processing: validate/decode the PNG result and require usable alpha; store it with `.png` and `image/png`. Return `status: "processed"`.
- Uploaded objects are removed if the image-row insert fails. Existing owned references are normalized to their public storage URL without downloading/reprocessing them.
- The UI reports measurable transfer progress, a combined processing/saving state, and the actual saved outcome in Hebrew/English. It does not simulate inference stages. Unknown upload outcomes instruct the operator to refresh before retrying.

New uploads/imports do **not** retain a second original after successful processing. Existing-image processing retains its prior object as described above. Neither path provides before/after comparison or one-click restoration. Keep source files externally; to restore through the UI, turn off removal for new uploads and upload the source again. Do not advertise a restore control until that flow exists.

## Files and contracts

| File                                                         | Responsibility                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/lib/product-image-processing.ts`                        | Shared decode/validation, worker call, output checks, fallback and status |
| `src/lib/remote-product-image.ts`                            | Public-only HTTPS downloads with DNS pinning and bounded streams          |
| `src/app/api/management/product-images/upload/route.ts`      | File validation, storage, image row/audit, cleanup                        |
| `src/app/api/management/product-images/route.ts`             | URL import/reference normalization; existing metadata/delete operations   |
| `src/app/api/management/product-images/remove-background/route.ts` | Explicit processing of an existing image; conditional URL replacement |
| `src/components/management/product-editor/media-gallery.tsx` | Progress and truthful localized results                                   |
| `python-worker/main.py`                                      | Authenticated FastAPI worker, alpha inspection and CPU inference          |
| `python-worker/test_main.py`                                 | Actual Pillow/worker endpoint tests; no copied detector                   |
| `tests/unit/background-removal-transparency.test.mjs`        | Executable Node tests of shared processing, both routes and downloader    |
| `scripts/verify-product-image-review.mjs`                    | Disposable CEO/browser QA with synthetic catalog mutations                |
| `tests/unit/product-image-reprocessing.test.mjs`             | Existing-image route processing, authorization, concurrency and cleanup |
| `scripts/start-background-removal-worker.mjs`                | Local loopback worker launcher with private env and existing Python venv |

Worker JSON uses **`image_base64`**, matching Python. Browser/audit metadata uses:

```json
{
  "background_removal": {
    "status": "processed",
    "skipped": false,
    "reason": null
  }
}
```

`skipped` is true for both transparent and original outcomes. Use `status`, not `skipped`, to choose the user message. Worker/provider exceptions and configured URLs/tokens are never sent to the browser or included in processing audit metadata.

## Download and worker boundaries

External imports require HTTPS, default port 443, and no embedded credentials. Each redirect (at most three) is resolved relative to the previous URL and validated independently. All DNS answers must be public; private, loopback, link-local, mapped IPv4, reserved and documented special-use ranges are rejected. The HTTPS socket is pinned to a validated DNS answer while retaining hostname TLS verification. DNS/connection/response streaming share a 15-second deadline. The actual stream has a 5 MB cap, independent of Content-Length; redirects do not buffer arbitrary bodies. A returned MIME header alone never establishes image safety.

The worker requires `Authorization: Bearer <token>`. It enforces a multipart stream cap before parsing, a 5 MB image cap, decoded pixel/frame limits and EXIF orientation normalization for processed results. A single nonblocking inference lock protects session initialization and prevents unbounded native-inference queues. Busy workers return 503 and the application saves the original. Native inference runs outside the event loop, so health remains responsive. The application deadline cancels its HTTP request; it **does not forcibly terminate** an ONNX call already running. Size the service and use a supervisor for hard process limits.

Transparency is measured from decoded RGBA alpha, including palette and PNG tRNS forms. More than 30% nonopaque pixels plus more than 10% alpha below 128 skips inference. This heuristic can process cutouts with small transparent margins; visually review important product images. Empty or entirely opaque model outputs are rejected. This is not a guarantee of segmentation quality for every photograph.

## Setup and deployment

Python 3.13 is tested. Dependencies are pinned at the direct-package level; `rembg[cpu]` installs ONNX Runtime and `python-multipart` enables FastAPI uploads.

```sh
python3 -m venv /tmp/miro-bg-worker
/tmp/miro-bg-worker/bin/pip install -r python-worker/requirements.txt
# Supply the same private token to the worker and the Next.js server.
BACKGROUND_REMOVAL_WORKER_TOKEN=<private-token> /tmp/miro-bg-worker/bin/python python-worker/main.py
```

The default bind is loopback `127.0.0.1:8000`. For a private container service:

```sh
docker build -t miro-bg-worker python-worker
# Inject BACKGROUND_REMOVAL_WORKER_TOKEN from the platform secret store.
# Mount the worker user's model-cache directory persistently.
docker run --env BACKGROUND_REMOVAL_WORKER_TOKEN -p 127.0.0.1:8000:8000 miro-bg-worker
```

| Server variable                   | Meaning                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| `BACKGROUND_REMOVAL_WORKER_URL`   | Optional worker base URL; empty disables processing             |
| `BACKGROUND_REMOVAL_WORKER_TOKEN` | Shared bearer secret, required by worker; never `NEXT_PUBLIC_`  |
| `BACKGROUND_REMOVAL_TIMEOUT_MS`   | Application request deadline, default 30000, clamped 1000–60000 |
| `WORKER_HOST`, `WORKER_PORT`      | Worker listener, default loopback:8000                          |

Use private networking or TLS across hosts. Keep this service off public unauthenticated ingress; add platform request limits and provision CPU/RAM. The fixed model is **`isnet-general-use`**; there is no environment model switch. First opaque-image use lazily downloads/loads its weights; warm the actual model before activation and persist its cache. `/health` reports authentication configuration and whether the model has loaded; a healthy process alone is not evidence of successful inference. Container health uses Python's standard library, without an undeclared curl dependency.

Deployment owner: deploy the worker separately, configure both server variables, warm it, and prove an authenticated hosted upload/import round trip. The Python worker is not deployed by a Next.js build or a Git merge. Docker is not available in the review environment; the exact pinned Python environment and HTTP worker were exercised locally, but the container build remains a deployment check.

2026-10-17 local setup: `.env.local` now contains a private loopback URL, matching token and 60-second deadline. The real worker was started and warmed using the retained Python 3.13 environment and existing ISNet model (about 170 MiB; no new download). Hosted configuration remains separate. Start/restart locally with:

```sh
npm run dev:image-worker
# In another terminal, run the website as usual:
npm run dev
```

Keep the worker terminal open and restart it after reboot. The launcher reuses `python-worker/.venv` or a retained review venv; set `BACKGROUND_REMOVAL_PYTHON` to another installed worker Python executable if needed. It never installs packages, substitutes a model, prints the token or replaces a busy listener. Only loopback HTTP is accepted by this development launcher. Model weights may download on first use if the selected cache is absent. A configured URL alone is not proof of successful removal.

Manual check: open any product → Media → **Remove background** below an existing raster image. Wait for **Background removed**, refresh, then choose **View storefront**. The image is saved immediately, without product Save. Product `5586793` was verified with the real action: the same single image row now serves a PNG with alpha 0–255 through Hebrew/English detail pages, and its original JPEG remains unchanged. Both `/store/tools/5586793` and canonical `/store/accessories/5586793` resolve; all editor links use the shared catalog category mapping.

Follow-up display correction: public single-image galleries previously placed the main stage inside the 84px thumbnail column, making the decoded image appear blank. `storefront.css` now spans the main stage across the gallery when thumbnails are absent; multi-image galleries keep their side strip and mobile places it below. Verify visible product content and main-stage size after using View storefront; a 200 response and valid PNG alone do not verify presentation.

## Verification and limits

```sh
node --test tests/unit/*.test.mjs
/tmp/miro-bg-worker/bin/pip install -r python-worker/requirements-test.txt
/tmp/miro-bg-worker/bin/python -m unittest discover -s python-worker -v
npm run lint
npm run typecheck
npm run build
# Against a running production server; auth actors are deleted in finally.
ADMIN_BASE_URL=https://127.0.0.1:3217 IMAGE_REVIEW_BROWSER=chromium node scripts/verify-product-image-review.mjs
# Limit browser fixtures to this feature:
ADMIN_BASE_URL=http://localhost:3000 IMAGE_REVIEW_SCOPE=media node scripts/verify-product-image-review.mjs
```

Use a local HTTPS proxy/certificate for WebKit secure-cookie authentication. The harness accepts `chromium`, `webkit` or `firefox` through `IMAGE_REVIEW_BROWSER`; results default to separate OS temporary directories. The local Firefox runtime currently fails before application startup and remains a tooling-owner check.

The browser harness blocks catalog mutations with fixtures; it does not certify live Supabase writes or hosted worker availability. Route tests exercise storage MIME/bytes and insert-failure cleanup with storage doubles. The actual ISNet weights and local HTTP worker are verified separately with a synthetic camera image and an already-transparent second pass. Record final results in `docs/PROJECT_STATUS.md`; evidence containing private management data stays outside the repository.

## Rights, privacy and accessibility owners

The [rembg project](https://github.com/danielgatis/rembg) is MIT licensed and explicitly separates model-weight rights from library rights. Its ISNet source points to [DIS](https://github.com/xuebinqin/DIS), whose [source license](https://github.com/xuebinqin/DIS/blob/main/LICENSE.md) is Apache 2.0. This source-license evidence is not a blanket legal certification of all weights/training data. Business/legal owns confirming the exact deployed weights and retaining required third-party notices and rights to uploaded product photography. No default-model substitution is permitted.

Privacy/deployment owners approve the worker host, access and retention; images leave the Next.js process for that host only when configured. Worker errors do not disclose URLs, credentials or private paths. Public product-media visibility is unchanged. QA owns final bilingual screen-reader and physical-device review; automated layout/axe checks are supporting evidence. Existing payment/fiscal, business-copy and outbound-notification launch gates remain separate.
