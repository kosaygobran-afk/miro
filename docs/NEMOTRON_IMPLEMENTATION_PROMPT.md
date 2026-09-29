/# MIRO website and management console — implementation prompt

Copy this entire document into the implementing agent. Prepared from a repository review on 2026-09-28. This is an implementation assignment, not permission to deploy or alter production data.

## 1. Your mission and working rules

You are the lead implementation agent for MIRO. Repair the website with particular emphasis on the shared CEO/admin console: overlapping components, conflicting styles, inconsistent page composition, broken settings behavior, and recurring runtime errors. Work through the phases below and deliver tested code, screenshots, and an accurate handoff. Do not stop after generating another plan.

Use sub-agents running the SAME Nemotron model as your lead session, as requested by the owner. Use the runtime's actual configured model identifier; do not invent an API identifier from the owner's informal “Nemotron Ultra 550 A55B” name. If the runtime cannot spawn agents or enforce that model, disclose that limitation and execute the same assignments sequentially. Do not silently substitute models.

Repository: `/home/kusay/Desktop/Development/miro-website`.

1. Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`, `docs/ROUTES_AND_ROLES.md`, `docs/DATABASE_PLAN.md`, and the latest relevant entries in `docs/PROJECT_STATUS.md`. Status entries are not uniformly chronological and some describe code no longer present; verify against source.
2. Read the installed Next guides before modifying framework code: `node_modules/next/dist/docs/01-app/01-getting-started/{03-layouts-and-pages,10-error-handling,11-css}.md` and `01-app/02-guides/testing/playwright.md`. Follow this installed version, not remembered Next conventions.
3. Run `git status --short`; preserve unrelated work. Read closer `AGENTS.md` files if present. Do not reset the working tree, re-scaffold the app, replace the framework, or rewrite the visual identity.
4. Keep Hebrew RTL, English LTR, dark/medium/light themes, responsive layouts, reduced motion, and server authorization intact.
5. Use existing CSS Modules, semantic tokens, and management primitives. Do not install another UI framework to fix layout. Do not append a large override stylesheet, use arbitrary z-index inflation, or hide overflow to disguise broken widths.
6. No production migrations, real sales, stock changes, account promotions/deletions, tax changes, or live test-data insertion for this task without separate authorization for that environment. Use an isolated database/test accounts. Existing credentials do not by themselves make production mutation tests appropriate.
7. Never print `.env.local`, service keys, passwords, session cookies, recovery links, customer records, or unsanitized authenticated traces. No credentials in screenshots or reports.
8. After each meaningful change, update `docs/PROJECT_STATUS.md`: what, why, actual commands/results, blockers and owners. At milestones report newly relevant privacy/accessibility/legal issues and outstanding launch blockers. The lead owns final shared-doc edits to avoid worker conflicts.

## 2. Actual architecture to preserve

- Stack at review: Next 16.3.5 App Router, React 19.2.8, TypeScript, Tailwind 4, next-intl, Supabase, Zod, lucide-react, Playwright/axe. `package.json` version is 0.0.3.
- `src/app/[locale]/layout.tsx` owns HTML `lang`/`dir`, Heebo, theme bootstrap, public chrome and the outer `main#main-content`. It imports globals, premium, experience, storefront, and workspace CSS in that order. The admin layout imports management CSS separately.
- `src/components/layout/site-chrome.tsx` hides public header/footer on admin/worker paths. Do not create a second storefront header inside management or a second authentication system.
- Public routes are under `(public)`; auth under `(auth)`; account/worker/admin under `(protected)`. Parenthesized groups do not appear in URLs.
- CEO and admin use the SAME `/[locale]/admin` route tree. There is no separate current CEO dashboard to rebuild. `admin/layout.tsx` calls `requireRole(['admin','ceo'])` and passes verified identity to `ManagementShell`.
- Shell: `src/components/management/shell/{management-shell,management-topbar,account-menu}.tsx`, `shell/nav-config.ts`, and `admin-nav.tsx`.
- Shared primitives: `src/components/management/ui/`. Feature modules: product editor, categories, services, requests, overview, sales, inventory, suppliers, customers, finance, analytics, users, audit, settings and CEO security.
- `src/lib/auth.ts` resolves identity through Supabase `auth.getUser()`, `profiles`, and `user_roles`. `user_roles` is authoritative, not browser state or profile metadata. Inactive profiles fail closed.
- `src/lib/permissions.ts` defines capabilities. Admin can manage catalog/inventory/requests, record sales, and view finance/analytics/users. CEO additionally controls users, tax, and settings. Admin may view users/settings without obtaining mutation privileges.
- `/api/management/*` uses `_shared.ts` (`withManagementAuth`) for same-origin mutation checks and role capabilities. Sensitive writes use authenticated RPCs. Service-role reads must stay behind explicit authorization because they bypass RLS.
- `/api/ceo` handles sensitive CEO account actions with password verification. Preserve the verified-account requirement for adding CEOs and the last-active-CEO invariant.
- SQL migrations in `supabase/migrations`, tests in `supabase/tests`, generated types in `src/lib/supabase/database.types.ts`. Preserve audited atomic sale/stock/publishing/role operations; never replace them with browser writes or a sequence of non-atomic REST updates.
- Public catalog: `src/lib/store-data.ts`, `src/features/catalog/`, `src/components/products/`; services: `src/lib/service-content.ts`; contact: `contact-form.tsx` and `/api/enquiries`. Catalog is enquiry-oriented; do not add a fake checkout.

