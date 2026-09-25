# Project Status

Last updated: 2026-09-25 (admin console design-DNA polish + full audit cycle complete)

## Admin Console Design-DNA Polish — 2026-09-25 (final)

Owner feedback: the newly built management area needed a real polish pass connected to the site's design DNA. Root cause found: the crashed Wave-3 shell agent never wrote the CSS — ~2,300 lines of referenced class families (admin-shell, overview-panel, inventory/suppliers/sales/customers/finance/analytics managers) were entirely unstyled.

What was done:

- Authored the full `src/styles/workspace.css` (562 → ~4,100 lines): sticky glass admin header with gold active-nav underline, stat-card vocabulary (--warning/--critical), tables→cards at ≤767px, drawers/modals/toasts, CSS bar charts (gross/net/views/searches), all token-based (no hardcoded hex outside color-mix(var())), logical RTL properties, 44px touch targets scoped to `.admin-shell`, focus-visible + reduced-motion + forced-colors support.
- New theme tokens in `globals.css`: `--badge-admin/worker/customer/suspended` per theme (dark/medium/light).
- Replaced hardcoded Tailwind badge utilities across management components with semantic `status-badge--*`/`role-badge--*` classes; added `<caption class="sr-only">` to every admin data table.
- Regressions caught by review + screenshots, fixed: unscoped global `button/input min-height:44px` rule (broke the 320px header); admin header wrapping incorrectly; mobile stats grid overflow.
- Verified visually with authenticated screenshots (light + dark + RTL mobile): gold-accented dark console matches the storefront DNA.

Final verification (all green): lint/typecheck/format:check/build; verify-database (17 migrations + 3 suites); admin-console smoke 14/14; e2e 16/16; recovery 20/20; design suite 60 combos + 14 axe scans.

## Full-Project Audit & Hardening — 2026-09-25 (later)

Method: two parallel independent auditors (security/backend/data + frontend/performance/quality/a11y), each verdict reviewed by hand before applying. No CRITICAL security holes found.

Fixes applied from the security audit:

- `hasSameOrigin` now prefers the proxy-forwarded host (`x-forwarded-host`) over the raw Host header (`src/lib/request-origin.ts`).
- `/api/auth/resend-reset` no longer proxies raw Supabase error messages (enumeration hygiene; generic localized message, server-side log).
- `mapPostgresError` no longer exposes raw Postgres error codes to clients (opaque `invalid_input` / `referenced_entity`).
- Products/categories DELETE default to soft-archive (`status='archived'` / `is_active=false`); hard delete only with `?hard=true`, and referenced products return 409 `product_has_history` instead of a misleading error.
- Logout fetch detection now keys on `content-type: application/json` only.
- Migration `20260925172000_analytics_grant_hygiene.sql`: revoked the noisy `SELECT` grant to `anon` on analytics_events (insert-only for anon now); test updated to assert permission denial (verified passing).

Fixes applied from the frontend audit:

