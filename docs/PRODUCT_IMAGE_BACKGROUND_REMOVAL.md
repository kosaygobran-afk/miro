# Product image background removal

Reviewed: 2026-10-17. This document supersedes the original implementation notes.

Catalog managers upload a file or import a public HTTPS image in Product Editor → Media. New uploads/imports always save the validated original (SVG is sanitized); there is no automatic-removal checkbox. Obsolete `remove_background` upload flags are ignored. Authorization and same-origin checks remain in `withManagementAuth(..., "manageCatalog")`.

**Remove backgrounds from all images** processes every saved image in the current product's Media section, sequentially through the existing explicit removal endpoint. This avoids overlapping native inference and provides a real completed/total count. Individual **Remove background** buttons remain. Product **Save** does not process images. The section reports removed/already-transparent/failed/unprocessed totals and each image's actual result; partial success never becomes an all-success message. Unknown write outcomes stop the batch, disable further mutations and offer **Refresh gallery**, without automatic retries.

Every successful explicit removal saves a new transparent PNG and atomically retains the first source in `product_images.original_image_url`. Owned source objects are left intact; external sources are snapshotted into owned storage before the cutout reference is committed. Later removal/restoration never overwrites that first source. IDs, order and alt text are preserved. A red **Restore original** button appears beneath each processed image and survives navigation/reload. It restores immediately through `/api/management/product-images/restore-original`, verifies the source is still available, and conditionally updates only the displayed URL. The retained source and cutout objects remain intact. Both actions invalidate home, category and detail views in both locales. The gallery uses a checkerboard to make real alpha visible; it is display styling, not baked into the file.

Migration `20261017030000_product_image_originals.sql` adds the durable source reference and restricts public image reads to the existing display/alt/order fields. The source field is management metadata, even though retained media objects continue to use the existing public bucket. The migration follows proven prior removal audit links backwards from the current cutout to recover existing originals, with a bounded/cycle-safe traversal. It never guesses from an unrelated event. Older automatic uploads that discarded their source cannot be restored unless the owner uploads the original again. Historical external sources can only be restored if they remain accessible and valid; newly processed external images keep an owned byte snapshot.

## Actual behavior

- Supported uploads: JPEG, PNG, WebP, AVIF and sanitized SVG. Maximum 5 MB and 16 megapixels; animated images are rejected. Raster files are decoded before storage. Local filenames must match their detected format.
- All new files/imports keep their original bytes/MIME (sanitized SVG excepted) and report `status: "original"`, `reason: "user_requested_original"`. No worker call occurs during creation.
- SVG never enters the model. Explicit removal returns an unsupported error without changing the saved image.
- An unconfigured/unavailable worker, timeout, malformed/oversized response, or unusable cutout returns an explicit removal failure. The saved image and its original stay intact.
- Already-transparent input keeps its exact saved reference/format and reports `status: "transparent"` without mutation.
- Successful removal validates/decodes the PNG and requires usable alpha before storing it as `.png` / `image/png`, with `status: "processed"`.
- Upload/import insert failure cleans its new object. Confirmed removal update failure cleans only that attempt's new cutout/external-source snapshot; unknown outcomes retain objects for reconciliation. No automatic retry occurs.
- Restoration accepts only the image ID and expected current URL, never a caller-supplied source. Catalog authorization, same-origin checks and conditional current/source checks protect the write; stale views return 409. Missing/invalid retained sources return 410 without changing the image. Restoration does not call the model.
- Transfer progress is measurable; upload saving is labeled separately from explicit removal. Bulk results and red restore controls are localized and keyboard accessible. There is no before/after comparison or guarantee that segmentation preserves every fine item detail; restore is the recovery path.

## Files and contracts