## 3. Evidence and limits of the preliminary review

The following were actually verified before this prompt was written:

- `npm run lint` passed, and `npm run typecheck` passed. This does NOT establish correct layout or correct API contracts.
- Anonymous Chromium visits against the existing localhost:3000 server at 1440×1000: `/en`, `/he`, `/en/store`, `/en/services`, `/en/contact` returned 200, had one main and one h1, no measured document-width overflow and no captured page exceptions.
- `/en/admin` and `/en/admin/settings` redirected to `/en/login`, correctly denying anonymous access.
- No authenticated console visual review, production build, full E2E suite, or database verification was completed for this planning task. Do not describe those as passed.
- Owner clarification: the recurring error has disappeared for now. Treat it as regression monitoring, not a blocker requiring an invented diagnosis. The owner specifically prioritizes Suppliers, every CEO/admin screen, and the end-to-end connections among database, backend, management, customers and workers. Earlier error text/instructions were not supplied.

### Confirmed source defects or discrepancies

**F1 — Settings/API contract mismatch.** `settings-panel.tsx` declares `TaxRate.is_current`, finds the current rate through `taxRates.find(t => t.is_current)`, and uses that flag for the row badge. `/api/management/tax/route.ts` returns `status: 'current' | 'scheduled' | 'historical'`, not a computed `is_current`. Align the consumer to the actual contract. This is a functional defect even when compilation succeeds because response JSON is untyped.

**F2 — Initial HTTP errors disappear.** The initial tax/settings effects call `response.json()` without checking `response.ok`. A JSON 403/500 can be treated as empty data/default settings. The separate retry functions do check status, creating inconsistent behavior. Repair both initial and retry paths through one shared loader per resource.

**F3 — Nested main landmarks and duplicate title ownership.** Locale layout emits `main#main-content`; `ManagementShell` emits another `main` inside it. `ManagementTopbar` emits h1 and `PageHeader` also emits h1. Pages using both have duplicate page titles. Repair semantics and visible hierarchy, not just font size.

**F4 — Conflicting sticky offsets.** Shell topbar is sticky at top 0 with z-index 40. Product editor `.stickyBar` is sticky at block-start 0 with z-index 20; `.sectionNav` uses a fixed 6.5rem offset. They do not share a height contract. On scroll the editor bar can move behind the topbar. Reproduce visually and eliminate the shared-top collision.

**F5 — Old shell rules still apply.** Admin layout combines `admin-shell mgmt-shell-root`. `workspace.css` still defines `.admin-shell` as a three-row grid intended for the old shell. It also sets minimum 44px width/height on every anchor/button/input/etc below `.admin-shell`. Those broad rules affect new breadcrumbs and icon controls. Trace winning declarations; do not assume all workspace CSS is obsolete because old feature panels still use it.

**F6 — Overlay lifecycle hazard.** `use-overlay-a11y.ts` effect depends on `onClose`. Callers such as `ConfirmationDialog` create a new handler each render. An open dialog rerender can clean up/reapply focus restoration and body scroll locking. Each overlay also independently owns a document Escape listener and saved body overflow. That does not coordinate simultaneous/nested overlays. The custom tax modal bypasses shared overlay behavior entirely.

**F7 — Missing token usage.** `FormField` and settings use Tailwind `text-destructive`, `bg-destructive/*`, and `border-destructive/*`. The active `@theme inline` declares `--color-error-text` but no `--color-destructive`. Confirm the generated CSS and computed error colors; use the existing semantic error token consistently or deliberately add a documented alias. Do not assume a utility class produces CSS simply because it appears in JSX.

**F8 — Settings UI lags available backend.** Settings API exposes `publicContact` and supports `public_contact`, but the current SettingsPanel has no public-contact section. A settings CSS Module exists without being imported by the current panel. Documentation describes newer settings work than the rendered component actually implements. Reconcile implemented functionality, not just the docs.

**F9 — CEO action concurrency.** `ceo-settings.tsx` uses one `busyAction` but disables only the matching form. Another security form can submit concurrently and overwrite the shared busy state. Guard all security submissions while one is pending, and preserve per-form results.

**F10 — Verification gaps.** `scripts/verify-admin-console.mjs` ignores `Failed to load chunk` in page/console errors, tests primarily English, has only `/he/admin` in the Hebrew list, and omits new categories/services/product-editor routes. It creates a live disposable admin with service-role credentials. HTTP 200 after a login redirect is not proof a protected screen loaded. Never run this against production just to obtain screenshots.

**F11 — Suppliers has missing styles and duplicated presentations.** `suppliers-manager.tsx` renders both “Desktop Table” (`suppliers-manager__table-wrapper`, `__table`, `__th`, etc.) and “Mobile Card View” (`__card-list`) without responsive utility guards. Repository search finds the table class names only in JSX, not CSS. `workspace.css` makes the card list `display:flex` without a breakpoint visibility switch. Both presentations therefore remain in the rendered flow; the table lacks its intended styling. Its modal is a custom div overlay without dialog semantics/focus trapping or an accessible close-button label. This is a concrete starting point for the owner's design complaint.

