<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Supabase transport resilience — 2026-10-22

- Route every server-side Supabase client through `src/lib/supabase/fetch.ts`: `supabaseFetch` (15s, critical writes), `supabaseFetchPublic` (6s, anonymous catalog/navigation), `supabaseFetchFast` (4s, analytics/session/proxy). Two consecutive transport failures open a process-local 30s circuit; any HTTP response closes it. Breaker/deadline errors are deliberately abort-shaped (`SUPABASE_UNAVAILABLE` / `SUPABASE_TIMEOUT`) so the installed SDK stops retrying idempotent reads immediately. Do not rename them back to plain errors without rechecking the SDK retry loop.
- `/api/track` must stay fail-open and must return immediately while the circuit is open; only verify a session when an `sb-*` cookie exists, and keep both rate-limit windows parallel. `/api/auth/session` must skip the network for anonymous visitors. Global Store navigation may serve its last-known-good bilingual labels, but never stale-serve products, prices or stock.
- `fetch failed` / `ConnectTimeoutError` means upstream transport (or a paused project), not a database permission failure. Check `.env.local` host/key presence and the Supabase dashboard before changing authorization code. Analytics gaps during a circuit-open period are incomplete reporting, not financial records.

## Backend ops contract — 2026-10-19

- `/api/commerce/jobs` is the outbox/intent-expiry worker. **2026-10-21 owner override:** `vercel.json` temporarily runs it once daily (`0 2 * * *`, 02:00–02:59 UTC on Hobby) to fit the free cron limit. This supersedes the previous five-minute schedule. Daily execution is for preview/development: expiry cleanup and payment/refund/document background work are delayed; the worker currently claims only one outbox job per invocation. Restore a monitored five-minute scheduler before live commerce; track the upgrade in `docs/FUTURE_UPGRADES.md`. Vercel authenticates with `Authorization: Bearer ${CRON_SECRET}`; external schedulers use `COMMERCE_JOB_AUTH_SECRET`. Both must be ≥32 chars; route logic stays timing-safe and fail-closed (401). Never widen auth beyond these two secrets.
- All 429 responses carry `Retry-After: 60` and the closed-code body `rate_limited`. Management routes must return the shared `tooManyRequests()` helper from `api/management/_shared.ts`, commerce paths go through `commerceFailure`, enquiries through its `failureResponse` — do not hand-roll 429 JSON.
- `GET /api/health` is the readiness surface for schedulers/monitoring: unauthenticated, boolean-only (redacted commerce config, public `catalog_version` ping, 200/503). Do not add credentials, row data or configuration values to it, and do not create a second health endpoint.
- Remaining backend review items are owner-gated and tracked in `docs/PROJECT_STATUS.md`: MFA for privileged roles, settlement ingest source, outbox alerting channel, EXIF policy on preserved originals.

## Two-level catalog categories — 2026-10-17

- Read `docs/CATALOG_CATEGORIES.md` before changing categories or product classification. `products.category_id` is the required main/root category for new products; `subcategory_id` is optional and must match its parent. Existing categories remain roots. Preserve two-level database guards and atomic child clearing when changing a root.
- Public `StoreCatalog.categories` and global menus contain roots only; children use the separate `subcategories` projection and `/store/[rootKey]?subcategory=[childSlug]`. Root aliases must not normalize child slugs. Keep both FK names explicit in product/category PostgREST embeds.
- Root URL aliases are unique through `catalog_category_route_key` and the partial expression index. Keep SQL/client mappings aligned; changing aliases requires a collision preflight and index rebuild in a new migration, not only replacing the immutable helper.
- Category pages default to the collapsed root bar with the active root visible as a compact current-location card, clear expand/collapse labels and both selected levels highlighted. Subcategories render as their own single-row scrollable chip bar directly under the main-category band (reading-start label, counts, edge fades, reading-direction step buttons); search/sort sit in their own row after it. Preserve narrow-phone stacking, keyboard access and both appearance versions. Use disposable fixtures with cleanup for browser QA; never reclassify owner products for a test.

## Native NVIDIA CLI runtime — 2026-10-07

