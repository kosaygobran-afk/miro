# Page loading contract — 2026-10-11

Page navigation and browser reload must start independent reads together, reuse work within a render and keep data authority intact. A loading indicator or a number animation must never delay routing or data delivery.

## Public presentation

`src/lib/public-presentation-cache.ts` uses React request deduplication around Next's tagged Data Cache. This project has not opted into Cache Components; do not enable that global rendering change just to replace `unstable_cache`.

Only validated anonymous projections enter this cache: storefront design, animation settings, public contact fields and navigation category labels. These loaders use `createPublicServerClient`, never cookies, actor JWTs, `business_settings` table access or service credentials. Failed/invalid reads throw inside the cached loader; default designs/settings, empty navigation and unavailable contact fields are handled outside it and never persisted as successful configuration.

Successful protected writes expire the relevant tag with `revalidateTag(tag, { expire: 0 })` before responding. Preserve API/SQL role checks, same-origin guards, revision conflict handling and audits. The next read after a successful save fetches the new projection. The 60-second revalidation interval uses stale-while-revalidate for out-of-band database updates; it is not a strict maximum age. External configuration editors must invalidate the matching tag if immediate visibility is required.

| Projection         | Tag                         | Write route                                   |
| ------------------ | --------------------------- | --------------------------------------------- |
| Storefront design  | `public-storefront-design`  | `/api/management/storefront/design`           |
| Animation settings | `public-animation-settings` | `/api/management/settings/animation`          |
| Public contact     | `public-contact-config`     | `/api/management/settings` (`public_contact`) |
| Store menu labels  | `public-store-navigation`   | `/api/management/categories`                  |

Catalog category visibility, stock, prices, promotions, private role prices, saved products, identity and financial data remain live/request-scoped. A shared presentation cache is never a catalog or authorization cache.

## Authentication and read ordering

`createServerSupabaseClient` and the no-argument `getAuthContext` deduplicate within one React render, allowing a protected layout/page pair to share one verified actor. React render memoization does not retain clients or identities between requests or cache route-handler actors. Passing a client explicitly to `getAuthContext` always performs fresh checks, including mutation paths. Database profile/status and role rows remain authoritative.

Proxy uses the installed Supabase `getClaims` signature/expiry verification to refresh cookies. Cached asymmetric signing keys avoid an extra remote user lookup; symmetric-key tokens retain the SDK's remote verification fallback. Claims are not management authorization: protected DAL reads still verify the user remotely and load current database roles/status; SQL repeats the necessary checks.

`getStorePageData` starts request-bound catalog rows before awaiting the viewer and launches private role prices as soon as the role is known. Product contact data starts alongside that work. Supabase's explicit abort signal disables automatic identical-fetch memoization; preserve the explicit React request caches. Never automatically retry uncertain financial writes to make a loading state disappear.

Management products use one response containing products/categories with concurrent reads. Client refresh/retry uses that same endpoint, aborting stale or unmounted requests. Overview label lookups share one independent wave. Analytics category labels, per-product metrics and UTC daily aggregates run together; exact HEAD counts and the individual 5,000-session cap remain unchanged. Missing date bounds resolve before every query.

Product grid/rail, department and header category links disable speculative prefetch. In the installed Next runtime, even automatic partial prefetch can run `generateMetadata` above a loading boundary; the current catalog metadata requires live visibility/stock reads. Prefetching every distinct product/category therefore repeats the full catalog query group and competes with the page the user is viewing. Actual clicks still use the motion router, real route-loading boundaries and fresh metadata/data. Preserve navigation-settlement checks and version-based storefront refresh. Do not restore default/forced catalog prefetch without proving that its metadata work is cheap and retains the visibility/stock/security rules.

## Verification and owners

Meaningful regressions live in `tests/unit/auth-loading.test.mjs`, `store-data-loading.test.mjs`, `product-loading.test.mjs`, `management-loading.test.mjs`, and `public-presentation-loading.test.mjs`. Browser checks include `tests/store-loading.spec.ts`, `tests/motion.spec.ts`, `tests/store-overlays.spec.ts` and `tests/number-counting.spec.ts`.

For interaction checks, wait for DOM content and explicit hydration/navigation readiness; for streamed detail routes, wait for all `data-route-loading="true"` markers to settle before selecting gallery elements. Skeleton and final content can briefly coexist. A full subresource-load wait can consume the test budget on remote images after the UI is ready. Mobile WebKit has no Playwright wheel input: its document-scroll geometry checks are annotated and do not claim native touch acceptance. The final combined Chromium/desktop-WebKit/iPhone-WebKit run uses one worker to avoid headless-browser startup contention. Sanitized measurements, final browser outcomes and visual geometry live in `docs/page-loading-evidence-2026-10-11/`.

Measure initial and repeated page requests separately from development compilation, using an isolated production build so the owner's development server and historical QA evidence remain intact. Report elapsed times with the routes/environment actually measured; do not claim every network, device or data volume has a fixed response time. Do not print credentials or customer payloads. Use disposable actors and clean them up; valid business saves can be mocked to verify invalidation without altering settings.

Engineering owns cache consistency, performance verification and frontend rollout. Privacy owns retention/customer visibility; business/legal owns factual catalog/media approval; QA owns physical-device and bilingual screen-reader acceptance. Payment-provider and fiscal issuance readiness remain independently gated.