**F12 — Suppliers loses errors and dialog context.** Initial supplier load handles success and network exceptions but silently ignores non-OK HTTP responses. `error` is shared for load and mutation. When there are no suppliers, a failed create sets error and hits the early `if (error && suppliers.length === 0)` return, removing the open form and presenting a misleading load error. With existing suppliers, mutation errors may not be shown inside the open modal. Separate these states.

**F13 — Worker status contract drift.** SQL `update_service_request` permits assigned workers to set `in_progress`, `waiting_customer`, `closed`. `/api/account` Zod enum and `RequestList` omit `waiting_customer`. The worker select also substitutes `in_progress` for every current status except closed. The displayed selection is therefore not necessarily the stored state. Preserve current status and explicitly model allowed transitions.

**F14 — Saved-product representation is stale.** `account-dashboard.tsx` selects `products.image_url` and `products.price` directly for saved-product cards; product media is now managed through `product_images`, and storefront pricing has additional logic. Canonical management changes can diverge from the account's saved cards. Trace and reuse the public-safe product/media/price mapping, without leaking costs or privileged role prices.

**F15 — Customer detail masks partial backend failures.** `/api/management/customers` detail mode extracts only data from orders/requests/events/role queries and returns empty arrays on those failures. This can tell staff that there is no history when the database failed. Handle each query's errors and distinguish partial/unavailable from empty. Customer email search also checks only one `auth.admin.listUsers({perPage:1000})` page, so it is incomplete above that population; document and repair the search contract without unbounded per-request auth scans.

**F16 — Supplier mutation/audit separation.** Supplier API uses service-role CRUD followed by a separate audit insert whose error is not checked. DELETE also ignores errors from reference-count queries and treats null counts as zero. These are confirmed integrity/error-handling gaps, not a demonstrated production data loss. Repair with the database contracts and concurrency tests described below.

### Hypotheses requiring runtime evidence

- CSS chunk ordering or stale server/assets could explain a recurring chunk error, but this is unconfirmed.
- Database/app migration drift could cause a missing RPC or relation. Local files are newer than some rollout entries; that does not establish the linked database state.
- Shared radius tokens deserve inspection: active `@theme inline` includes self-references such as `--radius-sm: var(--radius-sm)`; legacy tokens.css contains concrete values but is not imported by the locale layout. Inspect emitted CSS and computed values before claiming a cyclic declaration actually wins. Restore concrete canonical values only where missing/broken.
- Long Hebrew labels, long names/email addresses/SKUs, small screens, sticky controls, and overlays still require authenticated measurements. No screenshot evidence of their exact failures was available in the preliminary review.

## 4. Sub-agent organization and sequencing

Lead owns coordination, integration, shell/global-style contracts, shared docs and final verification. Give each worker an explicit list of allowed files and an acceptance checklist. No two workers edit a shared file simultaneously. Send proposed shared primitive/API changes to the lead first.

Wave A can run concurrently:

1. **Runtime investigator:** reproduce the owner's error; inspect terminal/browser/network traces and migration/API contracts. Initially read-only. Return route, role, theme, viewport, exact sanitized error, trigger, suspected line, proof, and a minimal regression test proposal.
2. **Settings/CEO worker:** owns `settings-panel.tsx`, a dedicated settings copy/types module if needed, `settings-panel.module.css`, `ceo-settings.tsx`, settings page composition, focused settings tests. Repair F1/F2/F8/F9. Coordinate before touching shared API types/routes.
3. **Verification worker:** owns isolated management fixtures and management browser tests, plus `scripts/verify-admin-console.mjs` after reviewing its mutation behavior. Build reliable before/after evidence for both roles/locales. No production writes.

Lead repairs shell/overlay contracts F3–F7 while workers run. When this contract is stable, publish exact spacing, sticky-offset, portal, and title conventions to workers.

Wave B: reassign available same-model workers to disjoint feature groups: catalog/editor/categories/services; operational lists/sales/requests; public/auth regression review. Do not dispatch unlimited workers or let them independently redesign shared CSS.

Every worker returns: files changed, root cause, behavior change, commands/results, screenshots or test references, remaining uncertainty. The lead reviews diffs and integrates before declaring completion.

## 5. First reproduce the recurring error

Create a concise issue record in `docs/` or the status log. The owner says the old error is currently gone: do not repeatedly ask for an unavailable message and do not delay the known repairs. Keep diagnostic capture enabled; if it recurs, use the exact message and trigger. Otherwise report “previous intermittent error not reproduced” and the regression coverage performed.