- The owner requested Nemotron 3 Ultra 550B A55B at maximum supported settings in both Kimi Code and OpenCode. Local native defaults now use `nvidia/nemotron-ultra`; OpenCode keeps `build` and GPT-OSS 20B workers. This supersedes previous model-default notes for those tools, without changing Codex model routing.
- Read `docs/tooling/NVIDIA_CLI.md` before changing the native CLI providers or launchers. Their NVIDIA endpoint uses a loopback compatibility LaunchAgent because Kimi Code 2.1.1 always emits an unsupported cache field. Preserve the fixed upstream, private credentials/logs, streaming/cancellation, actual model identity and failure status. Never make an Ultra verification pass by substituting another model.
- Maximum supported effort is `high`, with unrestricted reasoning budget and the documented 32,768-token output ceiling. The configured million-token context is catalog metadata, not evidence of a full-window load test. Run the bridge regressions and real synthetic read-tool/final-answer checks after runtime changes; preserve unrelated dirty website work.

## Public-surface engineering pass — 2026-10-18

- **2026-10-20 owner override:** public/visitor/customer controls now match the management interface's bordered rounded rectangles, superseding the circle/pill geometry recorded below. `public-refinement.css` stays last and owns 0.75rem icon frames / 0.85rem actions / 0.5rem compact icon cells; use existing public palette tokens and preserve Version 1. Follow the newer frame/spacing contract in `docs/DESIGN_SYSTEM.md`, including nested selector parity and the public component review harness. Do not restore the older circle rules while making future refinements.
- **Persistent card bitmap corners — 2026-10-20:** computed `border-radius` did not clip resting image pixels with visible overflow. Version 2 grid/rail `<img>` elements now use `clip-path: inset(0 round 0.85rem)` in the base state; preserve natural fitting, reveal opacity, Version 1 and the unclipped popup lens/tooltip. Keep the screenshot-pixel regression in `tests/product-card-media.spec.ts`; do not certify this from computed radius alone.

- `src/styles/public-refinement.css` is the LAST import in `[locale]/layout.tsx` (after `card-refinement.css`) and owns the Version 2 public page-level pass: uniform auto-fill grid for `.sf-category-filters` chips (labels wrap at word boundaries with balance, 0.78rem inside the grid), centered action/CTA labels, one circle language for icon-only controls (guarded header chrome with `:not(:has(.mgmt-shell-root, [data-management-surface="true"]))`, public-only preview close/arrows, search clear), tightened subcategory chip parity and toolbar rhythm.
- The contact page direct methods are bordered pill rows with lucide icons (`experience-contact-methods` markup in `(public)/contact/page.tsx`); service capability-strip and contact checklist icons render as bordered tiles via CSS only. Version 1 stays untouched; the CEO/admin console shell is guarded.
- Storefront toggles share the card control language (dated "Storefront toggle radius completion" section at the end of `public-refinement.css`): Version 2-only, radius-only (999px pills / circles), shipped sizes/glyphs/hover paints preserved. `customer-refinement.css` and `product-preview-refinement.css` own several toggle radii with `!important` or nested `:root` shapes — mirror those resolved ancestors before overriding, and confirm with computed styles. `.sf-thumbnail` media tiles stay at their media radius by design.
- Card/preview IMAGES round at the catalog media radius `0.85rem` (dated "Rounded card media" block at the end of `product-card-sections.css`; Version 2 only, radius-only, no overflow clipping — the popup stage keeps its own `0.9rem` bordered shell and the magnifier tooltip/lens must stay unclipped). Radius differs by surface: controls pill at 999px, media at 0.85rem, detail main image shell 1.5rem.
- Cascade guard for future edits: `product-preview-refinement.css` declares some preview geometry inside nested `:root[data-appearance-version="2"]` blocks, which outrank later flat rules — mirror the resolved ancestor shapes (`:is(.sf-hover-preview, .sf-detail-magnifier) .sf-hover-preview-toolbar .sf-hover-preview-close`, the preview-nested arrow) before assuming an override applied. Verify with computed styles. Pre-existing e2e failures (`store-comprehensive` detail axe/gallery, `store-merchandising` first-card VAT, `store-loading` stall) fail identically at a clean HEAD checkout without this layer — treat them as separate owner work.

# Legal Reminders

At each milestone, briefly report newly relevant legal/privacy/accessibility issues and outstanding launch blockers, with an owner/action.

# AI Handoff Logging

After every meaningful project change, update `docs/PROJECT_STATUS.md` with:

- what changed
- why it changed
- commands run and whether they passed
- remaining blockers or owner actions

## OpenCode Subagent Orchestration

