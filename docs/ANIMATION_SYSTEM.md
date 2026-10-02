# MIRO animation, loading and appearance system

Implemented 2026-10-02. This document describes the actual controls and code. The public website supports Hebrew and English, dark/medium/light themes, keyboard navigation, reduced motion and 320px phones. Public and protected management interfaces share motion behavior; their palettes remain separate.

## CEO operating guide

Open `/en/admin/settings#settings-animation` or `/he/admin/settings#settings-animation` as an active CEO. Admins can read this section but cannot save.

- **Master animation switch:** turns presentation motion on/off throughout the public website and management console. All individual choices remain saved for the next time motion is enabled.
- **Individual switches:** each effect has an English/Hebrew note connected to its accessible name with `aria-describedby`. Disabling an effect never disables navigation, loading/error labels, submission locks, validation or keyboard/focus behavior.
- **Timing:** durations are milliseconds, bounded in both the API and database. A navigation duration controls completion/fade speed, not how long requests take. Placeholder timing controls its pulse cycle, not a waiting period.
- **Styles:** choose radial/fade for theme changes, lift/fade for page reveals, and standard/snappy/soft easing.
- **Save:** changes are a draft until saved. Successful saves update this window and other open same-origin tabs using BroadcastChannel. Other devices get the new settings when they reload. Layout caches are invalidated on save.
- **Recovery:** failed saves keep the draft. Retry saves it again. A revision conflict requires reviewing/reloading the saved version before another save; the interface explicitly identifies actions that discard a draft. “Use defaults in draft” still requires Save.
- **Appearance backup:** Version 1 preserves the configuration before the expanded component design pass. Version 2 activates the new component refinements. Prepare a Version 1 restore, review the draft, then Save to apply. This restores presentation choices; it does not roll back catalog entries, stock, enquiries, finance or uploaded storefront design content. A visitor’s personal dark/medium/light selection remains their own persisted preference.

Reduced-motion preferences always take priority over the CEO’s motion switches. Structured placeholders and useful loading text remain visible when motion is off.

## Architecture and settings security

`src/lib/animation-settings.ts` is the pure validated contract. `src/lib/motion.ts` converts it to HTML data attributes and CSS custom properties. The locale server layout reads the anonymous-safe public settings projection alongside storefront design, emits the settings on `<html>` for the first paint, and mounts `AnimationProvider`. No authentication data is stored in the public motion contract.

`AnimationProvider` exposes settings to small client islands, updates root attributes/tokens after an authorized save, listens for same-origin tab broadcasts, and cancels theme effects when reduced motion or switches disable them. It does not poll the database on every render.

The database settings table remains private. `get_public_animation_settings` explicitly projects the presentation fields. Protected GET returns configuration, its revision and editability. PUT requires an active CEO, same-origin access, a strictly validated complete settings object and the current revision. `update_animation_settings` repeats role authorization inside SQL, locks the row, rejects stale versions with `PT409`, advances the revision and audits the old/new values in the same transaction. The generic settings setter cannot bypass the dedicated animation save.

Version 1 is separately preserved as an immutable backup. The original theme layers remain in the repository; new component styles apply only when `data-appearance-version="2"`. This makes restoration executable, not just a screenshot of an old configuration.

The pre-hydration `ThemeBootstrap` still restores `miro-theme` from localStorage. Its server-rendered dark snapshot and suppressed root hydration warning avoid replacing the visitor’s theme during hydration. Motion does not delay this initial theme restoration.

## File map