1. Use the existing server only after identifying its mode and port. Do not kill an unrelated Next process or build into its active output directory. Use an owned checkout/output directory and port for a production comparison.
2. Capture browser `pageerror`, console errors, failed same-origin requests, route response status, server stack and the UI action immediately preceding the error. Sanitize credentials/customer data. Record a repeatable sequence, not a screenshot alone.
3. Verify authentication succeeded using final URL AND a management-specific landmark. A redirect ending in a 200 login page is a failure for an authenticated test.
4. If a chunk fails, record its URL and response body/status, navigation method and build identity. Test fresh browser context and hard reload, then client navigation. Establish whether it is a missing/stale asset, deployment mismatch or an actual import/module failure. Remove the blanket ignore from the verifier. Restart only your server; rebuilding its own output can be a diagnostic step, not the entire source fix.
5. If API returns 500, match that request to a sanitized server log. Verify method, Zod payload, capability, authenticated RPC identity, RPC argument names, migration version and returned shape. Check migration history read-only before proposing SQL. Never remove RLS, same-origin checks or a role guard to get a green response.
6. Pay attention to newer migrations: `20260927210000_product_update_rpc.sql`, `20260927220000_tax_requests_ratelimit.sql`, `20260927230000_services_media.sql`, `20260927240000_extend_product_whitelists.sql`. The tax route calls the four-argument `set_tax_rate` signature. Inspect the latest schema instead of assuming older handoff omissions are still current.
7. Add a regression test that fails on the demonstrated bug and passes after its repair. Keep unverified hypotheses labelled as hypotheses in the final report.

## 6. Shell and CSS repair instructions

### One layout owner, one page title

- The lowest-risk landmark repair is to retain locale layout's `main#main-content` and change the nested management `main` to a `div` with its existing class. Verify the skip link still focuses the intended content region. If a broader layout change is justified, keep exactly one main and a valid skip target per route.
- Make topbar title context plain text (`p` or `span`), leaving a feature PageHeader as the sole h1. Audit every admin route; add PageHeader where absent. Product detail h1 should identify the product, not repeat “Products”. Do not merely hide duplicated h1s with CSS.
- Add a consistent page stack inside `.mgmt-shell__main`: `min-inline-size: 0`, appropriate block gap, bounded padding. Wrap SettingsPanel and CeoSettings in that shared stack so separate sibling sections have intentional spacing.
- Remove the old `admin-shell` layout class from the new wrapper after migrating required focus/target rules to explicit controls/new scope. Search all `.admin-shell` uses first. Do not delete workspace.css wholesale.
- Give flex/grid content descendants `min-inline-size: 0` where they must shrink; use `minmax(0,1fr)` for flexible grid tracks. Let long names wrap or truncate with accessible full text. Do not shrink action hit areas to make a row fit.
- At small widths, wrap topbar actions deliberately. Keep navigation, account/logout, page identity and essential actions accessible. Both 1023px and 1024px must have usable navigation. Collapsed desktop preference must not collapse mobile content into an icon rail.

### Sticky contract

- Establish management-scoped CSS properties for layer ordering and measured sticky heights. Topbar at block-start 0; page action bar below its actual height; section navigation below both when both are sticky.
- Because Hebrew wrapping and zoom change height, use a ResizeObserver on the real topbar/bar with cleanup to set scoped height variables, or simplify smaller layouts by making secondary bars non-sticky. Do not guess one fixed pixel top offset for every viewport.
- Put `scroll-margin-block-start` on editor sections/focus targets to clear the actual sticky stack.
- Define a small documented layer scale: content < section sticky actions < shell topbar < popovers < modal overlays. Z-index only orders inside stacking contexts; trace ancestor transforms/filter/containment before changing it.
- Prove with scroll screenshots that Save, notices and section headings stay visible and clickable in both directions.

### CSS ownership and tokens

- Keep global brand tokens in the active root theme system, management primitives in management.css, feature rules in their existing CSS Modules. Audit unused legacy rules before removal.
- Inspect winning declarations in browser computed styles and generated production CSS. The installed Next guide explicitly warns development and production CSS order can differ.
- Test hard entry into admin and client-side storefront → admin → storefront navigation; lingering global styles must not change either interface.
- Replace unsupported destructive utilities with error-token equivalents; required/error labels must retain contrast in all three themes.
- Replace blanket anchor sizing with explicit button/nav/control targets. Breadcrumbs should have readable inline line-height rather than 44px minimum boxes. Preserve comfortable targets through padding and proper control components.
- Do not introduce another palette. Preserve black/charcoal/yellow and distinct medium/light modes. Theme and locale controls, if added to management, must reuse existing persistence/path behavior rather than a second theme store.

## 7. Overlay/component repair instructions

Files: `ui/drawer.tsx`, `ui/dialog.tsx`, `ui/use-overlay-a11y.ts`, management.css, tax modal and any custom feature modal.

1. Stabilize effect lifetime: opening/closing owns focus capture and scroll lock; updating callback identity must not teardown an open overlay. Keep current callbacks in a ref/effect event compatible with the installed React version, or memoize callers with correct dependencies. Do not suppress hook lint rules.
2. Coordinate the topmost overlay. Only it handles Escape/Tab. `stopPropagation()` alone does not stop another listener on the same document from running. Use an overlay stack or a shared registration mechanism.
3. Use reference-counted scroll locking with restoration only when the final overlay closes. Preserve the original body overflow. Cover nested dialog opened from a drawer, cancellation, unmount and navigation.
4. Render overlays into a stable body-level portal if necessary to escape feature clipping/stacking contexts. Portal creation must be hydration-safe, preserve theme/direction, and not access document on the server. Do not put the modal portal inside an inert background subtree.
5. Ensure background content cannot receive interaction while modal. Preserve/restores existing inert state if implementing inert; apply to appropriate siblings. Keep active overlay content accessible.
6. Focus enters a meaningful safe control; destructive confirmations should default to Cancel. Tab/Shift+Tab remain inside. Return focus to a connected opener, or a safe page fallback if it was removed. Zero-focusable case focuses the panel.
7. Dialog header/footer/body must fit short viewports with an internally scrollable content region, including landscape and software-keyboard cases. No offscreen close/save buttons.
8. Replace the hand-written settings tax modal (`fixed inset-0 z-50`) with shared Dialog/FormField. Remove duplicate document Escape handlers and manual competing focus restoration.
9. Localize every close/breadcrumb/control name. Add a breadcrumb label prop to PageHeader instead of its current hard-coded English `aria-label`.
10. Re-test typing into a dialog while validation/busy state updates: focus must not jump to the first control on every render.