- Keep `build` as the default primary agent unless the owner explicitly changes it in OpenCode.
- Use GPT-OSS 20B for subagents. Delegate only when parallel investigation or independent work is useful.
- Keep at most six subagents active at once. OpenCode has no configured hard concurrency cap, so the primary agent must enforce this limit.
- For more than six independent tasks, start up to six and keep the rest queued. When a subagent finishes, review its result and ownership, then immediately assign the next queued task to that freed slot. Never exceed six active subagents.
- Keep file ownership disjoint, and have the primary agent coordinate integration and final verification. Subagents must not launch nested subagents.

When a change affects how future agents should work, also update the relevant docs in `docs/` or this `AGENTS.md` file.

## Owner-requested Israeli commerce handoff — 2026-10-06

- `docs/LUNA_COMMERCE_PROMPT.md` and `docs/commerce/` contain the owner's new implementation scope: real card/bit checkout, expenses, reports, independent invoicing with editable business identity, Israeli integrations and responsive fullscreen POS. These are requirements and a researched plan, not implemented/payment-certified features.
- For this task the owner explicitly selected **Codex with Luna and subagents**. The OpenCode model-routing rules above continue to apply to OpenCode; do not change `opencode.json` or global models for this Codex task. Use the actual Codex concurrency limit, disjoint ownership, no nested children and primary integration/verification.
- Preserve the enquiry/quote-only path for unapproved price/stock or disabled online payments. Existing POS payment-method labels record tender; they do not charge a gateway. Future async payments must verify server-side status and prevent duplicate charge/order/stock effects. Unknown financial writes require reconciliation before retry.
- The requested invoice engine is internal, not a mandatory external invoice SaaS. Issued identity/content/artifacts must remain immutable, with protected numbering, signing/allocation integrations and retention. Official issuance and live payment activation remain gated by documented business/accountant/provider readiness; no fake signatures, allocation numbers or payment success.
- The phrase “ללא אובליגו” requires an explicit provider-approved definition; do not infer it from ordinary installments, recurring billing or authorization holds. Fullscreen must consider native browser support and shared overlay portals, with an edge-to-edge mobile fallback.
- Track every requirement C01–C18 in the implementation status/evidence. Read relevant installed Next.js guides and skills before editing, preserve dirty work and historical evidence, and update `docs/PROJECT_STATUS.md` after meaningful changes.

# Premium storefront enhancement — 2026-09-20

This update aligned the existing MIRO frontend with the supplied premium dark storefront reference and strengthened the experience without changing the core architecture. The site remains a Phase 1 front-end foundation, but the presentation now reads more like a premium Israeli security brand storefront instead of a generic placeholder.

What changed:

- refined the dark theme palette toward a more premium black/charcoal/yellow system with stronger contrast and calmer shadows
- elevated the visual hierarchy of the header, hero, cards, and CTA surfaces to match the provided reference more closely
- improved the storefront hero treatment with stronger radial glow, tighter typography, and a more product-focused composition
- upgraded the product cards and store sections so they feel more premium, brighter, and more conversion-friendly
- kept the site fast and lightweight by relying on CSS tokens and existing SVG/icon techniques instead of adding libraries or heavier UI frameworks

Why this change was needed:

- the previous version was structurally correct but visually more like a clean prototype than a premium business storefront
- the reference showed a stronger luxury-security look with darker surfaces, sharper contrast, gold accents, and denser product merchandising
- the site should now better match the intended MIRO brand direction before the next engineering phase starts

Files touched:

- src/app/globals.css
- src/app/[locale]/(public)/store/page.tsx
- src/components/layout/header-client.tsx

Commands run and status:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Remaining blockers / owner actions:

- real authentication and database/role work are still deferred to Phase 2
- final legal, privacy, accessibility and business identity approvals are still required before public launch
- actual product photography, approved pricing and catalog inventory remain pending and must be provided by the business owner

Future AI handoff note:

- the visual direction remains premium dark storefront, but the site is still a front-end preview and not a real commerce or operations system
- do not treat the current product data or submission flows as production-ready
- when further design updates are made, preserve the black/yellow premium palette and the clean three-level IA pattern: Home > Services > Store > Contact

# Three-mode theme refinement — 2026-09-20

This follow-up focused on the interactive theme experience requested by the owner: a premium three-mode system with dark, medium and light selections, a calmer medium-gray mode for readability, and a more intentional navbar treatment in the brighter modes.

What changed:

- expanded the global theme system to support `dark`, `medium` and `light` states through CSS tokens in `src/app/globals.css`
- set the default bootstrap script in `src/app/[locale]/layout.tsx` to prefer `dark` or `medium` from system preference, while honoring a stored user theme from `localStorage`
- assigned the new medium mode as the soft gray ergonomic default for long-form reading, with higher contrast and less visual fatigue than the brighter white setting
- refined the navbar and header surfaces so the bright/light theme reads as premium and cohesive rather than visually mismatched to the overall storefront direction
- converted the theme control into a switch-style segmented control with three state labels (D / M / L) to match the product-quality design intent
- kept the navigation hierarchy stable while making the control feel more polished and intentional in both desktop and mobile layouts

Why this change was needed:

- the previous theme system only supported dark and light, which did not match the requested enhanced design flow
- the bright mode navbar was too visually detached from the premium storefront language and needed a calmer, more aligned treatment
- the owner explicitly requested a medium mode that feels like a bright gray, easy on the eyes, and polished enough for long content reads

Files touched:

- src/app/[locale]/layout.tsx
- src/app/globals.css
- src/components/layout/header-client.tsx

Commands run and status:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Launch notes:

- no backend or data-layer change was introduced; this remains a front-end styling refinement
- manual design review should still confirm the final light/medium/dark balance on actual devices before launch
- legal/privacy and business approval remain required for any public-facing copy, photography or commercial claims

# Full-width premium density pass — 2026-09-20

This follow-up corrected the remaining layout feeling of too much empty space on the right side of the pages and increased the visual density so the site uses the available viewport more fully while preserving the premium MIRO brand personality.

What changed:

- widened the shared page container so the main content shells stretch further across the screen
- added more internal padding inside major page sections so cards, panels and text sit with richer breathing room
- increased the density of landing and services sections with extra stats, feature cards and richer mock content related to security and operations
- kept the internal component blocks centered and readable, while letting the page itself feel more filled and premium
- tied the added content to the security-business theme so the extra copy still feels real and editable later by the CEO/admin owner

Why this change was needed:

- the site was structurally solid but still felt too narrow and too empty on the right side
- the owner wanted the pages to feel fuller, richer and more content-dense without breaking the MIRO direction or readability
- the visual language needed stronger “value and coverage” cues while preserving a premium, calm editorial look

Files touched:

- src/app/globals.css
- src/app/[locale]/(public)/page.tsx
- src/app/[locale]/(public)/services/page.tsx

Commands run and status:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Important notes for future agents:

- keep the full-width, rich-content composition but preserve the centered inner grouping inside each component
- any extra content blocks should remain editable by the CEO/admin later without requiring deeper architectural changes
- real owner-approved copy and final product catalog data are still required before launch

# Test data seed for local storefront validation — 2026-09-20

This pass added a small live database seed for the storefront catalog so the store pages can be tested with real rows in Supabase before the business owner provides final catalog content.

What changed:

- inserted a few sample categories: Security Cameras, Alarm Systems, and Intercom & Access
- inserted six example products with realistic Hebrew/English names, prices and image URLs
- added matching product image rows for the seeded products
- kept the content clearly as validation/test data rather than final product inventory

Why this change was needed:

- the storefront routes needed to render with actual data and realistic category/product relationships during local validation
- the app was already wired to use Supabase catalog data, but there was no real content to exercise that path in a live environment
- the seed allows visual and flow checks without pretending the catalog is final or approved

Files touched:

- supabase/schema.sql
- live Supabase database via the project connection

Verification:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Important notes for future agents:

- this data is mock validation content only and should not be treated as approved inventory or business pricing
- replace or expand these rows with real owner-approved catalog data before marketing or checkout launch
- do not interpret this seed as a production inventory system or a legal product catalog

# Premium website release — 2026-09-21

- The latest design rules live in `docs/DESIGN_SYSTEM.md` under the 2026-09-21 entry; they supersede older container and placeholder styling notes. Shared wide containers are 112rem maximum with narrower informational/auth panels.
- Preserve all three themes, both locales, keyboard support, small-phone layouts and reduced motion. Never hide the site based on viewport size.
- New visual layers are `premium.css`, `experience.css` and `storefront.css`. Pure catalog helpers must remain outside client-only modules when called from server pages.
- The shared workspace may contain unrelated unfinished canvas/dashboard work. That work, its database schema and package changes were intentionally excluded from the verified `0.0.2` website release. Preserve it separately; do not fold it into storefront changes or bypass its failing checks.
- Catalog illustrations, sample prices and editable page content are previews. Real business facts, contact delivery, commerce, privacy/legal approval and manual accessibility review remain launch work. See `docs/PROJECT_STATUS.md` for checks and owners.

# Customer storefront design and navigation — 2026-10-02