| File                                                                                           | Purpose                                                                                   |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/lib/animation-settings.ts`                                                                | Settings schema, defaults, bilingual switch notes and timing bounds                       |
| `src/lib/animation-settings-server.ts`                                                         | Safe public RPC read and outage defaults                                                  |
| `src/lib/appearance-presets.ts`                                                                | Version 1 metadata, original public theme tokens and motion snapshot                      |
| `src/lib/motion.ts`                                                                            | Root attributes, CSS duration variables and easing curves                                 |
| `src/components/motion/animation-provider.tsx`                                                 | Shared runtime preferences, saved events and tab synchronization                          |
| `src/components/motion/theme-transition.ts`                                                    | Button-origin View Transition and coordinated icon feedback                               |
| `src/components/motion/motion-link.tsx`                                                        | Accepted Next.js Link navigation start, respecting cancellation/modifiers                 |
| `src/components/motion/use-motion-router.ts`                                                   | Imperative push/replace/back/forward feedback; refresh remains unchanged                  |
| `src/components/motion/navigation-events.ts`                                                   | Start/end events for programmatic navigation and errors                                   |
| `src/components/motion/navigation-progress.tsx`                                                | Integrated 2px navigation light and completion/cancellation lifecycle                     |
| `src/components/motion/page-reveal.tsx`                                                        | Incoming content reveal without remounting the shell or forms                             |
| `src/styles/motion.css`                                                                        | Central motion styling, existing-effect controls, fallbacks and reduced motion            |
| `src/app/[locale]/layout.tsx`                                                                  | Server preferences and persistent runtime installation                                    |
| `src/app/[locale]/error.tsx`                                                                   | Recoverable route error and progress termination                                          |
| `src/components/theme-bootstrap.tsx`                                                           | Existing pre-hydration personal theme restoration                                         |
| `src/components/layout/header-client.tsx`                                                      | Public desktop/phone theme buttons use the common helper                                  |
| `src/components/management/shell/management-topbar.tsx`                                        | Console theme buttons use the same helper                                                 |
| `src/components/management/animation-settings.tsx` and `.module.css`                           | CEO/admin settings and explained controls                                                 |
| `src/components/management/settings-panel.tsx`                                                 | Animation section/index integration and stable initial forms                              |
| `src/app/api/management/settings/animation/route.ts`                                           | Protected read/save, conflicts, validation and revalidation                               |
| `src/components/management/ui/icon-action.tsx`                                                 | Keeps caller descriptions alongside temporary tooltip descriptions                        |
| `src/components/management/ui/skeleton.tsx`                                                    | Shared line/list/table/row/form/dashboard placeholders                                    |
| `src/components/management/ui/skeleton.module.css`                                             | Placeholder geometry, desktop tables and optional phone cards                             |
| `src/components/management/ui/data-table.tsx`                                                  | Loading rows with real headers and one content/empty reveal                               |
| `src/features/catalog/catalog-skeleton.tsx`                                                    | Product cards, categories, details and published service grids                            |
| `src/features/cart/cart-skeleton.tsx`                                                          | Cart and checkout hydration geometry                                                      |
| `src/components/ui/reveal-image.tsx`                                                           | Decode-aware images, cached-image skip and stale/error settlement                         |
| `src/components/management/use-collection-page.ts`                                             | Bounded local collection rendering through the existing Pager                             |
| `src/features/store-design/store-hero-backdrop.tsx`                                            | Stops automatic background rotation when disabled/reduced/hidden                          |
| `src/features/store-design/company-rail.tsx`                                                   | Static accessible brands when decorative motion is off                                    |
| `src/features/catalog/product-moving-rail.tsx`                                                 | Static product rail when decorative motion is off; preserves preview pause                |
| `src/features/catalog/overflow-label.tsx` and `src/components/management/ui/overflow-text.tsx` | Display-only text motion, pause and still/wrapped fallback                                |
| `src/features/catalog/product-hover-preview.tsx`                                               | Existing stable portal, central exit duration and immediate disabled close                |
| `src/lib/store-data.ts`                                                                        | Request-scoped raw catalog/viewer/price reuse, parallel reads and indexed lookups         |
| `src/lib/public-services.ts`                                                                   | Request-scoped shared published-service reads                                             |
| `src/lib/supabase/public-server.ts`                                                            | Anonymous upstream requests use the existing 15-second bounded fetch                      |
| `src/app/api/management/sales/route.ts`                                                        | Parallel order/count reads, HEAD count without unused row payload                         |
| `src/app/api/management/inventory/route.ts`                                                    | Parallel movement-history/opening-balance reads                                           |
| `src/styles/customer-evolution.css`                                                            | Opt-in Version 2 public shapes, icons, comfortable light palette and layouts              |
| `src/styles/console-evolution.css`                                                             | Opt-in Version 2 console geometry and bright-mode reading surfaces; dark colors preserved |
| `src/styles/insights-refinement.css`                                                           | Analytics/finance insight presentation and responsive geometry                            |
| `supabase/migrations/20261002040000_animation_settings.sql`                                    | Dedicated config, public projection, strict validation, role/revision/audit save          |
| `supabase/tests/animation_settings.sql`                                                        | Isolated database permission, privacy, validation, conflict and audit checks              |
| `tests/motion.spec.ts`                                                                         | Real theme origin, persistence, reduced/fallback, switches and navigation regressions     |
| `tests/unit/animation-settings.test.mjs`                                                       | Contract defaults, independent switches, timing/privacy and isolated fallbacks            |
| `tests/unit/animation-data-performance.test.mjs`                                               | Query concurrency, request reuse and role/stock correctness                               |
| `tests/unit/reveal-image.test.mjs`                                                             | Decode/cache/error/stale/unmount correctness                                              |
| `scripts/verify-animation-settings.mjs`                                                        | Disposable role auth and fixture-only settings save/error/RTL/mobile QA                   |
| `scripts/verify-animation-performance.mjs`                                                     | Public Chromium lab comparison with JSON evidence                                         |

The complete created/modified path manifest is appended below. Existing components whose only change is importing `MotionLink` or the shared router retain their business logic.

## Animation catalog

| Effect / switch                   | Trigger and implementation                                                       | Default / easing                                    | Disabled, reduced motion and fallback                                                            |
| --------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Theme reveal / `themeReveal`      | Theme button → `transitionTheme`; root snapshot clip-path or opacity             | 420ms / selected curve                              | Direct theme change when disabled/reduced; uniform 160ms color fallback without View Transitions |
| Theme icon / `themeIcon`          | Selected button SVG Web Animation; small rotation/scale/opacity                  | 180ms / selected curve                              | Static icon, selection still updates                                                             |
| Navigation / `navigationProgress` | Accepted Link, imperative navigation, GET search or history → beam               | 180ms completion / selected curve                   | Beam hidden when disabled; steady readable state when reduced                                    |
| Page reveal / `pageReveal`        | Path/query commit → `.mgmt-shell__main` or `#main-content`                       | 220ms / selected curve; 6px lift or fade            | Instant when disabled/reduced; shell never remounts                                              |
| Loaded content / `contentReveal`  | Real table/report/region replaces initial placeholder → `.motion-content-reveal` | 160ms / selected curve                              | Direct content/empty/error result; no row staggering                                             |
| Placeholder / `skeletonShimmer`   | An actual dynamic region is loading → `.motion-skeleton` / `.mgmt-skeleton`      | 1400ms opacity pulse / ease-in-out                  | Geometry remains still when disabled/reduced                                                     |
| Image / `imageReveal`             | `load` then decode → `.motion-image[data-image-ready]`                           | 160ms / selected curve                              | Instant ready image when disabled/reduced; cached images skip fade                               |
| Dialog / `dialogs`                | Existing dialogs, drawers and preview portals open/close                         | 200ms entrance, 160ms preview exit / selected curve | Immediate panel state; focus trap, Escape, confirmation and hit-testing preserved                |
| Menu / `menus`                    | Account/category/mobile menu opens → `motion-menu-in`                            | 150ms / selected curve                              | Immediate when disabled/reduced; glass text is always opaque                                     |
| Button / `buttonFeedback`         | Existing presses, busy spinners and saved indication                             | 160ms / selected curve                              | Loading labels/disabled locks remain; decorative spinner/press movement stops                    |
| Micro / `microInteractions`       | Existing card/control hover and pressed states                                   | 150ms / selected curve                              | Colors/focus remain; movement removed from configured components                                 |
| Decorative / `ambientMotion`      | Background rotation, brand/product strips and existing decoration                | Store-design interval/speed, no duplicate clock     | Static still content; manual selection remains available                                         |
| Long label / `textRails`          | Measured clipped display text                                                    | Existing measured reading-speed linear loop         | Static wrapped text, single accessible copy; inputs never animate                                |

No new animation library is installed. Important operations do not wait for entrance animations before accepting input.

## Theme reveal implementation