| File                                                               | Responsibility                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/lib/product-image-processing.ts`                              | Shared decode/validation, worker call, output checks, fallback and status |
| `src/lib/remote-product-image.ts`                                  | Public-only HTTPS downloads with DNS pinning and bounded streams          |
| `src/app/api/management/product-images/upload/route.ts`            | File validation, storage, image row/audit, cleanup                        |
| `src/app/api/management/product-images/route.ts`                   | URL import/reference normalization; existing metadata/delete operations   |
| `src/app/api/management/product-images/remove-background/route.ts` | Explicit processing, durable source retention and conditional replacement |
| `src/app/api/management/product-images/restore-original/route.ts`  | Authorized restoration of the retained original, without model inference  |
| `supabase/migrations/20261017030000_product_image_originals.sql`   | Private source reference and proven legacy-source recovery                |
| `supabase/tests/product_image_originals.sql`                       | Migration recovery, metadata preservation and source privacy regression   |
| `src/components/management/product-editor/media-gallery.tsx`       | Progress and truthful localized results                                   |
| `python-worker/main.py`                                            | Authenticated FastAPI worker, alpha inspection and CPU inference          |
| `python-worker/test_main.py`                                       | Actual Pillow/worker endpoint tests; no copied detector                   |
| `tests/unit/background-removal-transparency.test.mjs`              | Executable Node tests of shared processing, both routes and downloader    |
| `scripts/verify-product-image-review.mjs`                          | Disposable CEO/browser QA with synthetic catalog mutations                |
| `tests/unit/product-image-reprocessing.test.mjs`                   | Existing-image route processing, authorization, concurrency and cleanup   |
| `scripts/start-background-removal-worker.mjs`                      | Local loopback worker launcher with private env and existing Python venv  |

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

The worker requires `Authorization: Bearer <token>`. It enforces a multipart stream cap before parsing, a 5 MB image cap, decoded pixel/frame limits and EXIF orientation normalization for processed results. A single nonblocking inference lock protects session initialization and prevents unbounded native-inference queues. Busy workers return 503 and the explicit action leaves the saved image unchanged. Native inference runs outside the event loop, so health remains responsive. The application deadline cancels its HTTP request; it **does not forcibly terminate** an ONNX call already running. Size the service and use a supervisor for hard process limits.

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

The browser harness covers original uploads, individual/bulk outcomes, persistent restoration, retry locks, actual red styling and bilingual/theme accessibility; it blocks catalog mutations with fixtures; it does not certify live Supabase writes or hosted worker availability. Route tests exercise storage MIME/bytes and insert-failure cleanup with storage doubles. The actual ISNet weights and local HTTP worker are verified separately with a synthetic camera image and an already-transparent second pass. Record final results in `docs/PROJECT_STATUS.md`; evidence containing private management data stays outside the repository.

## Rights, privacy and accessibility owners

The [rembg project](https://github.com/danielgatis/rembg) is MIT licensed and explicitly separates model-weight rights from library rights. Its ISNet source points to [DIS](https://github.com/xuebinqin/DIS), whose [source license](https://github.com/xuebinqin/DIS/blob/main/LICENSE.md) is Apache 2.0. This source-license evidence is not a blanket legal certification of all weights/training data. Business/legal owns confirming the exact deployed weights and retaining required third-party notices and rights to uploaded product photography. No default-model substitution is permitted.

Privacy/deployment owners approve the worker host, access and retention; images leave the Next.js process for that host only when configured. Worker errors do not disclose URLs, credentials or private paths. Public product-media visibility is unchanged. QA owns final bilingual screen-reader and physical-device review; automated layout/axe checks are supporting evidence. Existing payment/fiscal, business-copy and outbound-notification launch gates remain separate.

## Vercel production recovery — 2026-10-17

The MIRO website and image worker are separate Vercel projects on the same team. Production previously had neither worker URL nor bearer token; local configuration could not enable the hosted site. The worker's production alias is `https://miro-image-worker.vercel.app`. The website needs its server-only URL, matching private token and `BACKGROUND_REMOVAL_TIMEOUT_MS=60000`, followed by a fresh production deployment. Never copy these into public variables or Git. A production alias is used because immutable/preview worker URLs retain Vercel authentication protection.

Worker deployment uses Python 3.13/FastAPI, Fluid compute and Vercel's large-function support (`VERCEL_SUPPORT_LARGE_FUNCTIONS=1`). `prepare_model.py` downloads only the fixed ISNet upstream weights during the build, caps the download and verifies the exact checksum pinned by rembg. Generated `models/` remains ignored and ships as deployment data, not Git content. `main.py` uses those bundled weights when present, avoiding a model download in a cold request. Hosted `NUMBA_DISABLE_JIT=1` avoids optional matting compilation; actual ISNet inference and the CPU provider are unchanged. `NUMBA_CACHE_DIR` points to a temporary directory; keep runtime writes out of the read-only deployment bundle.

Vercel's dependency packaging stripped scikit-image `.pyi` files, causing an actual runtime `ValueError` during `import rembg`. These are runtime inputs to `lazy_loader`, not merely editor hints. The build copies exact installed scikit-image stubs into ignored `runtime_stubs/` data files. `platform_compat.py` redirects only missing scikit-image stubs to those copies; normal installed-library behavior and unrelated packages are preserved. The real fallback regression runs disk/opening morphology functions, not a copied implementation. Docker copies the compatibility module but uses its ordinary installed stubs.

The worker deployment payload is prepared from only its Python/runtime/config files, outside the Next.js repository root, and linked to the worker project. This prevents parent website build settings or unrelated dirty changes from entering the worker deployment. Keep its config isolated from the website. A source push to the website does not independently release the worker. Re-run actual authenticated hosted inference after worker changes, then verify the website API/storage flow with a disposable draft product and actor. Clean up all synthetic media as well as database/auth rows; never use an owner product as a fixture.

Local recovery also installed user LaunchAgent `com.miro.background-removal`, which runs the existing local launcher at login and restarts it after exit. Its plist contains no bearer token; the launcher reads private local configuration. Logs are under the user's private `Library/Logs/MIRO/background-removal` directory. While that service owns port 8000, a second `npm run dev:image-worker` correctly refuses to replace its listener. This local service has no role in hosted processing.

Hosted worker proof: authenticated synthetic JPEG returned HTTP 200, `skipped:false`, decoded alpha 0–255, 6.93 seconds. Website end-to-end activation results are recorded in `docs/PROJECT_STATUS.md`; this direct worker proof alone does not certify website writes. Existing image-rights/privacy approval and manual bilingual accessibility owners remain unchanged.