- Preserve the established public dark/medium/light black/charcoal/gold themes. `src/styles/customer-refinement.css` enhances the customer experience without importing the console's neon palette. See `docs/CUSTOMER_DESIGN.md` for the public contract and operating steps.
- `/[locale]/admin/store-design` is CEO-editable and admin-read-only. Enforce writes in API authorization and the `update_storefront_design` database function; never weaken either check. Saves require the current revision and audit atomically. Public reads use `get_public_storefront_design`, never anonymous access to all `business_settings`. Inventory defaults use their separate, limited public RPC.
- Uploads use `/api/management/storefront/design/assets`, CEO-only, same-origin, 5 MB limits, content sniffing and safe SVG validation. An upload prepares a draft; publishing makes it visible. Use owned media storage where possible. Deleting a slide/brand removes its design entry, not shared storage assets.
- Reference catalog entries are real model references with manufacturer source metadata, original illustrative SVGs, unpublished prices and zero confirmed stock. Preserve quote-only behavior until the owner approves price/stock. Internal `MIRO-REF-*` barcodes are not supplier GTINs. Never invent availability, warranty, certification or authorized reseller status.
- Catalog artwork is published to the existing public `product-media` bucket so live database URLs do not depend on an unreleased frontend asset path. `scripts/seed-reference-catalog.mjs` is dry-run by default and additive with `--apply`; it preserves matching existing models and owner edits. Do not reseed or reset owner inventory.
- Mobile hamburger navigation is a document-positioned portal with glass styling. It floats above the hero and uses the document scrollbar; do not reintroduce a max-height/overflow scroll container or make the sticky header expand. Account popups portal separately, fit narrow phones, preserve focus, and Escape dismisses them before the enclosing navigation. Maintain the overlay hit-testing regressions in `tests/store-overlays.spec.ts`.
- Long customer product titles use `OverflowLabel`: measured continuous display-only rails, reading direction determined by the text, hover/focus pause, accessible single copy and static wrapping under reduced motion. Never animate input/textarea values. Product previews retain their stable 3D portal and configured hover intent; rails pause until the preview actually closes.
- Log meaningful changes and checks in `docs/PROJECT_STATUS.md`. Final manual bilingual accessibility review, catalog/brand rights approval and outbound notification/webhook implementation remain owner actions; existing enquiry intake is database-backed and checkout remains a request, without online payment or stock reservation.
- Store design revision conflicts use SQLSTATE `PT409`, applied by `20261002030000_storefront_design_conflicts.sql`. Do not raise `40001` for application version mismatches: hosted PostgREST retries serialization failures and may time out instead of returning a reviewable conflict.

# Version 0.1.0 release handoff — 2026-10-02

- The owner authorized the accumulated console and storefront work together for the `0.1.0` release branch and merge into `main`. Current package version is `0.1.0`; release scope, verified checks and remaining owners are in `docs/releases/0.1.0.md` and `docs/PROJECT_STATUS.md`.
- A local Vercel CLI environment export can be named `preview` without an `.env` prefix. Its exact root path is now ignored because it contains credentials. Never stage environment exports or print their values when preparing releases; scan staged content without echoing matches.
- Historical audit documents describe the September 28 baseline, not the current system. Treat current migrations, permission tests and latest completion/release records as the implemented state. Preserve both audit evidence and current verification evidence.

# Motion, Version 1 restoration and component refinement — 2026-10-02

- Read `docs/ANIMATION_SYSTEM.md` for the motion contract, CEO controls, file map and verification. Use shared `MotionLink`/motion router, motion tokens, region skeletons and `RevealImage`; connect effects to the existing explained switches. Reduced motion always wins. Keep navigation feedback independent of background refreshes and preserve opaque menu text while opening.
- Animation settings writes require active CEO authorization in both API and `update_animation_settings`, same-origin access, revision `PT409` and atomic audit. Public reads use the explicitly limited `get_public_animation_settings` projection. Keep the generic settings setter unable to overwrite this configuration or the protected backup.
- `appearance_version_1_backup` is immutable, including against service-role writes. Restore is a reviewable draft followed by explicit Save. New geometry/palette overrides must remain gated by `data-appearance-version="2"`; preserve `appearance-v1.css` and the original style layers. Personal theme preference, catalog, inventory, finance and storefront design content are outside this restore.
- Keep the CEO/management Dark palette intact. Version 2 public palettes exclude `.mgmt-shell-root` and `[data-management-surface="true"]`. Public Light uses warm quiet surfaces and darker gold text; public Dark/Mid retain charcoal/gold. Preserve Hebrew/English and 320px layouts.
- Analytics interpretation must state its actual data scope: UTC chart windows, recorded events, independently saved requests/orders, and the returned top-product cohort. Never label event ratios as attributed conversions or invent previous-period baselines. Finance ratios are order-backed; expenses are not included.
- Verification scripts support `REPORTING_OUTPUT_DIR` and `CONSOLE_OUTPUT_DIR` so new QA does not overwrite historical release evidence. Mock business saves, use disposable auth actors and clean them up. Record final checks and launch owners in `docs/PROJECT_STATUS.md`.