## 8. Settings and CEO repairs at code level

### Tax data and HTTP handling

- Replace the local tax type's `is_current` with the actual fields (`status`, `valid_until`, `is_active` and the existing identifiers/name/rate/dates). Prefer a pure shared API-contract module; never import route handlers/server-only modules into client components.
- Current rate is `taxRates.find(row => row.status === 'current')`. Scheduled/historical badges use localized labels. Missing current coverage must say it is unavailable; do not display an invented 0% rate or silently select the first row.
- Keep date-only values date-only. API derives status for Asia/Jerusalem; do not recompute with browser UTC `toISOString()` and disagree around midnight. Audit overview day/month boundaries separately because its current server-local `new Date(year, month, day)` depends on hosting timezone.
- Refactor duplicate initial/retry fetch code into one loader per resource accepting AbortSignal. Check HTTP status, safely parse body, validate expected shape, then update success state. Aborts are not visible errors; genuine failures are.
- A failed load must not enable saving defaults over existing settings. Each section needs loading, loaded, empty, error, dirty and submitting states. A retry clears only its error and updates its own resource.
- Unexpected HTML/non-JSON errors should produce a localized generic message, not a JSON parser exception in the user interface. Log only sanitized diagnostic context server-side.
- Avoid `Promise.resolve().then(() => setLoading(false))` as a proxy for completed requests. Derive page readiness from real resource states; allow independent panels to load/fail independently.
- Use persistent errors and field validation. Success notices can dismiss; cancel/reset notice timers on replacement/unmount so an earlier timer does not hide a newer result.
- Add optional validity-end date if supported by the intended scheduling UI, preserving the API's null/date contract and date-order validation. Do not hard-code a statutory tax rate; this task concerns software behavior, not tax advice.

### Page composition and settings truthfulness

- Compose page header, current tax/schedule, public contact, inventory defaults, finance summary and CEO security as clearly spaced sections using existing FormSection/Notice/Table primitives.
- Public contact fields: phone, WhatsApp, email, address_he/address_en, hours_he/hours_en. Read `publicContact`; submit `public_contact` using the existing strict whitelist and partial-merge behavior. Omitted means unchanged; blank/null deliberately clears. Normalize/validate with existing contracts; never invent business facts.
- Admin sees readable values and an explicit localized read-only explanation; CEO sees mutation controls. Keep server checks even when controls are disabled.
- Check which inventory/finance settings are actually consumed by stock/sale/store code. Do not present currency or VAT-display choices as operational if they only store JSON and do not change accounting behavior. Make unsupported options read-only with clear explanation, or implement end-to-end in an explicitly reviewed scope. Preserve historical snapshots.
- Wire labels to input IDs using FormField. Keep numeric inputs editable without immediately coercing blank input to zero; validate before submission.
- Mount settings-panel.module.css intentionally or replace it with the correct active module. Do not leave a second unused design implementation that misleads future agents.

### CEO account security

- In `submit`, immediately return if an action is already pending; disable all four security forms' submit controls while `busyAction !== null`. Use a synchronous in-flight ref if needed to close rapid duplicate-event races. Release it in finally.
- Clear only the current action's obsolete notice, keep inputs on failure, reset only the successful form. Distinguish localized validation/auth/conflict/network failures without exposing raw server details.
- Keep password inputs `autoComplete` appropriate, no password persistence/logging. Preserve current-password verification and password match/length checks.
- Separate account deletion visually as a danger section; preserve typed DELETE, server-enforced self-only deletion and last-active-CEO checks. Do not run actual CEO deletion tests against the owner's account.
- A successful password/email/CEO operation must not be implied merely by fetch completion; require successful response and refresh relevant session/state appropriately.

## 9. Suppliers: first complete visual and data-flow repair

Use this screen as the first acceptance example, then apply its verified conventions to the other legacy screens. Files: `suppliers-manager.tsx`, relevant supplier rules in workspace.css, a new scoped `suppliers-manager.module.css` if needed, `/api/management/suppliers/route.ts`, supplier/variant SQL and tests.