1. Both public header and management topbar pass the clicked **button element**, not a hard-coded coordinate or pointer position, to `transitionTheme`.
2. `getBoundingClientRect()` provides viewport coordinates: center X = left + width/2, center Y = top + height/2. This works for keyboard activation and responsive layouts.
3. Radius = `hypot(max(x, viewportWidth - x), max(y, viewportHeight - y))`. The furthest horizontal/vertical corner distance ensures the expanding circle covers the entire visible screen.
4. `document.startViewTransition` snapshots the old view, executes the theme update callback, and snapshots the new view. Only the latest request ID can commit; skipped old transitions still execute their callback, so the ID guard prevents a rapid click reverting the chosen theme.
5. `applyTheme` sets `data-theme`, stores `miro-theme`, and dispatches the existing theme event. Root tokens update together. CSS temporarily disables ordinary element color transitions while the snapshots are created.
6. Both snapshots remain opaque with normal blending. The old snapshot sits below the new snapshot. A Web Animation clips **only the new snapshot** from `circle(0px at x y)` to its covering radius. The selected fade style uses opacity instead.
7. Promise rejection, hidden-document skips and unsupported pseudo-element animation settle cleanly. A synchronous API exception still applies the selected theme. Repeated clicks skip the prior snapshot; switching effects off/reduced motion skips an active theme transition.
8. Without the API, a consistent fast color transition updates the live DOM. Disabled/reduced motion updates directly. The first page paint uses ThemeBootstrap and does not animate.

Change the CEO’s Theme reveal duration or `DEFAULT_ANIMATION_SETTINGS.durations.theme` for future defaults; keep SQL/schema bounds synchronized. `--motion-theme-origin-x/y` expose the measured origin for QA, not configuration.

## Navigation lifecycle and page shell

`MotionLink` uses Next’s `onNavigate`, which fires only for accepted client navigation. Its wrapper propagates cancellation. Modifier clicks, downloads and external/new-window links do not start a beam. Plain internal anchors are observed after handlers can cancel them. The router wrapper begins imperative push/replace/back/forward; refresh retains existing operation feedback. GET forms include successful form fields in the destination comparison, so same-page search shows progress.

The progress component starts immediately at 12%, approaches 92% in short ticks while waiting, and completes when the pathname/query commits **and** initial region markers (`data-route-loading="true"`) have disappeared. A scoped MutationObserver watches child/loading-marker changes, without watching every style change or animation frame. Background refetches never start a route beam.

Back/forward starts from a capture-phase history listener before Next’s listener commits. Hash-only and same-route activity are ignored. Returning to the current route cancels a superseded pending destination. New navigation clears prior timers. Route errors/end events settle progress. A 20-second watchdog cancels a stalled indicator; it does not report request success. Unmount/pagehide clears timers.

Styling lives in `motion.css`: `--motion-beam-height` (2px), small glow, LTR/RTL transform origin, `--header-sticky-offset` for the public header and `--mgmt-topbar-height` for the console. The beam is fixed and pointer-transparent, so it occupies no layout space.

`PageReveal` animates the existing changing region with a short 6px lift/fade; it does not change children keys or remount unsaved forms, cart state, sidebar, header or dashboard providers. Initial route loading boundaries remain below persistent layouts.

## Skeletons, images and async outcomes

Shared placeholders use the final geometry, not arbitrary lines:

- `TableSkeleton`: actual column headings/widths, approximately real row heights, optional first-column media and reserved actions. The opt-in `mobileCards` version matches the existing phone cards for suppliers/inventory. Users/customers retain their real scrolling table geometry on phones.
- `TableSkeletonRows`: stays inside an existing DataTable header. Only the loaded tbody or empty region reveals; hundreds of rows never stagger.
- `FormSkeleton`: labeled field/input/button geometry for fetched settings, product editors and customer details.
- `DashboardSkeleton`: reserved metrics and chart structure for overview/finance/analytics/account.
- `ProductCardSkeleton` / `ProductGridSkeleton`: reserved media, category/title/price/action geometry.
- `CategoryPageSkeleton` / `ProductDetailSkeleton`: category hero or image-gallery/product-info structure.
- `ServiceGridSkeleton`: only the database service grid suspends; its static hero/navigation render immediately.
- `CartSkeleton`: existing cart/checkout headings, item image/text/quantity rows and summary; checkout has form geometry during local cart hydration.

There are route-specific loading boundaries under protected admin routes, account, category and product detail. Static auth/legal/marketing content receives no needless skeleton. Suppliers now begin with an actual loading state; server users failures reach an error/retry state rather than an empty list. Customer drawers open immediately with a form skeleton, and cancellation/stale guards keep a late earlier response from replacing the selected customer.

`RevealImage` keeps existing dimensions/aspect ratios/fill stages. Its callback runs parent load handlers synchronously (React’s `currentTarget` is transient), waits for decoding before exposing new pixels, detects already complete cached images, and ignores stale source/unmounted decode completions. Failed loads settle too; `ProductMedia` switches to the existing original illustration fallback. Error/empty content cannot leave an infinite skeleton.

## Motion tokens

| Variable                       | Default                       | CEO range                  |
| ------------------------------ | ----------------------------- | -------------------------- |
| `--motion-theme-duration`      | 420ms                         | 300–500ms                  |
| `--motion-icon-duration`       | 180ms                         | 150–220ms                  |
| `--motion-navigation-duration` | 180ms                         | 100–300ms                  |
| `--motion-page-duration`       | 220ms                         | 180–280ms                  |
| `--motion-content-duration`    | 160ms                         | 120–220ms                  |
| `--motion-skeleton-duration`   | 1400ms                        | 800–2400ms                 |
| `--motion-image-duration`      | 160ms                         | 120–220ms                  |
| `--motion-dialog-duration`     | 200ms                         | 120–300ms                  |
| `--motion-menu-duration`       | 150ms                         | 120–180ms                  |
| `--motion-button-duration`     | 160ms                         | 100–220ms                  |
| `--motion-micro-duration`      | 150ms                         | 100–220ms                  |
| `--motion-easing`              | `cubic-bezier(0.2,0.8,0.2,1)` | Standard/snappy/soft       |
| `--motion-beam-height`         | 2px                           | Developer styling constant |

Snappy = `cubic-bezier(0.16,1,0.3,1)`. Soft = `cubic-bezier(0.4,0,0.2,1)`. Header offsets and theme-origin variables are measured geometry, not timings. Rail distances/durations remain measured by the established store-design configuration, not copied into competing clocks.

## Actual performance work