- Account history/saved previews are the latest ten source entries, not lifetime totals. `getSavedProductsWithCanonicalData` returns `null` on failure and an array on success; preserve independent errors and scoped role pricing. Product links use the normalized `category` key, not raw database category slugs. Forms keep independent statuses/drafts and never automatically retry uncertain writes.
- Navigation completion requires routed elements to exist and all `data-route-loading` markers to settle. A URL can commit before its streaming fallback mounts. Keep the indicator effect dependent on its enabled state/duration rather than settings object identity; equivalent server payloads and unrelated settings must not cancel an active trip. Cross-engine checks live in `playwright.cross-browser.config.ts`.

## Sectioned product cards and touch hold — 2026-10-11

- Public grid/rail cards have image, details, pricing and bottom actions sections with subtle theme-token dividers. Only the upper `data-preview-source` wrapper owns preview hover/hold; keep buttons outside it, visible and independently clickable. Desktop popup placement/animation must preserve original footer hit-testing. Explicit button/hold previews use viewport-bounded dialogs. See `docs/ANIMATION_SYSTEM.md` for compact-space fallbacks and anatomy. **2026-10-22 owner override:** card/rail hover previews are temporarily disabled through `PRODUCT_PREVIEW_HOVER_ENABLED = false` in `src/features/catalog/product-preview-triggers.ts`; the eye button and keyboard focus remain the triggers. Keep the hover handlers wired and re-enable by flipping that constant (then un-skip the hover-only test assertions).
- Touch/pen opens after 500ms with local pressed feedback; normal taps and native scroll/pinch remain intact. Preserve gesture cancellation, scoped release/context-menu guards and keyboard alternatives. Actual mouse PointerEvents own hover; shared stationary dismissal releases in document capture before React intent runs. A fired hold tracks release independently of source cancellation.
- Keep `tests/product-card-sections.spec.ts` plus response/style/loading regressions. Native CDP verifies touch/pen timing and release behavior; paused real animation frames verify footer clearance. Physical-device/screen-reader approval remains a QA action. Do not change catalog/settings/commerce to validate presentation.

## Version 0.1.1 release handoff — 2026-10-14

- The owner authorized the accumulated commerce/POS, performance, motion/card and native-tooling source release as `0.1.1`, following remote `0.1.0`, with merge into `main`. Package version is now `0.1.1`; release scope, verification and owners are in `docs/releases/0.1.1.md` and `docs/PROJECT_STATUS.md`.
- Preserve the locally retained `archive/local-main-before-0.1.1` history without pushing it: it contains an added-then-deleted debug-session ZIP. The release includes the resulting source tree based on remote main, without that private debug history. Environment exports and generated Python caches remain ignored; scan staged blobs and newly reachable history before publishing.
- Git merge and hosting readiness are separate checks. Commerce merchant activation, real signed sandbox proof, official fiscal issuance and manual accessibility/business/privacy approval retain the documented gates; releasing the source does not certify or enable them.

## Reversible product backgrounds — 2026-10-17

- Product Editor → Media now saves all new uploads/imports as originals. Do not restore the automatic-removal checkbox or honor obsolete upload processing flags. Explicit single-image or **Remove backgrounds from all images** actions run removal; the bulk UI processes the current gallery sequentially with truthful per-image/partial totals.
- `product_images.original_image_url` retains the first source atomically with a cutout URL; keep it across reprocessing/restoration and out of public catalog SELECT grants. New external sources are snapshotted to owned storage. Red **Restore original** uses the authorized, same-origin `/api/management/product-images/restore-original` endpoint, verifies availability and conditionally swaps only the current URL. Preserve ID/alt/order, both source/cutout objects and bilingual home/category/detail invalidation.
- Migration `20261017030000_product_image_originals.sql` recovers only proven older saved-image audit chains. Discarded automatic-upload originals cannot be reconstructed. Before/after comparison remains absent. Unknown writes stop bulk work and lock further mutations until refresh; never auto-retry or delete objects with uncertain references.
- Read the updated image-processing guide and run the executable Node route tests, disposable SQL and `IMAGE_REVIEW_SCOPE=media` browser harness. Check actual red restore styling in all themes; generic console secondary-button rules can override a low-specificity color.