1. Replace the nested card heading with PageHeader and one content surface. Add a simple toolbar only if its filters/search actually operate on the returned dataset. Clearly distinguish active/inactive suppliers.
2. Replace the unstyled table with shared DataTable: caption, scope=col headers, company/contact/phone/email/lead-time/currency/status/actions columns. Remove `role='grid'` unless implementing the full interactive-grid keyboard pattern; a semantic table is correct here.
3. Choose one responsive presentation deliberately. Recommended: table from 768px, compact labelled cards below 768px. Scoped `.desktop {display:none}` / `.mobile {display:grid}` with a single min-width media query reversing these is sufficient. Both may share data, but only one is displayed/focusable at a time. Alternatively use one accessible responsive table; never leave both visible accidentally.
4. Phone/email cells use `dir='ltr'` or `bdi`; company/contact/notes follow locale direction. Long email/company values wrap within minmax(0,1fr); numeric values remain legible. Cards use consistent label/value rows; actions wrap into a new row at 320px.
5. Replace create/edit overlay with Dialog, FormField, persistent form-level Notice, and consistent footer buttons. Close icon needs localized aria-label. Keep modal values and focus on failed save. Protect against closing or duplicate submission during an in-flight save.
6. Replace duplicated inline DELETE widgets in table and cards with one controlled confirmation dialog that names the supplier. Preserve typed confirmation if retained. Explain the real result: referenced supplier becomes inactive, unreferenced supplier may be removed. Confirm UI matches API response; do not always toast “deleted”.
7. Split `loadError`, `formError`, `deleteError`, and success notice. Do not return the entire feature's load-error screen because a mutation failed. Consolidate initial/retry loader and check HTTP status. Abort or ignore stale responses. Distinguish successful save plus failed list refresh from failed save, so users do not create duplicates.
8. Normalize company name by trim; reject blank; bound optional text lengths; use the supported currency contract; keep null and empty semantics consistent. Use strict input whitelists. Validate DELETE UUID and return not-found when appropriate. Map duplicate supplier to localized field feedback.
9. On the API, never proceed to deletion when reference lookup failed. Audit insert failure must not be silently ignored. Prefer a new audited transactional supplier RPC (authorized via active_app_role, fixed search_path, narrow grants), with mutation and audit in the same transaction. Preserve caller identity. Do not silently retrofit unrelated routes or rewrite deployed migrations; add a forward migration if required.
10. Review actual FK behavior for products/variants and concurrent linking while deletion runs. A check-then-delete outside one transaction is insufficient. Choose transactional locks/FK behavior that preserves supplier references/history; test concurrent reference creation, nonexistent IDs, inactive suppliers and reference-check failures. Use deactivation where history requires retention.
11. Variant selectors should normally offer active suppliers for new assignments, but preserve/display an existing inactive supplier reference when editing historical data. Saving another variant field must not silently clear its supplier. Verify reactivation behavior.
12. Acceptance screenshots: at least one active supplier, one inactive linked supplier, long Hebrew/English names, edit dialog, duplicate-name validation, delete/deactivation confirmation, loading/error/empty; both roles and locales, 320/768/1440px and all themes.

## 10. Trace complete workflows across roles and database

Do not equate functioning individual endpoints with a connected product. Produce a concise trace table in `docs/` containing UI action → endpoint → validation/capability → table/RPC → resulting reader screen → refresh/invalidation → permission test. Verify the following in an isolated seeded environment.

### A. Customer request → management queue → worker → customer

- Trace both entry points: account form POST `/api/account` action=request explicitly inserts `customer_id`; public contact POST `/api/enquiries` currently does not include customer_id. Determine actual schema defaults/triggers and authenticated behavior before changing it. If signed-in public enquiries should appear in account history, derive customer_id from the verified server session, never submitted email or browser ID. Guest enquiries remain unowned; do not attach them to an account merely because email strings match.
- Assert product/variant references are valid, mutually related and publicly eligible where required. Reject forged variant/product pairs; preserve fail-closed new/unassigned insertion. Carry locale/source correctly into management detail. Do not expose private product information in public validation messages.
- Management assignment uses canonical `assigned_to`. Worker assigned to request A can read/update A, cannot enumerate/read/update B, cannot reassign A, cannot mark spam/new, and cannot read customer orders/finance via management endpoints. Test API and direct authenticated database/RLS paths.
- Align worker UI and `/api/account` to allowed statuses including waiting_customer; show actual current state separately from proposed next action. Keep management's larger status set. Never change backend policy merely to match an obsolete select.
- `RequestDashboard` relies on RLS with no explicit assignee filter, and worker/page allows admin/CEO while passing manager=false. An admin has broader RLS visibility; the worker-mode UI sends worker:null, which the RPC interprets as clearing assignment for admin/CEO. This path can unintentionally unassign requests when privileged users use the worker page. Choose and document a safe policy: redirect privileged users to the management queue, or provide explicit role-aware worker-view filtering and status-only updates preserving assignment. Add a regression for it.
- Management PATCH currently reads assigned_to before the RPC when omitted. Another assignment can change between that read and write. Make status-only updates preserve assignment atomically inside the RPC (explicit patch semantics/assignment-changed flag), or use version checks with conflict feedback. Do not silently overwrite a concurrent assignment.
- After update, management/worker/customer readers show the saved status after refresh/navigation. Invalidate relevant server caches if used; do not add polling/realtime solely to mask stale local state. No promise of live notifications unless implemented.
- Audit records must describe final stored assignment/status. The current worker RPC audit uses incoming worker argument (null for workers), while the row preserves assigned_to; verify and correct this misleading audit detail in a forward migration if confirmed.

### B. Supplier → variant → inventory → sale → customer history