- Catalog defaults, eight raw reads and role-price reads now start in parallel instead of three sequential batches. `React.cache` shares raw catalog reads within one server request between metadata/page calls; roles keep separate price maps. Anonymous/authenticated raw paths are distinct.
- Category/product/badge lookups use Maps instead of repeatedly scanning arrays. Saved products request only displayed fields and price overrides for saved IDs.
- Published service metadata and page content share their request-scoped read.
- Sales reads independent count/order data together; the count query is HEAD, removing unused count-row payload. Stock movement history and opening balances read together.
- Products/users/customers/suppliers and inventory bound rendered rows using the existing 25/50/100 Pager. Inventory keeps totals over its complete fetched collection, debounces search, and does not reload the independent summary for every keystroke/filter. Existing API page/caps remain; this does not claim server filtering for unlimited datasets.
- Anonymous upstream reads use the existing 15-second timeout, and settings browser operations have bounded requests/cancellation. Configuration outages retain usable safe defaults; settings edit loading fails explicitly.
- CSS/Web Animations target opacity/transform; the small theme reveal is the one intentional root clip-path. No global `will-change`, no heavy motion dependency and no per-row animation framework were added.

Public catalog still loads the active catalog as one collection. Very large catalogs need a separately designed server search/pagination contract. Current DOM bounding is useful but does not invent that contract.

`verify-animation-performance.mjs` compares fresh Chromium contexts against the prior release and this implementation. Its local LCP/CLS/event timing and bundle-transfer samples are lab evidence, not field Core Web Vitals certification or a causal claim about variable database/network latency.

## Adding future components

1. Keep data/authorization/business logic in the existing architecture. Use request-scoped memoization only where it cannot share private data across users.
2. Use `MotionLink` and the shared router for internal navigation. A custom navigation implementation must call `beginNavigation` before routing and `endNavigation` on a handled failure.
3. Put a `loading.tsx` or small Suspense fallback below the persistent shell. Match the final columns/media/actions with TableSkeleton, or the actual card/form geometry. Mark initial pending regions `data-route-loading="true"`; remove the region on **all** outcomes.
4. Use one `.motion-content-reveal` on the finished region. Avoid staggering large tables or hiding the entire site. Retain proper empty/error/retry states and mutation submission locks.
5. Use RevealImage inside an already dimensioned/aspect-ratio stage. Keep alt text, fallback images and meaningful dimensions/sizes; cached images should not replay a fade.
6. Reuse the relevant `--motion-*-duration` and `--motion-easing`. Connect every added effect to its existing feature switch. If a genuinely new motion category is needed, update the schema, SQL validator/public projection, CEO notes, defaults, tests and this catalog together.
7. New visual overrides belong in the Version 2 layers, so Version 1 can still restore the original palette/geometry. Preserve the console dark tokens and localize meaningful copy.
8. Check 320/390px phones, tablet/desktop, both locales, all themes, keyboard/Escape/focus, reduced motion, empty/error/slow network and safe mocked operations. Wait finite transitions before automated final-state contrast checks; separately assert menus keep readable opacity throughout their entrance.

## Verification and remaining owners

Completed command results and public lab metrics follow; the exact path manifest is at the end of this document. Existing catalog/brand/commercial approval, enquiry privacy/retention, manual bilingual screen-reader/device review, outbound notification delivery and future public tax synchronization remain with the owners listed in `docs/PROJECT_STATUS.md`. Animation/settings changes add no new visitor tracking or customer messaging.

### Completed verification

The source compiles with the locked Next.js 16.3.8 installation; no package/dependency change was needed. Both additive migrations are live following successful isolated SQL verification and exact linked dry runs.