## Product image processing review — 2026-10-16

- Read `docs/PRODUCT_IMAGE_BACKGROUND_REMOVAL.md` before changing the image pipeline. Both image-create routes share `product-image-processing.ts`; the Python wire field is `image_base64`. Browser/audit `background_removal.status` distinguishes `processed`, `transparent` and `original`; never announce removal or transparency from `skipped` alone.
- Preserve original bytes/MIME when the worker is disabled/unavailable or input is already transparent. Validate decoded inputs and worker outputs; keep SVG sanitation, 5 MB/16 MP/frame limits, same-origin/catalog authorization and failed-insert storage cleanup. External downloads must retain validated DNS pinning, redirect/deadline/stream caps; hostname-prefix checks are insufficient.
- The separate worker requires the shared server-only bearer token. Keep fixed ISNet identity, single-inference locking, bounded uploads, usable alpha validation and truthful health/configuration reporting. A Next.js build/merge does not deploy the worker. HTTP cancellation does not kill native inference already running.
- Run the real Node route/helper tests and `python-worker/test_main.py`; do not replace Python tests with a copied JavaScript detector or import an uninstalled test runner. Browser QA uses `scripts/verify-product-image-review.mjs`, disposable auth cleanup and synthetic catalog mutations. Retain private QA artifacts outside git. Before/after comparison remains absent; the newer reversible-background contract above supersedes the earlier lack of one-click restoration.

## Reconcile handoff claims with source — 2026-10-16

- `docs/DOCUMENTED_CHANGE_RECONCILIATION.md` tracks reconstruction of recent Windows handoff entries whose source was absent after pulling. Historical QA claims are not proof for this checkout. Keep dated evidence and verify the actual files before declaring a documented change complete.
- Preview arrow/image/counter cells, Close clearance, native thumbnail gutters and scaled client-bound selection live in `product-card-sections.css` / `product-hover-preview.tsx`. Preserve Version 1, minimal-height source/footer clearance, gestures and reduced motion. Run the widget/section/style regressions.
- Shared navbar dimensions use `--navbar-content-height`; announcement position uses separate `--navigation-header-edge`. Public styles remain in `navigation-refinements.css`, protected chrome in `management-navbar.css`. Responsive toolbar contents stay mounted; dialogs/tool state and overlay-first Escape/focus must survive resizing. Account menus identify the actual current area separately from destination actions.
- Native bridge v2 permits bounded retries only for explicit transient HTTP failures before streaming. `X-Miro-Retry-Owner: client` disables bridge retries for clients with their own budget. Preserve fixed NVIDIA upstream, actual Ultra/GPT-OSS identities, private credentials/logs and failure status. The Windows starter never kills an existing service automatically; its execution still needs Windows verification.

## Existing product image removal and storefront routes — 2026-10-17