- Create isolated supplier, connect a variant, receive stock through stock RPC, record a sale to customer A. Confirm stock decreases exactly once and ledger links to the operation. Deactivation preserves existing links and history.
- Verify order.user_id is customer A and recorded_by is the staff actor. Customer A sees their order; customer B and unrelated worker do not. Guest sale is not claimed by an arbitrary matching email. Invoice creation/visibility must reflect actual implemented behavior; do not fabricate an invoice to fill the account UI.
- Preserve discount_per_unit, VAT, cost and price snapshots. Changing supplier cost/product price/tax later must not rewrite past sales or finance totals. Test insufficient stock and concurrent sale/adjustment without negative inventory.
- Account and management history must handle query failure separately from a genuine empty history. Repair customers detail's swallowed errors. Decide whether CRM intentionally includes staff purchasing accounts; its current list reads all profiles. Document the intended audience instead of silently filtering roles and losing valid buyers.

### C. Management catalog/services → storefront → saved products

- Edit bilingual product content, canonical images, variants, publication, category and public prices through management. Verify new reads on storefront index/category/detail and account saved cards use the same intended public values. Preserve role-specific price visibility; never return purchase cost or supplier private details to customers.
- Replace saved cards' deprecated products.image_url mapping with canonical lowest-sort_order product_images resolution and shared safe image handling. Resolve effective public price through an appropriate pure helper/shared server projection, not a client-only import. Unpublished/archived/RLS-hidden products must render an intentional unavailable/removable saved-item state, not crash or leak hidden data.
- Trace service CMS save → service list/detail and bilingual fallback. Identify any route still using hard-coded content and connect it only where the CMS contract supports it. Preserve explicit static solution pages where intended and document the distinction.
- After category deactivation or last-variant removal, publication invariants must hold across listings and deep links. Validate cache invalidation at the mutation boundary actually used by readers.

### D. CEO roles/settings → all audiences

- CEO role/status changes are reflected on the next authorized request; stale client navigation must not retain server privileges. Revalidate session/profile appropriately. Direct API requests must enforce the new role/status independently of navigation visibility.
- Public contact edits should appear where contact-config reads them; inspect documented environment overrides so the UI does not falsely imply a DB value wins over configured environment data. Empty values remove public contact affordances gracefully.
- Inventory defaults and finance settings need real consumers or explicit display-only status. Never imply stored currency is a conversion engine. Test tax scheduling and date boundaries with supplied business values in isolation.
- Privacy scope: customers see only their own records, workers only required assigned work details, admins only their capabilities, CEO controls remain server-enforced. Do not expose CRM search/email history to worker/customer roles. Search completeness and pagination must not depend on the first 1,000 auth accounts.

## 11. Feature-by-feature completion checklist

Inspect actual route and component imports before editing; migrate existing working behavior to the repaired primitives.