- Removed duplicate mount-time fetch in `UsersManagement` (server already provides `initialUsers`).
- `ProductsClient` per-render category counts memoized; confirmed search filter already memoized (audit's remap kept URL-reload behavior intact via `key`).
- `ProductCard` product impressions now fire on real viewport intersection (IntersectionObserver, once per mount) instead of only on dialog open; dialog gained `aria-modal="true"`.
- Theme tokens: role/status badge colors in `workspace.css` moved to `--badge-*` / `--success-text` / `--error-text` tokens defined per theme in `globals.css` (dark/medium/light contrast-safe).
- Deleted dead code: `dashboard-link.tsx`, `management-console.tsx` (superseded by UsersManagement), `unavailable-auth-form.tsx`, `ProductSearch.tsx`. (`contact-preview-form.tsx` IS used by /contact — audit false positive; kept.)

Deferred deliberately (documented, not fixed now): `/api/track` rate limiting (post-launch WAF/edge rule; events are validated + bounded 200-char anon inserts), server-prefetch refactors for admin client islands, moving management inline strings into messages JSON, CSS gradient dedup in experience/storefront sheets, storefront checkout (out of scope by design).

Verification after fixes (all green): lint, typecheck, format:check, build; `python3 scripts/verify-database.py` (17 migrations + 3 test suites); admin console smoke 14/14 pages incl. RTL; e2e 16/16; recovery e2e 20/20; design suite 60 combos + 14 axe scans.

## Runtime Hardening & Admin Console Smoke — 2026-09-25 (later same day)

Owner-reported runtime crash on the admin layout surfaced a class of untested server-render errors (previous suites only cover public pages, and admin routes redirect to login for visitors).

Fixes:

- `AdminNav` called `useLocale()` without a `NextIntlClientProvider` in the admin shell → "No intl context found". Now uses its `locale` prop only.
- Admin overview page exported `privateMetadata()` (a function factory) as `metadata` instead of `generateMetadata` — invalid function-valued metadata caused a server RSC serialization crash (React #441 / `$$typeof undefined`) on `/admin` only. Fixed to `generateMetadata`.
- Overview page queried nonexistent columns (`product_variants.purchase_cost`; orders `total_amount`/`net_amount`/`vat_amount`) → joined product cost via FK join and corrected order columns (`total`, `net_total`, `vat_total`).
- Admin overview + audit routes joined `profiles` through an FK that points to `auth.users` → "Could not find a relationship" 500s. Both now merge names in memory via a separate profiles query.
- `service_role` was missing table grants on `products`, `categories`, `product_images` (management APIs use the service client) → 500 "permission denied". Migration `20260925171000_service_role_grants.sql` grants them (+ orders/order_items select). Applied live.
- Two seeded product images were dead Unsplash URLs (404 through `/_next/image`) — nulled/removed pending real product photography (data-level fix).
- `overview-panel` icons were emojis from an interrupted agent — replaced with lucide-react components (design-DNA compliance).
- NEW verification: `scripts/verify-admin-console.mjs` — drives a disposable real admin account through UI login and all 14 admin pages (EN + HE), asserting no page errors / console errors / bad responses, then deletes the account. Run: `node scripts/verify-admin-console.mjs` (requires a server at ADMIN_BASE_URL or :3105 and `.env.local`).

Verification (final tree): lint / typecheck / format:check / build pass; admin smoke 14/14 pages; e2e 16/16; recovery e2e 20/20; design suite 60 combos + 14 axe scans; `verify-database.py` all migrations + tests pass.

## Commerce, Inventory & Admin Platform — 2026-09-25

Owner brief: evolve MIRO from brochure+admin page into a synchronized business platform — one source of truth, CEO vs admin capability split, real inventory ledgers, sales snapshots, VAT config, first-party analytics, and public catalog driven by the same data.

### Database (migrations, all applied live via `npx supabase db push --linked`)

- `20260925140000_commerce_foundation.sql` — products: nullable price (NULL = "price not published", never 0), lifecycle `status` (draft/active/hidden/archived; trigger keeps legacy `is_active` in sync), brand/model/tags/specifications/warranty/SEO/sort_order/purchase_cost/recommended_price/sale_price/out_of_stock_policy( inherit|keep_visible_contact|keep_visible_restock|hide_from_public )/expected_restock_date/tracking_mode(none|serial|lot)/supplier_id. New tables: `suppliers`, `product_variants` (canonical sellable entity; sku/barcode UNIQUE; one default variant per product via partial unique index; backfilled default variant per existing product from inventory_count), `stock_movements` (append-only ledger, RESTRICT FK), `product_serial_units`, `tax_rates` (seeded 18% VAT from 2025-01-01), `business_settings`, `analytics_events` (anon+auth insert with validated whitelist, admin/ceo read), view `v_product_daily_metrics` (security_invoker, granted to authenticated+service_role). `orders`/`order_items` extended with VAT/cost/name/sku snapshot columns + source channel. RPCs: `record_stock_movement`, `adjust_stock`, `record_sale` (atomic order+items+stock decrement+VAT snapshot, advisory/row locks), `set_tax_rate` (CEO), `set_business_setting` (CEO), `current_tax_rate`. audit_events gained entity_type/entity_id.
- `20260925150000_publish_product.sql` — `publish_product`/`unpublish_product` RPCs; publishing validates names+category+≥1 active variant with SKU and barcode.
- `20260925160000_product_image_alt.sql` — bilingual alt text on product_images.
- `20260925161000_product_images_grant.sql` — anon SELECT grant for public galleries.
- `20260925170000_set_default_variant.sql` — atomic advisory-locked default-variant flip.
- DB tests: `supabase/tests/commerce_foundation.sql` (constraint/RLS/RPC/stock/sale/tax/analytics coverage).

### Backend (src/)

- `src/lib/permissions.ts` — explicit capability model (`can(role, capability)`); CEO: all; admin: manageCatalog/manageInventory/recordSale/viewAnalytics/viewFinance/viewUsers; **admin lacks manageUsers/manageTax/manageSettings** (owner requirement: CEO-only users control, tax, settings).
- `src/app/api/management/_shared.ts` — shared guard HOF (same-origin on mutations, getAuthContext, capability check, service client) + `mapPostgresError` (23505→409 duplicate_sku/duplicate_barcode, no raw PG leaks).
- New routes: `suppliers` CRUD (soft delete when referenced), `inventory` (variant list + search + low-stock filter + movement POST via RPC + adjust PATCH + `?variantId=` movement history), `variants` CRUD (never sets stock_qty), `sales` (record_sale + order history), `tax` + `settings` (CEO write guarded), `customers` (list with emails/last-seen + per-customer orders/service requests/analytics events — product vs service activity separate), `finance` (gross/net/VAT/COGS/profit/margin/discounts/inventory value+daily series, cancelled/refunded excluded from both revenue and COGS), `analytics` (totals incl. distinct sessions, per-product, per-search-term incl. no-result, per-category, daily series). Existing routes refactored onto the guard; products route writes `status` and uses the publish RPC (422 `publish_incomplete`); catalog mutations call revalidatePath for store pages.
- `src/app/api/track` — validated anonymous analytics ingestion (same-origin, zod whitelist, session via `miro_sid`, user_id attached when logged in). Client helper `src/components/analytics/track.ts` uses sendBeacon/fetch keepalive with JSON Blob; real events only: product_view/impression/search/search_no_result/category_view/contact/phone/whatsapp clicks.

### Public catalog sync

- `store-data.ts` reads live products+variants+images; effective price = role price → default variant override → base price (null = unpublished). Stock aggregated from variants; low/out states; `hide_from_public` with zero stock filtered out.
- Product card/dialog: unpublished-price message ('המחיר טרם עודכן. לקבלת מחיר ניתן ליצור איתנו קשר.'), out-of-stock policy badges/restock date, color variant chips, tracked CTAs.
- New SSR product detail page `store/[category]/[slug]` with gallery, variants, stock badge, SEO metadata, JSON-LD (price omitted when unpublished), 404 for draft/hidden/archived.

### Admin console (shared CEO/admin shell, capability-gated inside)

`src/app/[locale]/(protected)/admin/layout.tsx` + `admin-nav.tsx`: Overview, Products, Inventory, Suppliers, Sales, Customers, Analytics, Finance, Users, Requests, Audit, Settings. Overview = real metrics (status counts, stock, inventory value, sales day/week/month, recent audit/stock/analytics). Products = reworked tabbed editor (Basic/Content/Media/Variants/Pricing/Publishing) on `components/management/products/*`. Inventory = movements + adjustment + receiving + replenishment recommendations. Sales = record-sale (POS-style) + history. Customers = CRM list + detail. Analytics/Finance dashboards with date ranges, real data, CSS-bar charts, empty states. Settings = tax + business settings (CEO-only writes; admin read-only) + CeoSettings for CEO. Users/Requests/Audit reuse existing components.

### Architect review corrections after agent batches

- Fixed broken receive modal (quantity/cost swapped), missing submitAdjust/submitOut, JSX syntax errors, invalid generateMetadata export, lint `set-state-in-effect` violations (AbortController pattern), 7 GET routes created with `new Request("")` (500s) + wrong capabilities, guard changed to enforce same-origin only on mutations (browser same-origin GETs send no Origin), store-data `product_images.url`→`image_url` (fell back to mock data → 400 images), sales RPC camelCase→snake_case item mapping (would have made every sale fail), default-variant race via new RPC, analytics unique-sessions count, effective-price precedence (default variant), JSON-LD null-price handling, `set_default_variant` wiring, mock Variant type (`isDefault?`).

### Verification (all green on final state)

`npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`; `python3 scripts/verify-database.py` (12 migrations + 3 test suites PASS); e2e 16/16; recovery e2e 20/20; design suite 60 combos + 14 axe scans; route probes (anon 403 on management APIs, 403 on cross-origin POST, 200 track, 404 unknown product slug).

### Deferred with reasons

- Supabase Storage image uploads: still URL-based (no buckets exist); UI supports alt text/reorder. Owner decision needed to introduce Storage.
- Serial-number management UI: `product_serial_units` table + states exist; no UI yet (track for serial products first needs receiving integration).
- CSV exports, stock-aging dashboard, per-product analytics drill page: schema/aggregates support them; deferred to keep this increment verifiable.
- Storefront checkout: intentionally absent (no fake cart events); sales are recorded from the management console. Old `carts` tables remain for a future real checkout.
- `orders` storefront INSERT RLS stays service-role-only (as hardened 2026-09-21).

### Legal / privacy notes

- First-party analytics store a random session id (no fingerprinting); authenticated events may carry user_id for business history. Privacy policy text must cover this collection before public launch (owner/legal).
- Finance dashboard is a managerial view — UI carries a bilingual disclaimer it is not an accounting ledger. VAT 18% seeded as configuration, CEO-changeable; historical sales keep their own rate snapshots.

### Owner actions

- Sign up with `kosay.gobran@gmail.com`, verify email, re-run `npx supabase db push --linked` (bootstrap migration grants CEO), then change password and add real suppliers/products/prices/stock.
- Manually exercise: publish a product (validation on missing SKU/barcode), receive stock, record a sale, check finance/analytics dashboards after a day of real traffic.
- Before launch: legal/privacy approval, real catalog content and photography, manual accessibility review of the new admin screens.

## CEO/Admin Control Plane — 2026-09-24

Owner request: a real CEO/admin interface distinct from the customer view, a visible logout button, a well-designed menu switch for CEO/admin, CEO as the only account that manages the users list (admin read-only for now), CEO-only user deletion, and `kosay.gobran@gmail.com` as the initial CEO.

What changed and why:

- **Header account menu**: new `src/components/layout/account-menu.tsx` replaces the weak account icon link. Signed-out users get the sign-in link; signed-in users get a premium dropdown (name, role badge, primary role-switch button — Management console for ceo/admin, worker area for worker, my account for customer — a "Switch to storefront" link and a visible Log out action). Keyboard accessible (Escape closes, focus returns, outside-click closes) and mirrored in the mobile drawer. Styles: new `.premium-account-menu*` section in `src/styles/premium.css` using theme tokens only (works in dark/medium/light, RTL-safe).
- **Session + logout APIs**: `GET /api/auth/session` now returns `{ authenticated, role, name }` for the menu; `POST /api/auth/logout` returns JSON 200 for fetch requests (form POST still gets a 303 redirect).
- **CEO-only user management**: migration `supabase/migrations/20260924120000_ceo_user_controls.sql` redefines `manage_account` so ALL role/status changes require an active CEO (admin is now read-only on the users list, per owner decision) and adds `delete_user_account(target)` — CEO-only, refuses self and any CEO account (CEOs only leave via the audited `delete_own_ceo_account` flow that preserves ≥1 active CEO), writes an `account_deleted` audit row. Applied to the live database via `npx supabase db push --linked`.
- **User deletion endpoint**: `DELETE /api/management/users` (CEO-only, same-origin, RPC first then `auth.admin.deleteUser` for auth cleanup). `PATCH` now returns 403 for admins; `GET` stays available to admin+CEO.
- **Admin console UI**: `src/components/management/users-management.tsx` (new) lists every account with email/name/role badge/status; CEOs get per-row role select, suspend/activate, and a two-step type-`DELETE` removal; admins see the identical list with a "View only" badge and no controls. The admin page (`src/app/[locale]/(protected)/admin/page.tsx`) gained a console header with role badge, "Switch to storefront" link and a working Log out form, plus the emails are merged server-side via the service role (`profiles` has no email column).
- **Initial CEO bootstrap**: migration `supabase/migrations/20260924130000_bootstrap_ceo.sql` idempotently promotes `kosay.gobran@gmail.com` to CEO when the account exists (no-op with notice otherwise — the owner must sign up first, then re-run the migration or an existing CEO uses `add_ceo`). Nothing else grants the CEO role. Applied live. Verified read-only by `scripts/verify-bootstrap-ceo.py` (all six CEO/user functions present in the live DB; bootstrap pending owner signup).
- Fixes during architect review: `manage_account` replacement keeps the `(uuid,text,text)` signature, so no function overload was left with old privileges; the users list merges emails from `auth.admin.listUsers` because `profiles` has no email column; the delete-confirm flow was rewritten (stale-state bug made deletion unreachable); the admin logout form posts to `/api/auth/logout?locale=…`; `roleBadge` uses `t.raw` (client-side `{role}` substitution); the quote CTA now hides at `max-width: 1199px` (it overflowed the header at 768px/200% text zoom); added missing trailing newline and i18n keys `layout.header.actions.{logout,switchToStorefront,manageAccount,workerArea,adminConsole,myAccount,userMenu,roleBadge}` (en+he). `playwright.config.ts` gained opt-in `PLAYWRIGHT_REUSE` so tests can run against an already-running server when port 3000 is occupied.

Verification (all passed on the final deliverable):

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`.
- `PLAYWRIGHT_REUSE=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3105 npm run test:e2e`: 16/16 passed against a fresh production build (a stale `next start` from an earlier session on port 3105 initially served outdated chunks — killed by PID and restarted; see the 2026-09-23 operational note).
- `npx playwright test --config=playwright.recovery.config.ts`: 20/20 passed.
- `DESIGN_BASE_URL=http://127.0.0.1:3105 node scripts/verify-design.mjs`: 60 route/viewport/language/theme combinations, 14 axe scans, all interaction and catalog checks passed.
- `/opt/anaconda3/bin/python3 scripts/verify-bootstrap-ceo.py`: CEO functions live; bootstrap pending owner signup.

Legal/privacy notes for this milestone:

- User deletion permanently removes accounts (auth + profile + role rows) — hard-delete is destructive and irreversible; audit rows record actor and target. Owner/legal should confirm retention expectations before public launch.
- Admins can view the full user list including emails (read-only) — internal PII exposure to admin role must be covered by the approved privacy policy.

Remaining blockers / owner actions:

- Owner: sign up with `kosay.gobran@gmail.com`, verify the email, then re-run `npx supabase db push --linked` (or have a CEO run `select add_ceo('kosay.gobran@gmail.com')`) to activate the initial CEO; change the temporary password after first login.
- Owner: confirm the fresh-email password recovery flow on localhost.
- Owner/legal: approve privacy, terms, accessibility and business copy; real product photography, prices and inventory replace the seeded sample catalog before launch.
- Engineering: regenerate `src/lib/supabase/database.types.ts` if strict RPC typing is desired (`delete_user_account` is called via untyped `rpc`); run `node scripts/verify-recovery.mjs` and deployment verification when rolling out.
- QA: manual screen-reader/keyboard/device review of the new account menu and admin console remains outstanding.

## Unfinished Workspace And Storefront Work Repaired — 2026-09-23

The working tree contained a large uncommitted feature set (workspace entry, role-aware header/account link, check-email page, saved products, role-based catalog pricing, admin management console with product/category/price/image CRUD, CEO settings, audit history) left mid-flight by a previous session. The production build was broken and the functionality had real bugs. This session repaired, completed and fully verified it.

What changed and why:

- Created the missing `src/styles/workspace.css` (imported by `src/app/[locale]/layout.tsx` but never written), unblocking the production build; it styles the compact `.workspace-entry` header link consistent with the existing icon-button treatment.
- Gated `<SpeedInsights />` behind `process.env.VERCEL` in the locale layout; locally it requested `/_vercel/speed-insights/script.js`, which 404s and failed the repo's own "no browser errors" design-check gate. It still loads on Vercel deployments.
- Extracted `getStoreViewer()` in `src/lib/store-data.ts` and used it on the Store and category pages. The previous per-page code called `createServerSupabaseClient()` without a try/catch, so `/store` crashed when Supabase credentials were missing — violating the project's missing-credentials fallback contract. Category pages now also apply role-based pricing and saved state consistently (they previously dropped them).
- Fixed the saved-products toggle: the client sent `DELETE` with the product id in a JSON body while the route read it from the query string, so unsaving always failed with 400. The client now sends `?productId=...`, the route validates it as a UUID, and the product card toggles optimistically with rollback. The inline styles it introduced were moved to `sf-product-actions`/`sf-save-button` in `src/styles/storefront.css`; the invalid `text-accent` utility became `text-accent-text` (the registered token).
- Fixed the account dashboard's saved-products join handling (PostgREST many-to-one returns an object, not an array — the products previously filtered themselves out silently) and moved its Remove button into a client component (`src/components/account/remove-saved-button.tsx`); an `onClick` handler on a host element inside a server component would have crashed render for logged-in customers.
- Allowed admin-managed external HTTPS product images in `next.config.ts` (`images.remotePatterns` wildcard), since the dashboard renders catalog `image_url` values through `next/image`.
- Added same-origin and email-format validation to `POST /api/auth/resend-reset` for consistency with the other cookie-based mutations.
- Ran Prettier across the tree; it had 6 uncommitted style violations.

Verification (all passed on the final deliverable):

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`.
- `PORT=3102 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3102 npm run test:e2e`: 16/16 passed.
- `npx playwright test --config=playwright.recovery.config.ts`: 20/20 passed.
- `DESIGN_BASE_URL=http://127.0.0.1:3105 node scripts/verify-design.mjs`: 60 route/viewport/language/theme combinations, 14 axe scans, all interaction and catalog checks passed.
- `python3 scripts/verify-database.py`: all 7 migrations and both access/CEO test suites passed in disposable PostgreSQL (tables `saved_products` and `product_prices` with RLS are present and support the new features).
- Route probe on the production build: public pages 200; `/account`/`/workspace`/`/admin`/`/worker` redirect to login for visitors; management APIs return 403 and the account API 401 for anonymous callers.

Operational note for future agents: a `next start` production server can survive `kill` of its `npm` wrapper PID. Kill by process listings (`pkill -f 'next start'` / port check via `lsof -iTCP:<port>`) before verification servers, or a stale build silently serves tests. One mid-session design failure (mobile-nav click not navigating) was traced to exactly such a stale server, not to code.

Remaining blockers / owner actions (unchanged from earlier entries):

- Owner: confirm the fresh-email password recovery flow on localhost, then change the temporary CEO password after first login.
- Owner/legal: approve privacy, terms, accessibility and business copy; real product photography, prices and inventory replace the seeded sample catalog before launch.
- Engineering: run the live recovery check (`node scripts/verify-recovery.mjs`) and deployment verification when rolling out; the management features use server-only admin clients — keep service-role keys in ignored configuration only.
- QA: manual screen-reader/keyboard/device review remains outstanding.

## Live Localhost Recovery Allowlist Repair — 2026-09-22

- The owner's manual check reproduced localhost recovery redirecting to the Vercel Site URL. Live Supabase inspection found only the bare `http://localhost:3000/auth/callback` allowed, while the application sends callback query parameters. The recovery email template correctly uses `{{ .ConfirmationURL }}`.
- Added `http://localhost:3000/**` and `http://127.0.0.1:3000/**` to the linked project's Auth redirect allowlist through the authenticated Management API. Readback verified both additions and preservation of every existing entry, the Site URL, and the email template.
- The actual Site URL is `https://miro-kosaygobran-afks-projects.vercel.app/`; the previous operations note identifying `miro-one-omega.vercel.app` as the Site URL was stale.
- Verification: `node scripts/verify-recovery.mjs` passed all four live combinations (Hebrew/English × localhost/127.0.0.1), including accepted callback parameters, the visible password form, removed hash tokens, password update, new-password sign-in and old-password rejection. The disposable user was deleted. This uses real Supabase generated links without sending email; the owner's inbox/PKCE flow remains the final manual check.
- Real development-server verification additionally reproduced a Strict Mode effect replay race: the first initialization removed the recovery hash while the second read an unfinished session. The reset component now shares one recovery promise across effect replays. Added opt-in `scripts/verify-recovery.mjs` to exercise live generated recovery links, password update/new-password login/old-password rejection in both locales on localhost and 127.0.0.1, then delete the disposable user.
- Next.js 16 also blocked the development HMR connection on `127.0.0.1`, leaving that origin's page stuck loading. Added only `127.0.0.1` to `allowedDevOrigins`, following the installed Next.js guide, so the second allowed loopback hostname works in development too.
- `npx playwright test --config=playwright.recovery.config.ts`: all 20 tests passed after the Strict Mode fix. `npm run lint`, `npm run build`, `npm run typecheck`, `npm run format:check` and `git diff --check`: passed; the final build restored `.env.local` rather than the test service. Initial live checks exposed the two development issues above and deleted their disposable users on failure; the final live run passed. The Homebrew Supabase executable exited 137, so authenticated inspection used the working npm CLI/Management API instead.
- Privacy/accessibility: no new collection or UI changes; keep tokens/credentials out of logs and delete the disposable account. Existing owner/legal privacy approval and QA manual accessibility review remain launch actions.
- Owner action after verification: request a fresh email on localhost, open it in the same browser, and confirm password change/sign-in. Previously issued links retain the previous destination. Continue broader fixes only after the owner confirms recovery works.

## Password Recovery Redirect Repair — 2026-09-22

- Scope: repair and verify password reset first; the owner explicitly requested a manual email check before work on other problems. Preserve the existing unrelated workspace changes.
- Initial and resent reset emails now share the localized callback URL. Resend previously omitted `redirectTo` entirely.
- Homepage PKCE callbacks now reach the code-exchange handler, which uses Supabase's recovery marker to select the reset page. Preserve `sb_flow_id` for the installed SDK's verifier selection.
- Preserve the incoming Host in callback/resend URLs. The production-server test reproduced an internal `localhost` redirect from `127.0.0.1`, which discarded access to the browser's session cookies.
- Legacy/dashboard recovery hashes landing on public pages move intact to the reset page; invalid/expired links offer an accessible retry action. The reset form requires a verified user session. The template verifier accepts `token_hash` as well as the older `token` parameter.
- The installed SSR SDK always uses PKCE and rejects implicit callback URLs during automatic initialization. The reset page explicitly imports legacy recovery tokens with `setSession`, removes the hash, then verifies the user before displaying the form.
- Added an isolated Supabase protocol double and browser regression suite covering initial/resend requests, both locales, password update, homepage fallback, token hashes, expired/reused links and missing browser verifiers. No test emails or real account changes are needed.
- Final verification: `npx playwright test --config=playwright.recovery.config.ts` — all 20 tests passed; `npm run lint`, `npm run build`, `npm run typecheck`, `npm run format:check`, targeted formatting and `git diff --check` — passed. The last production build used the real `.env.local` again, not the protocol-double environment.
- Earlier checks caught and resolved a SDK return-type mismatch, overly broad test locators, the hostname/cookie mismatch and implicit-token incompatibility. The first concurrent lint attempt raced Playwright's temporary output cleanup; the final standalone lint passed.
- Owner action: after automated verification, request a fresh reset email and confirm the new-password page and sign-in. Engineering: live email-template/redirect allowlist and deployment are not verified by the local protocol double. Do not claim actual inbox delivery from these tests.
- Privacy/accessibility: recovery tokens must not be logged; error/loading states use live regions and retry links are keyboard accessible. Owner/legal approval of existing account privacy/retention notices and QA manual screen-reader/device review remain launch blockers; no new data collection was added.
- Handoff: local code only; no deployment or hosted Supabase configuration changes were made. Await the owner's fresh-email manual result before beginning the broader issue-fixing request.

## Phase 2 Authentication, Permissions And Deployment Repair — 2026-09-21

Current phase: Phase 2 implementation and database rollout; final deployment verification in progress. This entry supersedes older Phase 1 “next task” notes below.

- Completed cookie-backed authentication, session refresh, safe confirmation callbacks, password recovery/reset validation, localized logout and server-side customer/worker/admin/CEO guards. Missing development credentials keep public pages available and disable account submission.
- Added profile updates, authenticated service requests, worker assignment/status workflows and audited account management. Administrative operations use authenticated RLS/RPC permissions, not a browser-exposed service key.
- Fixed profile role/status escalation, legacy inactive-catalog visibility, customer-controlled order writes, admin changes to CEO accounts, open redirects and cross-origin writes. Follow-up migration fixes SQL NULL handling for unassigned workers.
- Added CEO password re-verification, verified email-change initiation, promotion of existing verified accounts and self-deletion. CEOs cannot demote/block another CEO; deletion has no target argument and atomically preserves at least one active CEO. The user-designated initial CEO was provisioned; no password or private key is stored in the repository.
- Applied migrations 20260921220000, 20260921221000 and 20260921223000 after isolated PostgreSQL tests. Earlier foundation/account migrations were already present remotely. Regenerated database types from the linked schema.
- Added explicit Vercel Next.js framework/build/output configuration after live diagnosis showed public images available but all application routes returning platform NOT_FOUND. Canonical URL configuration now accepts APP_URL and Vercel’s production domain.
- Preserved the premium storefront and existing catalog. Public guest contact remains an explicitly labeled preview; authenticated requests are functional. Checkout/payments, invoicing issuance, catalog editing and email notifications are subsequent commerce/operations work, not completion claims for this authentication phase.

Verification:

- Isolated PostgreSQL: every migration applied; customer A/B isolation, anonymous access, metadata escalation, profile column permissions, admin/CEO restrictions, worker assignment, suspended writes and transactional audit tests passed.
- CEO database tests: password freshness, unverified target rejection, protected peer CEO, self-deletion and last-active-CEO invariant passed.
- Production build, lint, TypeScript and formatting checks passed before the final CEO additions; final checks recorded below after release validation.
- Real CEO sign-in, account/admin rendering and rejected incorrect re-verification password: passed against the linked Supabase project.
- `python3 scripts/verify-database.py`: all seven migrations and both access/CEO test suites passed in disposable PostgreSQL.
- Browser suite: 16 tests passed for public routes, localization, accessibility smoke, anonymous protected routes, callback redirects, origin checks and password confirmation.
- The private service key was corrected in ignored local configuration using authenticated project access; the new management flows do not require it at runtime.

Outstanding launch actions:

- Engineering: finish release/deployment verification; Supabase site URL and callback allowlist now include the correct production domain. Test actual inbox delivery with the owner. Do not claim SMTP delivery from database or browser mocks.
- Owner: change the temporary CEO password from the account security page after first login.
- Owner/legal: approve privacy and retention text for the now-live account/profile/request collection and self-deletion behavior. Business records and audit entries have separate retention needs. QA: manual screen-reader and device review remains outstanding.

## Removed Unneeded Canvas Worktree Changes — 2026-09-21

The uncommitted canvas/dashboard experiment and its related Supabase schema, package dependencies, local MCP configuration and utility changes were removed because they were outside the verified Phase 1 storefront scope and were not ready for safe release. The working tree now matches the pushed `0.0.2` release.

Verification:

- `git diff --exit-code origin/0.0.2 --`: passed.
- Source cleanup left no canvas/dashboard files or dependency changes; this status entry is the only remaining working-tree edit.

Future work:

- Reintroduce canvas/dashboard functionality only as a separately scoped Phase 2 implementation with reviewed migrations, authentication/RLS, localized routes, accessibility coverage and feature tests.

## Supabase Phase 2 Foundation — 2026-09-21

Implemented and applied the repository-side Supabase foundation to the linked Supabase project:

- unified browser and server clients around `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, with backward-compatible fallback to the older anon-key name
- rejected a publishable key when supplied as `SUPABASE_SERVICE_ROLE_KEY`
- added explicit catalog read diagnostics instead of silently hiding every connection failure
- added an additive migration for catalog tables, profiles, user roles, service requests, audit events, triggers, grants and RLS policies
- added initial TypeScript database definitions for those tables
- switched public catalog reads to the server Supabase client so they use the catalog RLS grants and do not require a service-role key

Verification:

- `npm run format:check`: passed
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm run build`: passed
- `git diff --check`: passed
- Supabase endpoint health responded.
- Remote migration `20260921205000` is applied and matches the local migration.
- Public-key REST verification returned HTTP 200 for `categories` and `products`; protected `profiles` and `service_requests` correctly rejected anonymous access.
- Added and applied `20260921211500_grant_service_role_access.sql` after the project required explicit `service_role` table grants for trusted server-side reads.
- `supabase db lint --local --fail-on error`: blocked because no local Supabase database is initialized.

Blocking owner action:

- Replace the local/deployment `SUPABASE_SERVICE_ROLE_KEY` with the actual private service-role secret before implementing admin-only workflows. The current local value is identical to the public publishable key and must not be used for admin reads.
- The migration has been applied to the linked project after an explicit confirmation. Future schema changes must be tested in staging before production.

## Premium Storefront And Public Experience — 2026-09-21

The website now follows the supplied premium black/gold and light storefront references with wider merchandising layouts, focused reading areas and usable interactive catalog controls.

What changed and why:

- Rebuilt the shared header/footer with an original geometric brand mark, five primary destinations, desktop/mobile product search, keyboard-operable category disclosure and directly selectable dark/medium/light themes. Removed the nonfunctional cart indicator.
- Introduced shared `premium.css`, editorial `experience.css` and catalog `storefront.css` layers. Full page frames use a 112rem maximum with consistent gutters; About/Contact/service details and authentication forms keep narrower measures.
- Rebuilt Home and Services with photographic equipment heroes, category navigation, home/business/network solution cards, a connected-system diagram, four project stages, useful FAQs and project CTAs. Home/business/detail service pages and About/Contact now share this composition and bilingual content structure.
- Rebuilt Store and category pages with original SVG hardware illustrations, searchable category-aware catalogs, price/name sorting, clear/reset, load-more and accessible native product dialogs. Product inquiry links carry the product name into the Contact preview message.
- Preserved the Supabase read path and added consistent localized fallback catalog data. Known fallback category routes remain reviewable when the connected test catalog omits them. Illustrations/prices remain explicitly sample content, with no invented ratings, partner endorsements or delivery/support guarantees.
- Removed the rule hiding the site on phones at 360px or below and short landscape screens. Added localized skip navigation, visible keyboard focus, menu Escape/focus return, reduced-motion handling and enlarged-text reflow.
- Kept the existing local image and existing website dependencies; no new frontend runtime package or database mutation was needed. Editable bilingual content arrays prepare the design for approved copy; a CMS is not implemented.

Verification and fixes:

- Release validation uses an isolated worktree at `/tmp/miro-release-0.0.2` with the website package metadata at `0.0.2`. An earlier unrelated canvas/dashboard experiment was removed from the working directory because it was outside this release scope. No check was disabled or weakened to make the release pass.
- `npm ci --ignore-scripts --no-audit --no-fund` in the release worktree: passed.
- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed for the isolated website release.
- `npm run build`: passed, 49 statically generated pages plus dynamic Contact/Store/category routes.
- `PORT=3101 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 npm run test:e2e`: all 7 Chromium tests passed. An initial category-route failure was fixed by moving the pure visual-kind helper outside the client component boundary.
- `DESIGN_BASE_URL=http://127.0.0.1:3101 node scripts/verify-design.mjs`: passed 60 Home/Store combinations (320/390/768/1440/1920px, Hebrew/English, dark/medium/light), 14 axe scans, keyboard menus, persistent themes, header search, reduced motion, small landscape and 200% text enlargement. Also passed catalog search/empty/reset/sort/category/dialog/inquiry/shared-query checks. An initial enlarged-text header overflow was corrected and the matrix rerun successfully.
- Additional production browser review: 56 route/viewport checks across Services, Home/Business solutions, four service details, About, Contact, Privacy, Terms, Accessibility and category routes; 30 more axe scans across both languages and three themes; no errors. Selected-product Contact prefill verified.
- Existing local development server checks: Hebrew Store, Cameras and English Network Gear returned 200 with populated cards and no browser errors; no database mutation was performed.
- Desktop Hebrew Home/Store, English Contact/Home Solution and phone light Store screenshots visually inspected. Review artifacts are local at `/tmp/miro-design-review`; they are not committed assets.

Launch blockers and owners:

- Business owner: approve final company/contact facts, service copy, real product photography, specifications, prices and availability. Current catalog and package content remain illustrative.
- Engineering/business owner: implement and validate actual inquiry delivery, checkout, inventory and protected-account workflows. The Contact preview explicitly does not submit data; this visual release does not certify pre-existing authentication work as production-ready.
- Owner/legal reviewer: finalize privacy, terms, accessibility statement and commercial claims before public launch. No analytics or new data collection was added.
- QA: complete manual screen-reader and real-device review; automated accessibility checks are evidence, not a substitute for that launch review.

Release branch: `0.0.2`, requested by the user for the verified website update. Website changes and prerequisite storefront foundation changes are included; canvas/dashboard functionality remains deferred to a separately scoped Phase 2 implementation.

## Full-Page Layout And Responsive Centering Pass

User requested continuing the design work so each page uses the available space more naturally, with content lowered or centered according to that page's purpose while preserving the established MIRO design DNA.

Changes made:

- Added reusable full-page layout primitives in `src/app/globals.css`: `miro-page-shell`, `miro-page-panel`, `miro-page-panel-narrow`, `miro-split-panel`, `miro-contact-layout`, `miro-split-copy`, `miro-contact-copy`, `miro-visual-grid`, `miro-visual-tile` and `miro-contact-form`.
- Bounded the shared wide container at `96rem` so large screens feel intentionally filled without allowing text and controls to drift across unlimited width.
- Gave short informational pages a viewport-aware shell that centers their main panel vertically when space permits while returning to natural document flow on smaller screens.
- Updated About, Privacy, Terms and Accessibility pages to use the narrower centered full-page panel treatment.
- Rebuilt Contact as a wide responsive split layout, with its copy and form balanced as one composition on desktop and stacked cleanly on mobile.
- Updated the Home and Business service pages to use centered split panels with responsive visual tiles, and updated individual service detail pages to use the shared full-page panel.
- Replaced remaining radial decorative backgrounds in the edited surfaces with restrained linear treatments, removed viewport-scaled heading sizes and removed negative letter spacing from shared CSS.
- Added mobile and tablet rules so split layouts collapse, copy centers where appropriate, visual tiles stack without overflow and compact pages no longer force artificial viewport height.
- Kept the Store, navigation hierarchy, theme system and existing page-specific layouts intact; this pass changes composition and spacing without adding new product or data behavior.

Verification commands and results:

- `npm run format:check`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass. The production build generated 49 static pages.
- `npm run test:e2e`: pass. All 7 Playwright Chromium tests passed against a fresh production build/server.
- Targeted responsive layout scan: Home, Store, Services, Home Service, Business Service, service detail, Contact, About, Privacy and English Contact returned 200 and had no horizontal overflow at 1440x1000 and 390x844.
- Targeted axe WCAG A/AA checks on Contact, About, Home Service and Store: pass, no violations.
- Visual screenshots of desktop Contact, desktop About and mobile Home Service were inspected during the session; temporary screenshots were not committed.
- Confirmed the local production preview was stopped after verification and no process remained intentionally running for this milestone.

Important notes for future agents:

- Use the shared page-shell and page-panel primitives for short content pages instead of adding one-off fixed margins or heights.
- Choose page-relative alignment: short informational pages may center vertically; catalog and long content pages should begin naturally near the top; split pages should center their columns as a group and stack on small screens.
- Preserve the `96rem` maximum width unless a tested page has a concrete reason to be wider. Keep readable text measures narrower inside that outer frame.
- Legal/privacy launch blockers remain owner/legal review of privacy, terms, accessibility statement, business claims, contact facts and future catalog/commerce behavior. Owner action: approve or replace public-facing copy before deployment.
- Accessibility launch blocker remains manual keyboard, 200% zoom and screen-reader review even though automated axe checks pass. Owner/QA action: complete manual assistive-technology testing before launch.

## Three-Mode Theme Refinement And Navbar Polish

User requested a richer theme system with bright, medium and dark states, a softer medium-gray mode for long reading, improved navbar styling in the brighter themes, and a switch-like control instead of a simple icon toggle.

Changes made:

- Added a third theme state in `src/app/globals.css`: `dark`, `medium` and `light`, with the medium palette tuned as a calm gray-neutral for eye comfort and readability.
- Updated the pre-render theme bootstrap in `src/app/[locale]/layout.tsx` to honor stored values and use a valid default that matches the new three-mode system.
- Refined the header surface and navbar color tokens so the bright/light navbar reads as part of the premium storefront instead of feeling visually detached.
- Rebuilt the theme control in `src/components/layout/header-client.tsx` as a segmented switch with D / M / L states and proportional thumb movement.
- Kept the existing MIRO brand direction intact: dark storefront, premium gold accents, and a professional security-brand feel without introducing heavy libraries or unnecessary animation.

Why this change was needed:

- The project had only dark and light support, which did not match the requested design flow.
- The light/bright navbar was visually weaker than the rest of the storefront and needed a more premium, cohesive treatment.
- The owner specifically requested a medium mode that is easy on the eyes while still reading as premium and modern.

Verification commands and results:

- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass.

Important notes for future agents:

- Keep the three-mode theme model intact: `dark`, `medium`, `light`.
- Treat medium as the default comfort mode for product browsing and extended reading.
- Preserve the segmented switch style and maintain a premium dark storefront tone across all modes.
- Legal/privacy launch blockers remain owner review of business claims, product imagery and public-facing copy before launch.

## Store Rename And Screenshot-Inspired Redesign

User supplied a store/e-commerce screenshot on 2026-09-20 as a visual reference, not as content to copy. User requested changing the Products section to Store, moving Store beside Home, keeping the MIRO design DNA, removing underline-style active effects, showing both section and sub-section active states, using rounded connected shapes, reserving product image slots for later CEO-managed images/items, and recording the work for future AI agents.

Changes made:

- Renamed the public product route surface to Store: `/he/store`, `/en/store`, and `/store/[category]`.
- Removed the live `/products` route files and added permanent redirects from `/products` and `/products/[category]` to the matching `/store` URLs.
- Moved Store directly after Home in the header navigation.
- Kept a two-level active state: Store stays active on `/store/*` and the selected store category subnav stays active on its own category page.
- Preserved rounded button/pill active states and removed underline-style active treatments from header/dropdown/subnav surfaces.
- Rebuilt the Store landing page around the supplied reference structure: top hero banner, department tiles, category rail, featured item cards, business package band, service/trust row and brand slots.
- Product images are intentionally placeholders/icons for now. Future real product images, editable item names, inventory and add/manage flows are still planned for the CEO/admin account and require the real data/admin layer.
- Localized Store copy, no-results text and cart/action labels in Hebrew and English.
- Added `dir="auto"` to product card text fields so English item names inside Hebrew pages keep sane number/text ordering.
- Replaced the Store hero's orb-like radial highlight with a linear treatment and changed the Store title to fixed breakpoint sizes instead of viewport-scaled type.
- Updated `src/app/sitemap.ts`, `tests/smoke.spec.ts`, `docs/ROUTES_AND_ROLES.md`, `docs/DESIGN_SYSTEM.md` and `docs/OPERATIONS.md` for the Store route and redirect contract.
- Removed a duplicate Hebrew `metadata.about` key from `src/messages/he.json`.

Verification commands and results:

- `npm run format:check`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass. Final build generated 49 static pages and shows `/[locale]/store` plus `/[locale]/store/[category]`, with no live `/products` route.
- `npm run test:e2e`: pass. 7 Playwright Chromium tests passed, including `/he/store`, old `/he/products/cameras` redirecting to `/he/store/cameras`, localized metadata and automated axe checks on home pages.
- Manual production preview: `npm run start` was ready in about 65ms.
- Targeted Playwright check: `/he/store` Store nav has `aria-current="page"`; `/he/store/cameras` Store nav has `aria-current="location"` and Cameras subnav has `aria-current="page"`.
- Targeted layout check: `/he/store`, `/he/store/cameras` and `/en/store` had no horizontal overflow at 1440px desktop or 390px mobile.
- Targeted axe WCAG A/AA check on `/he/store`: pass, no violations.
- Visual screenshots inspected at `/tmp/miro-store-final-desktop.png` and `/tmp/miro-store-final-mobile.png` during the session. Temporary screenshot artifacts were not committed.
- Confirmed no local process remains listening on port 3000 after verification.

Important notes for future agents:

- Public wording should remain Store / חנות unless the owner changes it. Internal component names may still say Product because the cards represent products.
- Preserve Store beside Home in the header.
- Preserve the two active levels: Store as the active parent section and the selected category as the active subpage.
- Product image slots are placeholders only. Do not fake CEO catalog editing or inventory; implement it later with real authentication, roles and storage.
- Legal/privacy launch blockers remain owner/legal review of business claims, product claims, legal pages, contact facts and any future catalog/commerce flow. This pass introduced no real data collection.
- Accessibility launch blocker remains manual keyboard, zoom and screen-reader review before launch, even though automated axe checks passed.

## Modern Rounded Design And Product Navigation Refinement

User requested a more modern rounded design, stronger contrast/shadows/lights, softer fast effects, removal of the double underline/button active effect in the header, active parent Products state on product subpages, active product subnav state, better centering/connected shapes, fast rendering and full AI handoff logging.

Changes made:

- Reworked global shape tokens in `src/app/globals.css` with larger shared radii, stronger but soft shadows, glow tokens and faster 140-160ms interaction transitions.
- Replaced header active underline/shadow effects with a single rounded active pill state.
- Made the Products header nav item stay active for all `/products/*` routes. Exact product category links in the subnav remain separately active, so users can see both the section and subsection.
- Removed underline-style `after` bars from product dropdown and product subnav active states.
- Added connected rounded surfaces for the product subnav rail, dropdown menu, search input, product card media, product icon shell and cards.
- Updated product listing layout from nested containers/grid tracks to a centered wrapping layout. Incomplete final rows now center correctly in RTL and mobile cards use full available width.
- Centered product and category page headings/search area to better match the product browsing surface.
- Reduced product search debounce from 300ms to 180ms for a quicker feel without filtering on every keystroke.
- Fixed a regression caught in visual review: the shared icon-action class had overridden `lg:hidden`, making the mobile menu icon visible on desktop. The class no longer sets `display`, so responsive Tailwind utilities work again.
- Changed Playwright config to `reuseExistingServer: false`, so `npm run test:e2e` always starts its own `npm run build && npm run start` server and cannot accidentally test a stale dev server.

Verification commands and results:

- `npm run format:check`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass. Final build generated 49 static pages and detected Proxy.
- `npm run test:e2e`: pass. 6 Playwright Chromium tests passed from a clean port with the production-backed server.
- Targeted Playwright DOM check on `/he/products/cameras`: pass. Products nav has `aria-current="location"` and active class; Cameras subnav has `aria-current="page"` and active class.
- Targeted desktop/mobile layout check on `/he/products/cameras`: pass. No horizontal overflow; desktop hamburger hidden; mobile hamburger visible; 6 cards render; final row centered on desktop; cards full-width on mobile.
- Extra axe WCAG A/AA check on `/he/products/cameras` and `/en/products/cameras`: pass, no violations.
- Visual screenshots inspected at `/tmp/miro-products-desktop-final2.png` and `/tmp/miro-products-mobile-final2.png` during the session. Temporary screenshot artifacts were not committed.

Important notes for future agents:

- Product navigation intentionally has two active levels: parent Products as section (`aria-current="location"`) and category subnav as page (`aria-current="page"`).
- Header/subnav active states should remain pill/button states only; do not reintroduce underline bars or inset underline shadows unless explicitly requested.
- Keep `npm run test:e2e` production-backed and non-reusing. Stop any local server on port 3000 before running it.
- Legal/privacy launch blockers remain owner/legal review of draft pages and business claims. This design pass introduced no real data collection.
- Accessibility launch blocker remains manual keyboard, zoom and screen-reader review before launch, even though automated axe smoke checks passed.

## Run / Deployment Stabilization And AI Handoff Update

User requested fixing project run, deployment problems and running time, then asked that all future work be recorded for other AI chats.

Changes made:

- Installed dependencies with `npm install` and verified clean CI-style install with `npm ci`.
- Read local Next.js 16.3.5 docs from `node_modules/next/dist/docs/` before touching framework-sensitive code.
- Verified `src/proxy.ts` is correct for Next.js 16 Proxy convention.
- Ran Prettier across the repo so `npm run format:check` passes. Many existing docs and TSX files changed only by formatting.
- Simplified `next.config.ts` from an empty placeholder object with a comment to `const nextConfig: NextConfig = {};`.
- Set `localeDetection: false` in `src/i18n/routing.ts` so `/` deterministically redirects to the Hebrew-first default `/he`, independent of browser language.
- Added `playwright.config.ts` with production-backed `webServer` behavior: `npm run build && npm run start`.
- Added `tests/smoke.spec.ts` covering Hebrew/English route rendering, localized `lang`/`dir`, root redirect to `/he`, and automated axe WCAG A/AA smoke checks on home pages.
- Added `/playwright-report` and `/test-results` to `.gitignore`.
- Installed Playwright Chromium locally with `npx playwright install chromium` so `npm run test:e2e` can run on this machine.
- Cleared generated Playwright artifacts after the run.
- Confirmed no local server process remained on port 3000 after verification.
- Updated `AGENTS.md` to require future agents to record meaningful project changes in this file for cross-chat handoff.

Verification commands and results:

- `npm ci`: pass. npm reported 0 vulnerabilities.
- `npm run format:check`: pass after formatting.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass. Final production build generated 49 static pages and detected Proxy.
- `npm run test:e2e`: pass. 6 Playwright Chromium tests passed.
- `npm run start`: pass. Production server was ready in about 55ms during final manual check.
- `curl -I -L http://localhost:3000/`: pass. `/` returns 307 then `/he` returns 200.
- `curl -I http://localhost:3000/he`: pass, 200.
- `curl -I http://localhost:3000/en/contact`: pass, 200.
- `npm run dev`: pass. Dev server was ready in about 203ms during final manual check.

Important notes for future agents:

- `npm run test:e2e` now starts a production build/server through Playwright config. It is a real deployment smoke check, not just a placeholder command.
- The app is Hebrew-first by design. Do not re-enable Accept-Language root routing unless the owner explicitly requests language auto-detection.
- Playwright browser binaries are machine-local cache, not committed project files. On a fresh machine or CI worker, run `npx playwright install chromium` if the browser binary is missing.
- npm currently reports install scripts awaiting review for `@parcel/watcher`, `@swc/core` and `unrs-resolver`. Builds and tests pass without approving them, but a project/security owner should decide whether to approve or deny those scripts before CI hardening.
- Legal/privacy launch blockers remain: owner/legal review of privacy, terms, accessibility statement, business identity, contact facts and service claims.
- Accessibility launch blocker remains: automated axe smoke checks pass, but manual keyboard, zoom and screen-reader review is still required before launch.

## Proportions And Performance Follow-up

User feedback: text, components and positioning needed a more coherent relative scale.

- Added shared rem-based section-spacing and heading tokens. Bounded content width is now 76rem, with consistent responsive gutters. Typography changes at explicit breakpoints, never continuously with viewport width.
- Homepage hero now uses content-driven mobile height and an aspect-ratio media region instead of absolute image offsets and 650px reserved height. Mobile copy/actions are centered; desktop remains direction-aware with bounded text measure.
- Section headings use 22/24/28px equivalents; card titles 18px and icons 36px. Buttons use 14px labels and keep at least 44px touch height. Narrow layouts stack hero actions when their labels need space.
- Service cards share a layout on home and services pages: four/two columns on larger containers, compact icon/text rows on phones. Container queries adjust card padding.
- Business/contact bands now align copy and actions as a unit; mobile uses centered stacking. Process/FAQ columns and footer have consistent gutters and smaller, proportionate type.
- Removed unnecessary viewport-height main padding, allowing short pages to use the body's flex layout to place the footer.
- Removed the unused NextIntlClientProvider wrapper and full-dictionary serialization. Client components already receive translated props and do not use next-intl hooks. Deleted the unused providers.tsx. Server translations and locale routing remain intact.
- Independent homepage translation reads run together. Responsive hero sizes now reflect its bounded media region. No new dependencies, polling, or animation runtime.

Measured on local production `/en`, Chromium, 390x844, fresh browser, same font/image readiness:

| Measurement                             |  Before |   After |
| --------------------------------------- | ------: | ------: |
| Rendered document outerHTML UTF-8 bytes |  57,548 |  47,497 |
| Script resource encodedBodySize total   | 155,143 | 144,878 |
| Optimized mobile hero bytes             |   7,684 |   7,684 |

These are local payload measurements, not Lighthouse scores or a claim of equivalent percentage loading-speed improvements. Real-device/network Core Web Vitals remain unmeasured.

Verification: final `npm run typecheck`, `npm run lint`, `npm run build` and `node scripts/verify-design.mjs` all exited 0 after the last code changes. The 12-combination design script found no console errors or axe A/AA violations. Additional production browser checks passed for home/services/contact/login/about in he/en at 320, 1024 and 1920px (30 cases): no horizontal overflow or clipped text. A 200% root-font-size reflow check at 768px had no horizontal overflow. Screenshots inspected for mobile English light and desktop Hebrew dark. The temporary production server on port 3100 was stopped intentionally; the existing dev server remains on localhost:3000.

Next owner review: approve proportions on real phone/desktop. Developer: retain these shared tokens for subsequent components and measure production field performance after deployment. Accessibility reviewer: manual screen-reader and zoom testing across the full site remains a launch task. Legal/business owner: existing copy, imagery and legal-page approvals remain open; this refinement adds no personal-data collection.

## Latest Design Refinement

User requested stronger premium styling, better fonts, high contrast colors, polished modes, motion and optimization.

- Replaced Arial on localized pages with Heebo variable font for Hebrew and English, self-hosted by next/font with swap loading.
- Replaced muted gold/beige tones with near-black, white, bright yellow and restrained teal. Light mode uses cool neutral surfaces; the photographic hero intentionally stays black in both modes.
- Added original generated, unbranded security-equipment artwork at `public/images/security-studio.png`. It is illustrative, not a claim about available stock. next/image supplies responsive optimized delivery and preload; reserved hero dimensions prevent image-driven layout shifts.
- Replaced placeholder hero icon boxes with full-width photography and localized brand-first text. Reworked service tiles, process rows and full-width business/contact bands; reduced card/button radii and removed heavy shadows and decorative background gradients.
- Added CSS entrance, hover, press, FAQ and menu motion. No animation dependency, scroll listener or continuous animation loop. Reduced-motion preference suppresses motion.
- Added aria-current to active navigation and protected theme switching against blocked localStorage.
- Updated localized homepage copy while retaining unavailable contact/auth behavior.
- Added reproducible `node scripts/verify-design.mjs` browser verification. Requires a running local server and installed Playwright Chromium. Optional DESIGN_BASE_URL overrides localhost:3000.

Verification for this refinement:

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; 47 static pages generated.
- Initial ad hoc axe test: exit 1 because AxeBuilder requires an explicit browser context. Corrected the test harness; no application change was needed for that error.
- `node scripts/verify-design.mjs`: exit 0. All 12 combinations of 360/768/1440 width, Hebrew/English and dark/light passed. Checks cover RTL/LTR, image loading, horizontal overflow, theme switch/reload persistence, keyboard reachability, menu/Escape, reduced motion, console/page errors and axe WCAG 2 A/AA rules. No axe violations detected. Screenshots saved in `/tmp/miro-design-review` (temporary artifacts).
- Inspected desktop light and mobile dark screenshots after correcting hero cropping. Initial screenshot pass exposed tight image framing; final imagery keeps the equipment visible.
- No Lighthouse score, production field performance measurement, full screen-reader test, or accessibility certification claimed. Optimization is architectural, not a measured speedup.

Handoff and next steps:

1. Owner: review the refreshed local site in both languages/modes; approve final business copy and illustrative visual or provide approved product photography.
2. Developer/accessibility reviewer: complete manual screen-reader and full route keyboard testing before launch. Automated homepage checks do not cover all accessibility requirements.
3. Owner/legal reviewer: existing legal drafts, contact facts and privacy launch blockers remain open; no new personal-data collection was introduced.
4. Stay in Phase 1 until explicitly authorized to begin the existing Phase 2 plan below. Real authentication, enquiries and catalog remain unavailable.
5. Future design changes should reuse `src/app/globals.css` tokens and run the verification script; avoid adding motion libraries for simple transitions.

## Current Phase

Phase 1 complete locally. Do not start Phase 2 until the owner asks for real authentication/database work.

## What Was Found Before This Update

- The repository already had a Next.js app, npm lockfile and many Phase 0 document stubs.
- `docs/PROJECT_STATUS.md` was stale and still said Phase 0 was in progress.
- `node_modules` was missing, so checks could not run until `npm install`.
- The app had broken or incomplete Phase 1 behavior:
  - Client hooks were used in server components.
  - Locale links did not consistently include `/he` or `/en`.
  - Hebrew messages contained corrupted text.
  - Tailwind tokens were not actually wired into the global CSS.
  - Metadata did not consistently provide canonical or alternate URLs.
  - Auth forms looked active but did not honestly report unavailable auth.
  - Private pages were previews instead of clearly closed routes.
  - Development preview routes were not production-blocked.
  - Static `public/robots.txt` pointed to `yourdomain.com` and wrong protected paths.

## Completed In This Pass

- Installed dependencies with npm from the existing `package-lock.json`.
- Completed Phase 1 visual/structural foundation without recreating the project.
- Added official `next-intl` routing setup for Next.js 16:
  - `src/i18n/routing.ts`
  - `src/i18n/request.ts`
  - `src/proxy.ts`
  - `next.config.ts` plugin wiring
- Implemented Hebrew `/he` and English `/en` routes with server-rendered `lang` and `dir`.
- Implemented root locale handling through `next-intl` proxy; `/` resolves to Hebrew.
- Rebuilt MIRO styling around semantic tokens in `src/app/globals.css`.
- Matched the supplied design direction: black/charcoal and gold dark theme, soft light theme, security/product visual language, responsive sections, strong CTA styling.
- Implemented working theme control:
  - Uses `miro-theme` in `localStorage`.
  - Applies before paint with a small script in the locale layout.
  - Persists after reload.
  - Does not reset language.
- Implemented working language control that switches to the equivalent localized path.
- Implemented responsive header, footer, mobile drawer, Escape-to-close, and keyboard-reachable controls.
- Implemented public pages with localized metadata:
  - `/he`, `/en`
  - `/services`
  - `/services/home`
  - `/services/business`
  - `/services/[slug]`
  - `/about`
  - `/contact`
  - `/privacy`
  - `/terms`
  - `/accessibility`
- Implemented auth pages as honest unavailable forms:
  - `/login`
  - `/signup`
  - `/forgot-password`
  - `/reset-password`
- Implemented private routes as closed/noindex pages:
  - `/account`
  - `/worker`
  - `/admin`
- Implemented development-only/noindex preview routes:
  - `/design-system`
  - `/catalog-preview`
  - Both call `notFound()` in production.
- Added `.env.example` with `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Added dynamic `robots.ts` and `sitemap.ts` using `NEXT_PUBLIC_SITE_URL` with localhost fallback.
- Removed stale `public/robots.txt`.
- Removed stale Tailwind v3 `postcss.config.js`; kept Tailwind v4-compatible `postcss.config.mjs`.
- Installed Playwright Chromium and performed browser verification.

## Completed, Incomplete, Unverified

### Completed

- Phase 0 repository assessment and status update.
- Phase 1 executable public foundation.
- Hebrew RTL and English LTR.
- Light/dark theme switching and reload persistence.
- Mobile/tablet/desktop responsive navigation.
- Localized page metadata, canonical URLs, alternate language URLs, sitemap and robots.
- Development previews noindex and production-blocked.
- Missing Supabase settings do not break public pages.
- Auth UI does not simulate success.
- Private routes fail closed with no protected data.

### Incomplete By Design

- Real Supabase authentication.
- Real roles, profiles, RLS policies and database migrations.
- Real enquiry submission.
- Real catalog/products/prices/checkout.
- Real business contact details, address, service area, legal copy, reviews, projects and brand partnerships.

### Still Unverified

- Full accessibility certification. Basic keyboard/browser checks passed, but manual screen-reader testing and axe coverage should be added.
- Current Israeli legal applicability. The checklist is engineering prep only, not legal approval.
- Real production domain behavior. `NEXT_PUBLIC_SITE_URL` must be set before deployment.
- Real Supabase credentials and callbacks. Phase 2 must implement and test them.

## Commands Actually Executed

- `npm install`
  - Exit code: 0
  - Result: Pass. Installed dependencies from npm lockfile. npm reported 0 vulnerabilities.
- `npm run typecheck`
  - First relevant failure: missing `.next/types` when run in parallel with build.
  - Final exit code: 0
  - Result: Pass.
- `npm run lint`
  - First failure: React lint errors for state updates inside effects in the header.
  - Final exit code: 0
  - Result: Pass.
- `npm run build`
  - First failure: stale Tailwind v3 `postcss.config.js`.
  - Second issue: missing official `next-intl` config.
  - Final exit code: 0
  - Result: Pass.
- `npx playwright install chromium`
  - Exit code: 0
  - Result: Pass.
- Browser verification script using Playwright Chromium
  - Initial failures: missing browser binary, ambiguous link locator, mobile header overflow, theme hydration errors.
  - Final exit code: 0
  - Result: Pass.
- `npm run dev`
  - Started successfully at `http://localhost:3000`.

## Browser Checks Actually Performed

Final Playwright check covered 360x780, 768x900 and 1440x1000:

- `/he` has `lang="he"` and `dir="rtl"`: passed.
- `/en` has `lang="en"` and `dir="ltr"`: passed.
- Theme toggle changes theme and persists after reload: passed.
- Mobile/tablet drawer opens, Escape closes it, and navigation link works: passed.
- Desktop navigation link works: passed.
- `/en/account` shows closed private route: passed.
- `/en/login` shows unavailable authentication behavior after submit: passed.
- Browser console errors: none in final run.
- Horizontal overflow: none in final run.

## Legal / Privacy / Accessibility Notes

- Owner action: confirm real MIRO business identity, contact details, service areas and any claims before launch.
- Owner/legal action: review privacy, terms and accessibility pages; current text is draft development copy.
- Developer action for Phase 2: avoid collecting real personal data until Supabase auth, RLS, retention and privacy notices are implemented.
- Accessibility action: add axe checks and manual keyboard/screen-reader pass before launch.

## Next Task

Phase 2 should implement real authentication and permissions:

1. Add Supabase migrations for `profiles`, `user_roles`, RLS policies and audit basics.
2. Add server/browser Supabase clients.
3. Implement signup, login, logout, confirmation, recovery and reset flows.
4. Enforce customer, worker and CEO route authorization on the server.
5. Test direct access as visitor, customer A, customer B, worker and CEO.
6. Keep public pages working when credentials are missing in development.