- Media uploads/imports now preserve originals as described above; product Save does not process existing images. Existing images use the explicit `/api/management/product-images/remove-background` action. Preserve catalog/same-origin authorization, actual worker outcomes, conditional URL replacement, image metadata, original storage objects, and safe cleanup/reconciliation of unknown writes. Never report success when an explicit removal saved no cutout.
- `npm run dev:image-worker` launches the real fixed ISNet worker locally from an installed Python environment; private configuration remains in ignored `.env.local`. Keep local runtime readiness distinct from hosted deployment. See `docs/PRODUCT_IMAGE_BACKGROUND_REMOVAL.md` for restart/manual checks and evidence.
- `src/lib/catalog/routes.ts` owns category aliases for catalog reads, editor links and public category/detail matching. Use it for storefront product URLs (for example database `tools` maps to public `accessories`); retain hidden-product/wrong-category checks and both locales. Image writes must invalidate detail pages as well as home/category views.
- The public detail gallery omits thumbnails for zero/one image. Its main stage must span the full gallery in those cases, including the loading/illustration stage; only a present thumbnail strip reserves a side column. Below 600px the main stage spans full width and thumbnails move below. Verify actual rendered image dimensions/pixels, not only HTTP image responses.
- Enhanced Version 2 product presentation lives in `product-detail-refinement.css`: desktop gallery/info panels use equal columns and stretch to equal content height, with explicit gallery track width; stacked phone/tablet panels remain intrinsic. Keep these styles scoped to Version 2, wrappers transparent to Version 1, and product-card gesture/footer contracts intact. Read the 2026-10-17 balanced-detail entry in `docs/DESIGN_SYSTEM.md` before changing these layouts.
- The owner clarified that smaller/unified card dimensions refer to popup previews only. Preserve static card widths. Popup Version 2 maximums are 416px wide/592px tall (592px raised from 560px by the 2026-10-18 card refinement) in `product-preview-refinement.css` and the matching placement constant; viewport/source-action clearance still wins. Use actual `ProductIdentifiers` metadata in cards/previews/detail; omit missing codes and label internal `MIRO-REF-*` values accurately. Keep overflow within the popup's existing accessible details scroller.
- **Card typography and control unification — 2026-10-18:** `src/styles/card-refinement.css` (last import in `[locale]/layout.tsx`) owns Version 2 card/preview/chip refinements — 42px pill controls with 40px frozen footer squares and a single-row footer above 600px (stacked rows return inside the same media query because the `flex` shorthand would defeat storefront.css), 0.66/0.74rem identifier labels/values in `--accent-text`, 1.2rem priced amounts, 0.82rem/640 unpublished-price notices (shortened copy in `store-copy.ts`, both locales), and collection chips mirrored to the subcategory chip contract including badge counts. The popup inner cap is 37rem/592px and must change together with `maximumHeight` in `product-hover-preview.tsx`; `tests/product-preview-identifiers.spec.ts` encodes 592px plus weight ≥620/size ≥11px identifier emphasis. Read the 2026-10-18 entry in `docs/DESIGN_SYSTEM.md` before touching card, preview or filter chip styling; Version 1 typography stays protected.

## Hosted background removal — 2026-10-17

- Production removal needs the separate Vercel `miro-image-worker` service plus MIRO Production's server-only worker URL/token and a redeployment. Local loopback readiness never proves hosted processing. Use the worker production alias; immutable preview URLs retain Vercel authentication.
- Preserve build-time fixed ISNet checksum validation and ignored generated weights/stubs. Vercel strips scikit-image runtime `.pyi` files: `platform_compat.py` restores only its missing-stub lookups from exact installed data. Keep the real fallback regression and Docker module copy. Deploy an isolated worker payload, not the Next.js root or unrelated dirty work. Read `docs/PRODUCT_IMAGE_BACKGROUND_REMOVAL.md` for large-function, cache, inference and disposable hosted QA requirements.

# CSS foundation cleanup — 2026-10-19

- `src/app/globals.css` was rebuilt to live rules only (1968 → 658 lines). The retired pre-premium families (`miro-hero/store/service/nav/product-menu/subnav/product-card/grid/footer/feature/stat/step/mini/visual/split/contact/business/band`, `.theme-switch*`, `.theme-icon-*`, `.miro-viewport-warning`, `.miro-desktop-action`, `.miro-brand-mark`, `.miro-heading`, `.miro-rich-panel`, `.miro-search-input`, `.miro-icon-action`, `.miro-text-balance`) no longer exist and must not be reintroduced. Do not "restore" them from git history into markup.
- `.miro-container` is single-sourced in `globals.css` (112rem frame, 2rem gutters, 1rem under 768px). `premium.css` must not re-declare it.
- The legacy unreferenced `src/styles/globals.css` and `src/styles/tokens.css` were deleted; `src/app/globals.css` is the only runtime token source. Owner-preserved canvas/workspace utility classes (`.canvas-*`, `.selection-highlight`, `.snap-line-active`, `.minimap-viewfinder`, `.active-tool-pill`, `.glass-panel`) deliberately remain pending the owner's canvas work.
- Catalog (`sf-*`), motion and management layers build class names dynamically or style data-attribute states; bare substring "unused class" scans are unreliable for them — verify with computed styles before deleting anything outside `globals.css`.

## Storefront preview zoom placement — 2026-10-22

- In Version 2 storefront card quick previews, the magnifier toggle lives in `.sf-hover-preview-toolbar-actions` beside the Close `X`, mounted through `togglePortalTarget`; the image tools row keeps only the counter and active zoom slider. The product detail page keeps its existing tools-row toggle. Preserve the downward toolbar tooltip, compact/minimal hiding, RTL order, focus/Escape behavior and the magnifier suite. Do not move it back without an owner request.