| Area                          | Files / behavior to inspect                                                 | Required outcome                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview                      | admin/page.tsx, overview-panel.tsx/module.css                               | Readable metric groups; errors distinct from zero; responsive cards; no duplicated headings; date windows consistent with intended business timezone.                                |
| Products                      | product-management.tsx; admin/products/new and [id]; product-editor/*       | List filters/actions fit; editor sidebar and Save stay usable; dirty guard preserves edits; validation scroll target visible; no unnecessary obsolete modal alongside routed editor. |
| Product media/variants/prices | media-gallery, variants-section, role-prices-section and corresponding APIs | Upload progress/errors, reorder/primary image, nested confirmation and keyboard focus work; no client-side service key; invalid publish surfaces actionable reasons.                 |
| Categories/services           | categories/_, services/_, visual-picker                                     | Scoped form/table styling, long bilingual names, empty/error states and confirmations; visual picker fits small screens.                                                             |
| Inventory/suppliers           | inventory-manager.tsx, suppliers-manager.tsx                                | Horizontal scrolling belongs to labelled table region; adjustments use atomic RPC; dialog validation and busy state prevent duplicates.                                              |
| Sales/history                 | sales-panel, sales-history*, sales.module.css                               | Form/line totals usable at narrow widths; customer and staff identities distinct; preserve discount_per_unit and immutable tax/cost snapshots; no duplicate sale on repeated click.  |
| Requests                      | requests/requests-queue, request-drawer                                     | Filters, assignment, statuses, detail drawer and autocomplete layer do not overlap incorrectly; preserve authorized transitions and assignment contract.                             |
| Customers/users               | customers-manager, users-management                                         | Long personal details fit and use bidirectional isolation; sensitive controls reflect permissions; admin remains read-only for user mutations.                                       |
| Analytics/finance/audit       | corresponding management panels                                             | Tables/charts have textual labels and truthful missing/error states; finance dates/totals respect existing semantics; audit remains read-only and visible to authorized admins.      |
| Public/auth/account/worker    | public route tree, auth forms, header/footer, account/worker                | Shared-style changes cause no regression; login/reset/logout, responsive navigation, themes, locales and enquiry paths remain functional.                                            |

For each row, exercise loading, successful data, empty data, failed load, failed mutation, pending mutation, very long content and small screen. Do not refactor unrelated business logic solely for visual consistency.

## 12. Verification implementation and acceptance criteria

Use isolated fixtures with representative admin and CEO sessions, a real published test product/variant and empty/long/error datasets. Browser request mocks are useful for deterministic UI states, but do not prove backend authorization; test the actual endpoints/database separately in isolation. Never add a production-visible auth bypass.

Repair the admin verifier:

- Remove blanket chunk-error ignores. Keep only narrowly justified external telemetry filtering.
- Assert final localized admin URL, management landmark and expected page identity.
- Include overview, products, new product, seeded product editor, categories, services, inventory, suppliers, sales, customers, analytics, finance, users, requests, audit, settings for BOTH locales.
- Register/remove listeners cleanly; collect console/page/network errors with the route that triggered them. Avoid global `networkidle` as the sole ready criterion; wait for the actual feature state.
- Explicitly report SKIPPED/BLOCKED for missing credentials/fixtures, not PASS. Require an explicit isolated target for a script that creates/deletes users and always clean up owned fixtures in finally.

Browser matrix:

- Shell overview/settings/product editor: admin and CEO × HE/EN × dark/medium/light × widths 320, 390, 768, 1024, 1440. Add 1023 breakpoint, short 667×375 landscape and 200% zoom checks for sticky/overlay screens.
- All remaining console routes: both locales at desktop and phone, with representative theme coverage; run additional themes wherever color-specific UI changes.
- Open mobile drawer, account menu, tax dialog, variant/media dialogs, request drawer and confirmation dialog. Test Escape, Tab, Shift+Tab, outside click where allowed, submit busy guard, opener focus restoration and navigation/unmount cleanup.
- Test direct route entry and client navigation in a production build, including storefront → management → storefront. Repeat shell/overlay regression cases in dev if the original error is dev-specific.
- Axe on representative authenticated screens, plus manual keyboard and screen-reader review where available. Passing axe alone is not accessibility certification.

Concrete assertions:

1. Exactly one main and one feature h1 per route; skip link reaches main.
2. No document horizontal overflow; also inspect child bounding boxes because root `overflow-x: clip` can conceal protruding content. Intentional table scrollers may overflow internally.
3. Sticky action bar bounds do not intersect topbar bounds after scrolling; Save/close buttons are inside viewport and hit-testable (for example through elementFromPoint), not merely `visible` in the DOM.
4. At 320px all essential actions remain reachable and labels remain readable; long Hebrew, email, SKU and numeric/currency content do not push controls offscreen.
5. While typing/rerendering an open dialog, focus stays in the intended input. Closing nested overlay leaves parent modal active and scroll locked; closing final overlay restores prior scroll/focus state.
6. Tax fixture `{status:'current'}` renders current; scheduled/historical distinct; missing current reports missing coverage; HTTP 403/500 does not become empty success; retry recovers; failed initial settings load cannot save placeholder defaults.
7. Admin mutation attempts for CEO settings/users/CEO actions are rejected by server; customer/worker/anonymous cannot access management data; active CEO succeeds only in isolated authorized tests.
8. No uncaught browser/server exceptions, hydration failures, failed chunks or unexplained same-origin 5xx during tested flows. Expected 4xx validation tests are asserted explicitly.

Run gates without competing builds/type-generation jobs:

```sh
npm run lint
npm run build
npm run typecheck
npm run format:check
```

The order above avoids typecheck/build races on generated `.next/types`. Own your production server/port. The current Playwright config defaults to localhost:3000 and starts `npm run build && npm run start`; changing only PLAYWRIGHT_BASE_URL does not automatically move the server port. Start a dedicated matching production server and use the existing reuse option, or deliberately fix the test config's port contract.

Run existing E2E tests (`npm run test:e2e`) and new management tests with isolated dependencies. Run `npx playwright test --config=playwright.recovery.config.ts` for the separate recovery fixture suite when auth/shared layout changes affect it. Run `DESIGN_BASE_URL=http://127.0.0.1:<owned-port> node scripts/verify-design.mjs` for public-style changes after checking the script's behavior. Run SQL regression tests through `scripts/verify-database.py` only against its disposable environment and only when relevant SQL/contracts change. Do not claim external-environment checks passed when unavailable.

Store before/after screenshots and a concise test matrix in a local artifact directory; sanitize identifying data. Do not commit bulky browser traces or secrets. Show at least the same settings/editor scene in Hebrew RTL and English LTR, desktop/phone, and all themes.

## 13. Final deliverable and stopping rule

Deliver working code plus:

1. Root cause and exact repair of any reproduced error; if the previous intermittent error stays absent, say it was not reproduced and report monitoring/regression results. Do not let an absent historical error block completion of verified repairs.
2. Short file-based explanation of shell/CSS, overlays, settings contracts and CEO security changes.
3. Actual check results and screenshot locations; separate passed, failed, skipped and unverified.
4. Updated `docs/PROJECT_STATUS.md`; update DESIGN_SYSTEM for the new management layout/sticky/overlay contracts and ROUTES_AND_ROLES for verified behavior only. Resolve stale claims carefully without deleting historical records.
5. Remaining owner actions: approved business contact/catalog facts; privacy/retention approval for customer/enquiry data; manual accessibility review; staging/live migration rollout only if demonstrated necessary and separately authorized.

Do not declare the console fixed because lint/build passed. Completion requires demonstrated layout and interaction behavior for both roles/locales, verified settings error handling, and truthful accounting for the owner's recurring error. Keep the existing premium brand and functional backend while repairing the actual causes.