| Command / scope                                                                                              | Result                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`, `npm run typecheck`, `npm run build`                                                         | Passed; production build generated 116 pages/routes                                                                                                                                             |
| `npm run format:check`, `git diff --check`                                                                   | Passed                                                                                                                                                                                          |
| `node --test tests/unit/*.test.mjs`                                                                          | 37/37 passed                                                                                                                                                                                    |
| `python3 scripts/verify-database.py`                                                                         | All 35 migrations and ten SQL suites passed                                                                                                                                                     |
| Production Playwright: motion, appearance, smoke, overlays, cart, merchandising, comprehensive catalog, auth | 93/93 passed; 15 motion tests and five appearance tests included                                                                                                                                |
| `ANIMATION_BASE_URL=http://127.0.0.1:3121 node scripts/verify-animation-settings.mjs`                        | 15 grouped checks, 18 bilingual/theme/desktop/320/390px layouts, zero axe/runtime failures; repeated on final build                                                                             |
| `DESIGN_BASE_URL=http://127.0.0.1:3121 node scripts/verify-design.mjs`                                       | 60 combinations across 320/390/768/1440/1920px, both locales/all themes; 14 axe scans, keyboard, zoom, reduced-motion, sorting/search/preview/contact interactions passed                       |
| `ADMIN_BASE_URL=http://127.0.0.1:3121 node scripts/verify-business-console.mjs`                              | 35 groups, protected live reads, all major management pages, dialogs, RTL/phone layouts and axe passed; final Version 1 shared-metric geometry and unchanged CEO Dark colors explicitly checked |
| `REPORTING_BASE_URL=http://127.0.0.1:3121 node scripts/verify-reporting-workspaces.mjs`                      | Protected live contracts plus synthetic populated Finance/Analytics/Requests interactions, bilingual three-theme layouts, focus/error/race handling and axe passed                              |

Checks used the real protected role boundary with disposable actors. Valid business saves used isolated browser responses; actual invalid/unauthorized writes confirmed API enforcement. SQL mutations run inside disposable PostgreSQL/rollback tests. Existing business records were not changed, and auth actors were deleted. Console screenshots stay under `/tmp`; public/reporting fixture screenshots were visually reviewed locally. Repository evidence is summarized in `docs/animation-system-evidence-2026-10-02/` without private screenshots or credentials.

The slow-route browser test preserves real Flight records and holds only the final page record. It sends all module/loading dependencies before that delayed record, regardless of production serialization order, and releases the data after verifying the real structured fallback. This tests actual streaming behavior rather than injecting a fake loading component.

### Public performance comparison

`PERFORMANCE_BEFORE_URL=http://127.0.0.1:3122 PERFORMANCE_AFTER_URL=http://127.0.0.1:3121 node scripts/verify-animation-performance.mjs` compared a detached build of release `ae00642` with the final implementation. Three fresh Chromium contexts per version, unthrottled local desktop `/en`, 1440×1000, starting Dark. Values are medians:

| Measured value                    |       Previous release |           Final implementation |
| --------------------------------- | ---------------------: | -----------------------------: |
| LCP                               |                  320ms |                          256ms |
| CLS                               |                0.00259 |                        0.00183 |
| TTFB                              |                239.4ms |                        168.7ms |
| Public JavaScript transferred     |          357,845 bytes |                  364,605 bytes |
| Public JavaScript decoded         |        1,284,443 bytes |                1,303,681 bytes |
| Loaded script resources           |                     15 |                             15 |
| Largest sampled interaction event |                   72ms |                           72ms |
| Click to theme state commit       | 0.2ms (instant switch) | 44.9ms (new snapshot prepared) |

These lab measurements cover the motion/analytics build before the account continuation; the continuation did not repeat the removed baseline benchmark. The additional public script transfer in that measured build is 6,760 bytes (about 6.6KiB / 1.9%), with no added library. The theme commit sample includes snapshot preparation; the configured 420ms reveal then finishes independently of business interactions. Missing measurements remain null instead of being represented as zero. LCP/TTFB improvements are observed lab samples with network/database jitter, not a guarantee or a causal attribution. Sampled event timing is **not field INP**. CLS stayed very low in both builds. Very large catalogs still require a separate server search/pagination contract; real-device and field CWV review remain follow-up QA.

### Evidence paths

- `docs/animation-system-evidence-2026-10-02/browser-checks.json`: 93 production browser cases and outcomes.
- `docs/animation-system-evidence-2026-10-02/settings-checks.json`: settings verification scope, role/save isolation and restore behavior.
- `docs/animation-system-evidence-2026-10-02/console-checks.json`: 35 management groups and sanitized protected-read contracts.
- `docs/animation-system-evidence-2026-10-02/reporting-checks.json`: live contract and fixture-report interaction evidence.
- `docs/animation-system-evidence-2026-10-02/design-checks.json`: layout/axe matrix and interaction scope.
- `docs/animation-system-evidence-2026-10-02/performance.json`: all six public lab samples and medians.

## Expanded component design and analytical knowledge

Version 2 applies separate public and console design layers. Public Light uses quiet warm off-white surfaces, charcoal text, dark gold for text/focus and gold for primary controls. Public Dark/Mid retain MIRO's black/charcoal/gold identity with calmer surface contrast. Framed icons, consistent button/card radii, reserved image stages, product pricing typography, responsive hero/category/gallery/cart/auth/service composition and centered phone groups share the same component language. Public palette rules exclude the management shell.

The console keeps its existing Dark palette. `console-evolution.css` changes shared shapes, icon geometry, heading/value scale, component spacing and centered content. Only console Light/Medium receive calmer neutral reading surfaces. Overlays use the same local management tokens as the shell; changing to the public website removes the console palette scope.

The analytics additions use existing data, with explicit definitions and genuine missing/error states:

- Recorded activity pace compares two equal **UTC-day chart windows**, names their exact dates, and explains boundary-day coverage. It does not claim an unprovided previous-period comparison.
- Search gaps show no-result event counts/share only when counts are consistent. Repeated searches count as events, not people.
- Contact-channel shares describe recorded CTA clicks, including ties and zero data. They do not imply completed calls, message contents or attributed enquiries.
- The activity map labels event, saved request and sales-order sources separately. It does not invent a customer funnel.
- Product review considers returned products with views and zero enquiry clicks, names the top-ten scope and links to the actual product editor. It does not claim a lost sale.
- Expandable definitions explain session identifiers, clicks versus database requests, daily aggregation and limited product/event coverage.
- Finance interpretation computes average order amount, units per order and gross margin from existing order totals. Previous-period comparison uses an actually returned previous period. Missing/zero denominators display unavailable values.

Additional implementation paths:

| File                                                               | Purpose                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/styles/appearance-v1.css`                                     | Immutable Version 1 public color/radius/shadow tokens, applied before hydration |
| `supabase/migrations/20261002050000_appearance_version_backup.sql` | Immutable backup, active appearance version and limited public projection       |
| `supabase/tests/appearance_version_backup.sql`                     | Backup/restore, privacy, immutability and audit checks                          |
| `src/lib/report-insights.ts`                                       | Pure interpretation of the existing event/order totals                          |
| `src/components/management/analytics-insights.tsx`                 | Bilingual activity/search/contact/source/product interpretation                 |
| `src/components/management/ui/insight-card.tsx`                    | Reusable centered insight cards, icon frames, definitions and actions           |
| `src/components/management/analytics-dashboard.tsx`                | Existing analytics with truthful event-ratio/top-ten scope and new insights     |
| `src/components/management/finance-dashboard.tsx`                  | Orders-backed financial interpretation with existing reporting controls         |

The new views collect no extra personal information and change no sales/accounting workflow.

## Complete change manifest

All paths below were created or modified for this task. Detailed central behavior is documented above; small link/router integrations preserve the existing business handlers.

| File                                                                      | Purpose                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                                               | Future-agent contracts for motion, restoration, privacy and analytics scope                                                    |
| `docs/ANIMATION_SYSTEM.md`                                                | Full operating guide, motion catalog, code map and verification                                                                |
| `docs/CUSTOMER_DESIGN.md`                                                 | CEO motion/restoration operating instructions alongside Store Design                                                           |
| `docs/DESIGN_SYSTEM.md`                                                   | Active Version 2 palette, icon/metric geometry and original-layer preservation                                                 |
| `docs/OPERATIONS.md`                                                      | Migration rollout, immutable backup and safe verification operations                                                           |
| `docs/PROJECT_STATUS.md`                                                  | Implementation milestones, check outcomes and launch owners                                                                    |
| `scripts/verify-animation-performance.mjs`                                | Public local Chromium before/after lab evidence                                                                                |
| `scripts/verify-animation-settings.mjs`                                   | Live disposable role checks and mocked business-save recovery/layout/restore QA                                                |
| `scripts/verify-business-console.mjs`                                     | Live readonly management QA, effective disabled-field assertions and output override                                           |
| `scripts/verify-design.mjs`                                               | Responsive theme/layout/keyboard/axe matrix using current root URLs, quote-only sorting and real preview/detail links          |
| `scripts/verify-reporting-workspaces.mjs`                                 | Live role/data reads, fixture interactions, bilingual layouts and all-theme axe; output override                               |
| `src/app/[locale]/(auth)/check-email/check-email-client.tsx`              | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(auth)/forgot-password/page.tsx`                        | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(auth)/login/page.tsx`                                  | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(auth)/reset-password/reset-password-client.tsx`        | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(auth)/signup/page.tsx`                                 | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(protected)/account/loading.tsx`                        | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/analytics/loading.tsx`                | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/audit/loading.tsx`                    | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/categories/loading.tsx`               | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/customers/loading.tsx`                | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/finance/loading.tsx`                  | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/inventory/loading.tsx`                | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/layout.tsx`                           | Management-only design and insight stylesheet installation                                                                     |
| `src/app/[locale]/(protected)/admin/loading.tsx`                          | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/products/[id]/loading.tsx`            | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/products/loading.tsx`                 | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/products/new/loading.tsx`             | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/requests/loading.tsx`                 | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/sales/loading.tsx`                    | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/services/loading.tsx`                 | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/settings/loading.tsx`                 | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/store-design/loading.tsx`             | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/storefront-merchandising/loading.tsx` | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/suppliers/loading.tsx`                | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/users/loading.tsx`                    | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(protected)/admin/users/page.tsx`                       | Preserves an initial server read failure for explicit retry                                                                    |
| `src/app/[locale]/(protected)/worker/page.tsx`                            | Management marker to retain the existing worker palette                                                                        |
| `src/app/[locale]/(public)/about/page.tsx`                                | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(public)/contact/page.tsx`                              | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(public)/home/page.tsx`                                 | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(public)/page.tsx`                                      | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(public)/services/[slug]/page.tsx`                      | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(public)/services/page.tsx`                             | Accepted internal navigation through MotionLink; Matched dynamic-region placeholders                                           |
| `src/app/[locale]/(public)/store/[category]/[slug]/loading.tsx`           | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(public)/store/[category]/[slug]/page.tsx`              | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/(public)/store/[category]/loading.tsx`                  | Route-specific dynamic content fallback below the persistent shell                                                             |
| `src/app/[locale]/(public)/store/[category]/page.tsx`                     | Accepted internal navigation through MotionLink                                                                                |
| `src/app/[locale]/error.tsx`                                              | Localized recoverable error and navigation progress termination                                                                |
| `src/app/[locale]/layout.tsx`                                             | Parallel server settings read, root preferences and persistent motion installation                                             |
| `src/app/api/management/inventory/route.ts`                               | Concurrent movement ledger and opening-balance reads                                                                           |
| `src/app/api/management/sales/route.ts`                                   | Concurrent count/order reads and payload-free HEAD count                                                                       |
| `src/app/api/management/settings/animation/route.ts`                      | Role/revision/same-origin validated reads/saves and layout invalidation                                                        |
| `src/app/design-system/page.tsx`                                          | Accepted internal navigation through MotionLink                                                                                |
| `src/components/account/account-dashboard.tsx`                            | Accepted internal navigation through MotionLink                                                                                |
| `src/components/account/account-forms.tsx`                                | Immediate imperative navigation feedback                                                                                       |
| `src/components/analytics/ProductDetailActions.tsx`                       | Accepted internal navigation through MotionLink                                                                                |
| `src/components/auth/live-auth-form.tsx`                                  | Immediate imperative navigation feedback                                                                                       |
| `src/components/auth/logout-button.tsx`                                   | Immediate imperative navigation feedback                                                                                       |
| `src/components/auth/private-closed-page.tsx`                             | Accepted internal navigation through MotionLink                                                                                |
| `src/components/layout/account-menu.tsx`                                  | Accepted internal navigation through MotionLink; Immediate imperative navigation feedback                                      |
| `src/components/layout/footer.tsx`                                        | Accepted internal navigation through MotionLink                                                                                |
| `src/components/layout/header-client.tsx`                                 | Accepted internal navigation through MotionLink; Immediate imperative navigation feedback                                      |
| `src/components/management/admin-nav.tsx`                                 | Accepted internal navigation through MotionLink                                                                                |
| `src/components/management/analytics-dashboard.copy.ts`                   | Localized truthful event/cohort terminology                                                                                    |
| `src/components/management/analytics-dashboard.module.css`                | Centered report metrics and loading geometry                                                                                   |
| `src/components/management/analytics-dashboard.tsx`                       | Preserved reports plus explicit event scope, insights and loading/failure states                                               |
| `src/components/management/analytics-insights.tsx`                        | Existing-data executive signals, sources, channel shares and definitions                                                       |
| `src/components/management/animation-settings.module.css`                 | Responsive note/switch/timing geometry                                                                                         |
| `src/components/management/animation-settings.tsx`                        | Explained bilingual controls, bounded drafts, save/retry/conflict and Version 1 restore                                        |
| `src/components/management/audit-history.tsx`                             | Matched dynamic-region placeholders                                                                                            |
| `src/components/management/categories/categories-manager.tsx`             | Matched dynamic-region placeholders                                                                                            |
| `src/components/management/ceo-settings.tsx`                              | Immediate imperative navigation feedback                                                                                       |
| `src/components/management/customers-manager.tsx`                         | Bounded table, region skeletons and stale-safe customer drawer loading                                                         |
| `src/components/management/finance-dashboard.tsx`                         | Preserved finance controls plus real-period order-backed ratios/loading                                                        |
| `src/components/management/inventory-manager.tsx`                         | Column/card placeholders, debounced search, independent totals and bounded DOM                                                 |
| `src/components/management/overview-panel.module.css`                     | Centered overview metric icon/content/footer layout                                                                            |
| `src/components/management/overview-panel.tsx`                            | Accepted internal navigation through MotionLink                                                                                |
| `src/components/management/product-editor/media-gallery.tsx`              | Decode-ready images; Matched dynamic-region placeholders                                                                       |
| `src/components/management/product-editor/new-product-form.tsx`           | Immediate imperative navigation feedback; Matched dynamic-region placeholders                                                  |
| `src/components/management/product-editor/product-editor.module.css`      | Token-based saved feedback and independent switch selectors                                                                    |
| `src/components/management/product-editor/product-editor.tsx`             | Accepted internal navigation through MotionLink; Immediate imperative navigation feedback; Matched dynamic-region placeholders |
| `src/components/management/product-management.tsx`                        | Matched initial table, bounded rows and shared route/image behavior                                                            |
| `src/components/management/products/ImagesManager.tsx`                    | Decode-ready images                                                                                                            |
| `src/components/management/requests/requests-queue.tsx`                   | Matched dynamic-region placeholders                                                                                            |
| `src/components/management/sales-history-view.tsx`                        | Matched dynamic-region placeholders                                                                                            |
| `src/components/management/sales-history.tsx`                             | Matched dynamic-region placeholders                                                                                            |
| `src/components/management/services/services-manager.tsx`                 | Matched dynamic-region placeholders                                                                                            |
| `src/components/management/settings-panel.tsx`                            | Stable shell, parallel initial section reads and independent pending/error regions                                             |
| `src/components/management/shell/management-shell.tsx`                    | Accepted internal navigation through MotionLink                                                                                |
| `src/components/management/shell/management-topbar.tsx`                   | Accepted internal navigation through MotionLink; Immediate imperative navigation feedback                                      |
| `src/components/management/shell/workspace-tools.tsx`                     | Accepted internal navigation through MotionLink                                                                                |
| `src/components/management/storefront/store-design.tsx`                   | Accepted internal navigation through MotionLink; Decode-ready images                                                           |
| `src/components/management/storefront/storefront-merchandising.tsx`       | Column placeholders, decode-ready previews and keyboard-scrollable preview rail                                                |
| `src/components/management/suppliers-manager.tsx`                         | Genuine initial loading, matched phone/table geometry and bounded rows                                                         |
| `src/components/management/ui/data-table.tsx`                             | Column-aware pending rows and a single finished tbody/empty reveal                                                             |
| `src/components/management/ui/icon-action.tsx`                            | Preserves explanatory aria-describedby alongside tooltip IDs                                                                   |
| `src/components/management/ui/index.ts`                                   | Shared primitive exports for the loading/insight integrations                                                                  |
| `src/components/management/ui/insight-card.tsx`                           | Reusable centered interpretation card with definitions/actions                                                                 |
| `src/components/management/ui/overflow-text.tsx`                          | Global measured display-text control, inputs remain static                                                                     |
| `src/components/management/ui/page-header.tsx`                            | Shared localized section/icon geometry                                                                                         |
| `src/components/management/ui/reporting-workspace.module.css`             | Shared header emblem and report shapes                                                                                         |
| `src/components/management/ui/reporting-workspace.tsx`                    | Section-specific icons for request, finance and analytics workspaces                                                           |
| `src/components/management/ui/skeleton.module.css`                        | Placeholder dimensions, columns and opt-in phone cards                                                                         |
| `src/components/management/ui/skeleton.tsx`                               | Reusable table, row, form, dashboard and list loading geometry                                                                 |
| `src/components/management/use-collection-page.ts`                        | Bounded 25/50/100 collection rendering through the existing Pager                                                              |
| `src/components/management/users-management.tsx`                          | Bounded visible table and explicit loading/error handling                                                                      |
| `src/components/motion/animation-provider.tsx`                            | Runtime settings, reduced-motion overrides and same-origin tab synchronization                                                 |
| `src/components/motion/motion-link.tsx`                                   | Accepted client link navigation feedback, respecting cancellation                                                              |
| `src/components/motion/navigation-events.ts`                              | Shared navigation start/end events                                                                                             |
| `src/components/motion/navigation-progress.tsx`                           | Route/region completion, rapid cancellation, history and stalled-navigation cleanup                                            |
| `src/components/motion/page-reveal.tsx`                                   | Content-only finite route reveal without remounting forms or shell                                                             |
| `src/components/motion/theme-transition.ts`                               | Actual button origin, snapshot reveal, icon feedback and safe fallback                                                         |
| `src/components/motion/use-motion-router.ts`                              | Immediate imperative route feedback, preserving refresh behavior                                                               |
| `src/components/products/ProductDetailInteractive.tsx`                    | Decode-ready images                                                                                                            |
| `src/components/products/ProductSubNav.tsx`                               | Accepted internal navigation through MotionLink; Decode-ready images                                                           |
| `src/components/public/experience-sections.tsx`                           | Accepted internal navigation through MotionLink                                                                                |
| `src/components/public/solution-detail.tsx`                               | Accepted internal navigation through MotionLink                                                                                |
| `src/components/requests/request-list.tsx`                                | Immediate imperative navigation feedback                                                                                       |
| `src/components/ui/reveal-image.tsx`                                      | Decoded/cached image reveal with source/error/unmount guards                                                                   |
| `src/features/cart/cart-page-client.tsx`                                  | Accepted internal navigation through MotionLink; Decode-ready images; Matched dynamic-region placeholders                      |
| `src/features/cart/cart-skeleton.tsx`                                     | Cart/checkout hydration stages with actual item/summary/form geometry                                                          |
| `src/features/cart/checkout-page-client.tsx`                              | Accepted internal navigation through MotionLink; Matched dynamic-region placeholders                                           |
| `src/features/cart/header-cart-link.tsx`                                  | Accepted internal navigation through MotionLink                                                                                |
| `src/features/catalog/catalog-skeleton.tsx`                               | Product card/grid/category/detail and published-service loading geometry                                                       |
| `src/features/catalog/overflow-label.tsx`                                 | Global long-label switch with static accessible fallback                                                                       |
| `src/features/catalog/product-card.tsx`                                   | Motion navigation, decoded media and honest unpublished-price metadata                                                         |
| `src/features/catalog/product-hover-preview.tsx`                          | Central dialog exit timing with preserved portal focus/hover lifecycle                                                         |
| `src/features/catalog/product-media.tsx`                                  | Decode-ready images                                                                                                            |
| `src/features/catalog/product-moving-rail.tsx`                            | Global decorative-motion control without losing preview pause                                                                  |
| `src/features/catalog/store-live-refresh.tsx`                             | Immediate imperative navigation feedback                                                                                       |
| `src/features/store-design/company-rail.tsx`                              | Global ambient control, keyboard-accessible static scrolling and focus pause                                                   |
| `src/features/store-design/store-hero-backdrop.tsx`                       | Global background-motion control and pause/hidden/reduced lifecycle                                                            |
| `src/lib/animation-settings-server.ts`                                    | Limited public projection read with safe outage defaults                                                                       |
| `src/lib/animation-settings.ts`                                           | Strict contract, defaults, bilingual effect notes and timing bounds                                                            |
| `src/lib/appearance-presets.ts`                                           | Immutable Version 1 motion/theme snapshot and validated backup metadata                                                        |
| `src/lib/motion.ts`                                                       | Root attributes, duration variables and easing curves                                                                          |
| `src/lib/public-services.ts`                                              | Request-scoped published-service reuse between metadata and pages                                                              |
| `src/lib/report-insights.ts`                                              | Pure UTC-window, search/channel and signed finance interpretation                                                              |
| `src/lib/store-data.ts`                                                   | Parallel/request-scoped catalog reads and role-safe indexed lookups                                                            |
| `src/lib/supabase/public-server.ts`                                       | Bounded anonymous upstream fetches                                                                                             |
| `src/styles/appearance-v1.css`                                            | Original effective public tokens for immediate Version 1 restoration                                                           |
| `src/styles/console-evolution.css`                                        | Version 2 management geometry and readable bright palettes; Dark unchanged                                                     |
| `src/styles/customer-evolution.css`                                       | Version 2 public palette, shapes, icons, responsive geometry and stock contrast                                                |
| `src/styles/insights-refinement.css`                                      | Responsive interpretation cards, channel shares and source maps                                                                |
| `src/styles/motion.css`                                                   | Central effect selectors, tokens, fallback, keyboard rail pause and reduced motion                                             |
| `supabase/migrations/20261002040000_animation_settings.sql`               | Additive config, public projection and strict actor/revision/audit transaction                                                 |
| `supabase/migrations/20261002050000_appearance_version_backup.sql`        | Protected immutable backup and active appearance-version contract                                                              |
| `supabase/tests/animation_settings.sql`                                   | Permission, projection privacy, validation, conflict and atomic audit checks                                                   |
| `supabase/tests/appearance_version_backup.sql`                            | Snapshot immutability including service role, restore/re-enable and business-data preservation                                 |
| `tests/customer-evolution.spec.ts`                                        | Version 1 restoration, management Dark exclusion and phone/light contrast regressions                                          |
| `tests/motion.spec.ts`                                                    | Origin/rapid/persistence/fallback/reduced settings and navigation lifecycle regressions                                        |
| `tests/store-cart.spec.ts`                                                | Final-state accessibility after real pending content/finite transitions settle                                                 |
| `tests/unit/animation-data-performance.test.mjs`                          | Concurrent reads, request reuse, price/role isolation and stock semantics                                                      |
| `tests/unit/animation-settings.test.mjs`                                  | Schema bounds/privacy, every feature, immutable preset and fallback isolation                                                  |
| `tests/unit/report-insights.test.mjs`                                     | Honest windows, missing/zero baselines, search consistency and channel/finance arithmetic                                      |
| `tests/unit/reveal-image.test.mjs`                                        | Decode/cache/source/error/unmount correctness                                                                                  |
| `docs/animation-system-evidence-2026-10-02/browser-checks.json`           | Sanitized verification evidence for this task                                                                                  |
| `docs/animation-system-evidence-2026-10-02/console-checks.json`           | Sanitized verification evidence for this task                                                                                  |
| `docs/animation-system-evidence-2026-10-02/design-checks.json`            | Sanitized verification evidence for this task                                                                                  |
| `docs/animation-system-evidence-2026-10-02/performance.json`              | Sanitized verification evidence for this task                                                                                  |
| `docs/animation-system-evidence-2026-10-02/reporting-checks.json`         | Sanitized verification evidence for this task                                                                                  |
| `docs/animation-system-evidence-2026-10-02/settings-checks.json`          | Sanitized verification evidence for this task                                                                                  |

## Account continuation and additional browser engines — 2026-10-02

The account dashboard uses the same image, text-rail, button and global motion controls. Its Version 2 icon frames/card geometry use the existing appearance switch, and Version 1 retains the safety improvements (honest failures, bounded data, localization and phone fitting). The restore control changes appearance and motion, not account data or business behavior.

Account history and canonical saved reads start together. History and saves are limited to the latest ten source entries; saved entries are further filtered by existing active/visibility rules. `getSavedProductsWithCanonicalData` returns `null` on failed reads, including role-price and category failures, and an array for a successful read. Never coerce `null` into a misleading empty account. Role-price reads remain scoped to the viewer and the saved IDs. Forms keep independent statuses, abort on unmount, prevent duplicate in-flight submissions and never automatically retry an uncertain write.

Additional production checks can be run with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3121 PLAYWRIGHT_REUSE=1 npx playwright test --config=playwright.cross-browser.config.ts`. Install the optional engines with `npx playwright install firefox webkit`. This checks native motion/backup/contrast behavior in Firefox, desktop WebKit and WebKit with an iPhone device profile; physical iPhone and screen-reader sign-off remain separate owner actions.

Additional continuation files:

- `playwright.cross-browser.config.ts`
- `src/components/account/remove-saved-button.tsx`
- `src/lib/account-presentation.ts`
- `tests/unit/account-presentation.test.mjs`

The indicator exposes `data-ready="true"` after its own listeners are installed; browser checks must wait for this as well as provider readiness before synthetic navigation events. The navigation beam also waits for actual elements in `#main-content`: WebKit can commit a URL while the route consists only of React boundary comments. Its listener lifetime depends on the beam's enabled state and duration, so equivalent server settings or unrelated motion updates do not cancel an in-flight trip. The slow-route fixture aborts speculative category prefetches, delays only the real page record and leaves real loading-boundary records available; it does not inject a skeleton.

Account verification: `ACCOUNT_BASE_URL=http://127.0.0.1:3121 node scripts/verify-account-experience.mjs`. The script uses a disposable customer and its own saved record, mocks every profile/request submission, and cleans up auth/saved data in `finally`. It covers 18 bilingual/theme/screen-size layouts, automated accessibility, canonical product links, independent statuses, duplicate submit prevention, preserved drafts and retryable removal with keyboard focus recovery. `ACCOUNT_OUTPUT_DIR` selects an output directory; screenshots contain only disposable test identity data and stay outside this repository.

- `scripts/verify-account-experience.mjs`
- `tests/unit/account-dashboard.test.mjs`

### Completed continuation verification

The final production matrix passed **80/80**, without retries or flakes: 20 motion/appearance cases in each of Chromium, Firefox, desktop WebKit and WebKit with an iPhone profile. Eight focused repeated slow-category checks also passed after fixing the indicator lifetime and streamed-content settlement. The account script passed seven groups including **18** locale/theme/320/390/1440 layouts with zero overflow, axe violations or runtime errors, preserved form drafts, canonical product links and removal focus recovery. Lint, typecheck, build, formatting, diff checks and **44/44** unit cases passed. Real-device/screen-reader and business/legal/privacy sign-off remain owner actions. No deployment was performed.

- `docs/animation-system-evidence-2026-10-02/cross-browser-checks.json`: final four-profile production motion/appearance cases, without private auth data.
- `docs/animation-system-evidence-2026-10-02/account-checks.json`: sanitized account layout/interaction results; no actual test identity or product IDs.
