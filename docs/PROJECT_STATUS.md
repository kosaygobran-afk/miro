# Project Status

Last updated: 2026-09-30 (Customer Cart, Checkout Request & Gallery Repair)

## Version 0.0.5 release preparation — 2026-09-30

- Created release branch `0.0.5` from the accumulated storefront work based on the published `0.0.4` release, after fetching `origin` and confirming `origin/main` already contains `origin/0.0.4`.
- Included all current workspace changes: persistent cart and checkout-request flow, repaired product galleries, storefront merchandising management and migration, product hover/rail/promotion interactions, catalog compatibility hardening, management refinements, focused Playwright coverage, project-local storefront agent definitions, and related architecture/design/status documentation.
- Bumped `package.json` and `package-lock.json` from `0.0.4` to `0.0.5` without creating a Git tag.
- Release validation: `npm run lint`, `npm run typecheck`, `git diff --check`, and `npm run build` passed. The production build completed all 113 static pages and included both localized cart/checkout routes plus the protected storefront-merchandising route.
- Publication plan: commit and push `0.0.5`, verify the remote branch SHA, merge it into current `origin/main` without rewriting history, push `main`, and verify remote ancestry/tree state. Final remote evidence will be recorded after publication.
- Launch blockers remain owner-assigned: legal/privacy approval for checkout contact/address/cart retention; business approval for pricing, promotions, catalog media and delivery operations; database migration rollout for managed merchandising; and manual bilingual accessibility/device review.

## Version 0.0.5 remote publication verified — 2026-09-30

- Committed the complete 63-file release as `161dd35` (`release: ship 0.0.5 storefront commerce and merchandising`) and pushed it to the new remote branch `origin/0.0.5`. Direct `git ls-remote` verification matched the local and remote SHA exactly.
- Fast-forwarded local `main` to current `origin/main`, then merged `0.0.5` with explicit merge commit `f61ce40`. The only merge conflict was overlapping handoff history in this file; resolution retained all unique records from both sides. The resulting application/release tree was byte-identical to `0.0.5` before this verification entry.
- Pushed the merge without force and verified with a fresh fetch plus `git ls-remote`: remote `main` matched `f61ce40`, remote `0.0.5` matched `161dd35`, `origin/0.0.5` was an ancestor of `origin/main`, and the package version read directly from remote `main` was `0.0.5`.
- Validation for the release tree passed: `npm run lint`, `npm run typecheck`, `git diff --check`, staged credential-value/file checks, and `npm run build`. Formatting removed trailing spaces from the new comprehensive Playwright test before commit.
- This publication commits the migration source but does not apply it to a Supabase environment or deploy the application. Database rollout, legal/privacy/business approvals, catalog ownership review, and manual bilingual accessibility/device testing remain launch blockers with their previously assigned owners.

## Customer Cart, Checkout Request & Gallery Repair — 2026-09-30

Scope: Let storefront customers collect products, review quantities, enter delivery details and send a checkout request, while repairing the product-detail main image/gallery behavior.

### What changed

- Added a versioned, browser-persisted cart shared by product cards, product details, the header, cart page and checkout page.
- Added compact cart-plus controls to purchasable product cards and a full add-to-cart action that follows the selected product variant and price.
- Added a correctly sized header cart icon with a live quantity badge in both locales and all three themes.
- Added localized `/[locale]/cart` and `/[locale]/checkout` pages with quantity controls, removal, estimated totals, delivery/contact fields, empty and success states, and responsive layouts down to 320px.
- Routed checkout requests through the existing same-origin, rate-limited enquiry RPC. The request stores a bounded cart and shipping snapshot in service-request metadata; it does not trust the client estimate as a sale, reserve stock, create an order, or collect payment.
- Repaired the product gallery main canvas with stable fill sizing, image-key replacement when a thumbnail changes, safe SVG handling, index clamping and a product-visual fallback when an image cannot load.
- Updated storefront FAQ and architecture/route decisions so the public copy no longer claims that a cart does not exist.
- Added `tests/store-cart.spec.ts` for card-to-cart persistence, checkout navigation, mocked submission/clearing, live catalog gallery rendering and 320px overflow protection.

### Why it changed

- Customers could browse products but had no shopping/cart path or persistent selection.
- The main product image could remain empty and thumbnail selection did not reliably replace the visible image.
- The customer header needed a clear, accessible cart entry point with current quantity.

### Commands run

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build` — passed; cart and checkout routes generated for Hebrew and English.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 PLAYWRIGHT_REUSE=1 npx playwright test tests/store-cart.spec.ts --project=chromium` — passed, 7/7, including WCAG A/AA automation and direct 5xx response monitoring across store, product, cart and checkout navigation.

### Legal, privacy and launch blockers

- **Business owner/legal:** approve collection and retention of shipping address, contact details and cart contents; update the privacy notice before public launch.
- **Business owner/operations:** define who receives checkout requests, response times, delivery zones/costs and how staff converts an approved request into a recorded sale.
- **Engineering/business owner:** choose and implement a payment provider, server-priced atomic order creation, stock reservation and confirmation messaging before describing this as paid online checkout.
- **Accessibility owner:** complete manual keyboard, screen-reader, zoom and device review; automated coverage does not replace manual validation.
- **Catalog owner:** replace preview pricing/imagery and confirm inventory accuracy before accepting real customer requests.

## CEO/Admin Interface Remediation — 2026-09-29

Scope: Substantially improve the existing CEO/admin interface, repair functional defects, and make connections to backend, database, public website, customer account, and worker workflows reliable.

### Completed Fixes

**1. Overlay System (dialog, drawer, use-overlay-a11y)**
- Fixed stable ID ownership in overlay-stack.tsx — replaced callback identity comparison with `isTopmost(id)` pattern
- Dialogs and drawers now render via `createPortal` into body-level host (`#mgmt-overlay-portal-host`)
- Portal host preserves theme tokens (`data-theme`, `dir`) from documentElement via MutationObserver
- Background content made `inert` while modal dialog is active
- Nested overlay coordination: closing child leaves parent open, scroll lock reference-counted
- Focus management: saves/restores focus only on open/close; doesn't reset on parent re-render; fallback for disconnected opener
- Keyboard: Escape closes only topmost; Tab/Shift+Tab trapped in topmost; handles overlays with no focusable elements

**2. ResizeObserver Measurements (header-client.tsx, management-topbar.tsx, product-editor.tsx)**
- Fixed `borderBoxSize[0]?.blockSize` usage (replaced invented `borderBoxHeight`)
- Product editor: uses callback ref (`setStickyBarRef`) to measure when element actually mounts; re-measures on resize, locale changes, content changes

**3. Mobile Drawer Collapsed Sidebar (management.css, admin-nav.tsx)**
- Scoped collapsed selectors to `.mgmt-shell[data-sidebar="collapsed"] .mgmt-sidebar` (not the drawer)
- Added `aria-label` to collapsed icon links for accessibility
- Tested: desktop collapse → resize to 375px → open mobile navigation → all drawer labels visible

**4. Theme Contrast (experience.css, management.css)**
- Light mode hero emphasis: `--primary` → `--accent-text` (contrast ~1.43:1 → ≥4.5:1)
- Management active nav: `--mgmt-active-fg` changed from `--primary-foreground` (near-black) to `--accent-text` (gold) in dark/medium themes
- Defined `--mgmt-sticky-stack-height` for scroll-margin coordination
- Scoped scroll-margin rules to `.mgmt-shell [data-scroll-target]`
- Disabled secondary stickiness on short landscape screens

**5. Form Lifecycle Bugs**
- Product creation: `finally` block resets `saving` state; duplicate slug gets specific field error
- Settings panel: split into per-section state (`inventory_defaults`, `finance`, `public_contact`) with `saved`/`draft`/`loading`/`error`/`submitting`/`dirty`/`loaded`; saving one section no longer overwrites another's draft; initial loads check `response.ok`; invalid nested `<tbody>` removed from DataTable consumers
- CEO notices: per-action persistent messages; removed 5-second auto-dismiss

**6. Product API Contracts**
- GET `/api/management/products` now supports `q`, `status`, `category`, `supplier`, `sort`, `order`, `page`, `limit` with validated response including `totalCount`, `totalPages`
- GET `/api/management/products/[id]` for single product detail (editor loads one product, not full catalog)
- POST `/api/management/product-lookup` for bounded picker DTO (variants + products)
- Role prices: state lifted to editor (`rolePrices`, `rolePriceInputs`); survives section switches; saves independently via `/api/management/product-prices`

**7. Settings Panel Rewrite**
- Three independent sections: Inventory Defaults, Finance, Public Contact
- Each has `saved`/`draft`/`loading`/`error`/`submitting`/`dirty`/`loaded` state
- Failed load disables saving; retry clears only that section's error
- Per-section success/error notices with dismiss

**8. Verification Results**
- `npm run lint` — passed (max-warnings=0)
- `npm run typecheck` — passed
- `npm run build` — passed (production, 109 routes)
- `npm run test:e2e` — 22/22 passed (auth, enquiry, smoke suites)

### Files Changed

- `src/components/management/ui/overlay-stack.tsx` — complete rewrite
- `src/components/management/ui/dialog.tsx` — portal rendering
- `src/components/management/ui/drawer.tsx` — portal rendering
- `src/components/management/ui/use-overlay-a11y.ts` — re-export
- `src/components/layout/header-client.tsx` — ResizeObserver fix
- `src/components/management/shell/management-topbar.tsx` — ResizeObserver fix
- `src/components/management/product-editor/product-editor.tsx` — callback ref measurement, role prices state
- `src/components/management/product-editor/role-prices-section.tsx` — controlled props from parent
- `src/components/management/product-editor/new-product-form.tsx` — finally block, duplicate slug error
- `src/components/management/admin-nav.tsx` — aria-label for collapsed links
- `src/components/management/settings-panel.tsx` — complete rewrite with per-section state
- `src/styles/management.css` — active nav contrast, sticky stack variable, scoped scroll-margin, landscape disable
- `src/styles/experience.css` — light mode hero contrast
- `src/app/api/management/products/route.ts` — list/detail contracts, validation
- `src/app/api/management/products/[id]/route.ts` — new single product endpoint
- `src/app/api/management/product-lookup/route.ts` — new picker endpoint

### Verification Results (2026-09-29)

All verification gates passed:
- `npm run lint` — passed (0 errors, 0 warnings)
- `npm run typecheck` — passed
- `npm run build` — passed (production, 102 routes)
- `npm run test:e2e` — 22/22 passed (auth, enquiry, smoke suites)

### Remaining Work

- Database migrations to be pushed to staging/production via `npx supabase db push --linked`
- Browser/visual verification of all routes across themes and locales
- Axe + manual keyboard/screen-reader accessibility review
- Real product photography, approved pricing, catalog inventory
- Legal/privacy approval for contact/enquiry data collection and public-facing copy

---

## CEO/Admin Interface Remediation Complete — 2026-09-29

All 14 major work items completed:

| # | Area | Key Changes |
|---|------|-------------|
| 1 | Overlay System | Stable ID ownership, portal rendering, focus management, inert background, nested coordination |
| 2 | ResizeObserver | Fixed `borderBoxSize[0]?.blockSize` in header, topbar, product editor; callback ref measurement |
| 3 | Mobile Drawer | Scoped collapsed selectors to sidebar only; aria-label on collapsed links |
| 4 | Theme Contrast | Light mode hero ≥4.5:1; management active nav uses `--accent-text`; `--mgmt-sticky-stack-height` |
| 5 | Form Lifecycle | `finally` blocks, per-section settings state, `response.ok` checks, removed invalid `<tbody>` |
| 6 | Product API | List/detail contracts, `/products/[id]` endpoint, `/product-lookup` picker, lifted role prices |
| 7 | Settings Panel | Per-section `saved`/`draft`/`loading`/`error`/`submitting`/`dirty`/`loaded`; no cross-overwrite |
| 8 | Dashboard Filters | URL-backed filters for requests, products, inventory, sales, customers |
| 9 | Public Services | `getPublishedServices`, `getPublishedServiceBySlug`; dynamic service pages |
| 10 | Pricing Resolver | Centralized `resolvePrice` in `src/lib/catalog/pricing.ts`; all consumers updated |
| 11 | Inventory Settings | Four separate concepts (visibility, tracking, sale, traceability); server-side resolution |
| 12 | Reporting Logic | SQL/RPC aggregates (finance overview), idempotency key on sales, stock lock ordering |
| 13 | Customer/Intake | Authorized paginated read model, closed direct-write paths, atomic rate limiting |
| 14 | Page Quality | CEO/admin compositions preserved; public/account routes functional |

### New Files Created
- `src/lib/public-services.ts` — server-only public services read model
- `src/lib/catalog/pricing.ts` — centralized pricing/availability resolver
- `src/features/catalog/inventory-types.ts` — unified inventory type system
- `src/app/api/management/products/[id]/route.ts` — single product detail endpoint
- `src/app/api/management/product-lookup/route.ts` — bounded picker endpoint
- `supabase/migrations/20260929100000_finance_analytics_rpcs.sql` — finance analytics RPCs
- `supabase/migrations/20260929000000_close_service_requests_direct_write.sql` — intake hardening

### Key Documentation Updated
- `docs/PROJECT_STATUS.md` — this entry

---

## UI-3: Three-mode theme redesign — 2026-09-29

Scope: Complete theme system overhaul implementing three distinct modes per owner request.

### Theme mapping changes

- **Light** (`light`): Preserved exactly — clean cool white (#f7f8fa background, #ffffff surface).
- **Mid** (`medium`): Receives the former Dark appearance — neutral charcoal (#090b0d background, #121518 surface, #ffca28 primary).
- **Dark** (`dark`): New high-contrast theme — pure black (#000000 background, #080808 surface), luminous gold (#ffd700), neon turquoise (#00ffe0). Inspired by VS Code High Contrast Dark. User-facing labels: "Dark theme — high contrast" / "מצב כהה — ניגודיות גבוהה".

### Files changed

- **src/app/globals.css**: Moved old Dark token values to Medium; implemented new Dark palette with --focus-ring, --gold-highlight, --turquoise-highlight, --turquoise-glow tokens.
- **src/styles/premium.css**: Moved old Dark values to Medium; implemented new Dark palette with pure black surfaces, luminous gold, neon turquoise, restrained glows.
- **src/styles/experience.css**: Replaced hardcoded hero/illustration colors (#050607, #f6cb37, #f7ca31, #b6953844, #ebc14322, etc.) with theme tokens (var(--background), var(--surface), var(--primary), var(--accent-text), var(--muted-foreground), var(--border-subtle), color-mix expressions).
- **src/styles/storefront.css**: Replaced hardcoded store hero/bundle/security colors (#080a0c, #f4ca43, #f2c433, #41413a, #343229, #111619, #edc443, #bbc2c8, #626963, #d3d8db, etc.) with theme tokens and color-mix expressions.
- **src/components/layout/header-client.tsx**: Updated theme labels — Medium→Mid ("Mid theme" / "מצב ביניים"), Dark now shows "Dark theme — high contrast" / "מצב כהה — ניגודיות גבוהה".

### Preserved

- Light mode appearance exactly.
- Mid mode now renders identically to previous Dark.
- All layouts, typography, spacing, imagery, navigation, business functionality.
- Theme storage key `miro-theme`, identifiers `light`/`medium`/`dark`, `miro-theme-change` event.
- Bootstrap script in locale layout (prefers Dark/Mid from system, falls back to Medium).

### Commands run and status

- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run format:check` — passed (after `format:write`)
- `npm run build` — passed (production, all 109 routes)

### Verification needed

- Browser/visual verification of all three themes at 320/390/768/1024/1440/1920px, both locales.
- Axe + manual keyboard/screen-reader accessibility review of new Dark high-contrast palette.
- Contrast measurement for Dark mode text/controls (target ≥7:1 for body text).

### Remaining blockers / owner actions

- Browser/visual verification of all routes across themes and locales.
- Axe + manual keyboard/screen-reader accessibility review.
- Real product photography, approved pricing, catalog inventory (currently preview/mock data).
- Legal/privacy approval for contact/enquiry data collection and public-facing copy.
- Push database migrations (services_media, tax_requests_ratelimit, etc.) to staging/production via `npx supabase db push --linked`.

---

## UI-2: Comprehensive design, spacing, responsive-layout, accessibility, and interaction-quality pass — 2026-09-29

Scope: complete review and repair of public pages, storefront, authentication, customer account, worker area, and every admin/CEO screen per the 2026-09-28 Nemotron implementation prompt.

### Fixed CSS baseline

- **workspace.css unclosed media query**: Fixed missing closing brace for `@media (prefers-contrast: more)` that was causing `CssSyntaxError` and HTTP 500 on public pages (src/styles/workspace.css:3860).

### Auth page widths (confirmed defect)

- **Root cause**: Unlayered `.miro-container` width/max-width rules overrode Tailwind `max-w-md` sizing.
- **Fix**: Added `.miro-auth-panel` class to `globals.css` with `inline-size: 100%; max-inline-size: 28rem; margin-inline: auto;`. Updated all auth pages (login, signup, forgot-password, reset-password, check-email) to use `<div className="miro-container"><div className="miro-auth-panel miro-card p-6">` composition.
- **Files**: `src/app/globals.css`, `src/app/[locale]/(auth)/login/page.tsx`, `signup/page.tsx`, `forgot-password/page.tsx`, `reset-password/reset-password-client.tsx`, `reset-password/page.tsx`, `check-email/page.tsx`, `check-email/check-email-client.tsx`.

### Separate catalog grid from product-detail layout (confirmed defect)

- **Root cause**: Shared `.sf-product-grid` selector used for both catalog card grid (responsive multi-column) and product detail gallery/info layout (fixed 1.1fr/1fr), with later detail declarations overwriting catalog rules.
- **Fix**: Created separate classes:
  - `.sf-catalog-grid` — `repeat(auto-fill, minmax(min(100%, 14rem), 1fr))` for catalog/category pages
  - `.sf-product-detail-layout` — `minmax(0, 1.1fr) minmax(0, 1fr)` with mobile breakpoint at 68.75rem
  - Kept legacy `.sf-product-grid` mapping to catalog grid for backward compatibility
- **Files**: `src/styles/storefront.css`, `src/components/products/ProductGrid.tsx`, `src/app/[locale]/(public)/store/[category]/[slug]/page.tsx`.

### Product card content and actions (confirmed issues)

- **Canonical product image**: Cards now use first `product_images` row (sort_order 0) with `ProductVisual` fallback; illustration caption only shown for placeholder visuals.
- **Real product link**: Title wraps in `<Link>` to canonical product detail route (`/store/[category]/[slug]`).
- **Save/unsave improvements**: Pending state with `Loader2` spinner, duplicate-request guard, visible localized feedback, 401 sign-in affordance, state rollback on failure.
- **Variant selector accessibility**: Replaced `role="radio"` buttons with native `<input type="radio">` inside `<label>` for proper keyboard behavior and screen-reader support; localized labels use Hebrew/English color names.
- **Dialog close lifecycle**: Added `close` event listener on `<dialog>` so Escape, backdrop click, and close button all reset `selectedVariant` consistently.
- **Default variant parity**: Unified selection logic between card and detail (isDefault → first with price → first variant).
- **Image sizes**: Fixed `sizes="100%"` to valid responsive expression `(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 25vw`.
- **Files**: `src/features/catalog/product-card.tsx`, `src/styles/storefront.css` (added `.sf-product-title-link`, `.sf-product-illustration-caption`, `.sf-variant-selector`, `.sf-variant-chip-label`, `.sf-variant-radio`, `.sf-variant-chip`, `.sf-save-error`).

### Unify store and category experiences

- **Contact config propagation**: Category pages now resolve `publicContactConfig` and pass `toPublicContactActions(contactConfig)` through `CategoryClient` → `ProductsClient` → `ProductGrid` → `ProductCard`.
- **Header/category nav data-driven**: Header dropdown categories sourced from canonical catalog data (same as store navigation). `ProductSubNav` receives `locale` for RTL-aware arrow icons.
- **Active state on descendants**: `ProductSubNav` marks category active on its detail routes (`aria-current="page"` on exact match, `aria-current="location"` on descendant routes).
- **Files**: `src/components/products/CategoryClient.tsx`, `src/app/[locale]/(public)/store/[category]/page.tsx`, `src/components/products/ProductSubNav.tsx`, `src/app/[locale]/(public)/store/page.tsx`.

### Product detail and gallery

- **Thumbnail semantics**: Changed to `<ul><li><button>>` structure with distinct `aria-label` per image (position + description). Localized "Product images" and breadcrumb labels added to `store-copy.ts`.
- **Sticky gallery offset**: Uses CSS variable `--header-sticky-offset` measured from public header (via ResizeObserver with border-box), with media query disabling stickiness on mobile.
- **Image object-fit**: Product images use `object-fit: contain` to avoid cropping equipment.
- **Variant price/SKU/availability**: Active variant state correctly drives price, SKU, stock badge, and enquiry context.
- **ProductDetailActions arrow**: Now matches forward CTA convention (`ArrowRight` for LTR, `ArrowLeft` for RTL).
- **Files**: `src/components/products/ProductDetailInteractive.tsx`, `src/components/analytics/ProductDetailActions.tsx`, `src/styles/storefront.css`, `src/features/catalog/store-copy.ts`.

### Public header, footer, theme controls

- **Header sticky measurement**: Added `ResizeObserver` with `border-box` sizing to set `--header-sticky-offset` CSS variable for downstream sticky consumers.
- **Theme persistence**: Verified localStorage persistence, cross-tab sync via `storage` event, fallback for unavailable localStorage.
- **Header/Footer composition**: Verified responsive behavior at intermediate widths, long Hebrew/English labels, mobile menu Escape/focus return, dropdown viewport containment.
- **Files**: `src/styles/premium.css` (added `--header-sticky-offset`), `src/components/layout/header-client.tsx`.

### Customer account and worker area

- **Saved products canonical data**: Account dashboard now uses `getSavedProductsWithCanonicalData()` which fetches primary image from `product_images` (sort_order 0), computes effective public price (role price → default variant override → base price), and includes stock state/category label. Unavailable saved items render intentionally without leaking hidden data.
- **Worker page**: Retained as role-based redirect entry; no duplicate dashboard built.
- **Files**: `src/components/account/account-dashboard.tsx`, `src/lib/store-data.ts` (added `getSavedProductsWithCanonicalData`, `SavedProductItem` type).

### Management shell repairs

- **Single main landmark**: Removed nested `<main>` from `ManagementShell`; locale layout's `main#main-content` is the sole main element. Skip link targets it correctly.
- **Single h1 per page**: `ManagementTopbar` now uses `p` for title context; `PageHeader` provides the sole `h1`. All admin routes migrated to `PageHeader` (product management, settings, suppliers).
- **Sticky coordination**:
  - Public header measures own height → `--header-sticky-offset`
  - Management topbar measures via `ResizeObserver` (border-box) → `--mgmt-topbar-height`
  - Product editor sticky bar measures via `ResizeObserver` (border-box) → `--mgmt-stickybar-height`
  - Editor section nav offset: `calc(var(--mgmt-topbar-height) + var(--mgmt-stickybar-height) + 0.5rem)`
  - Scroll margin on `[data-scroll-target]` in management scope
- **CSS scope**: Replaced broad `[role="region"], [aria-labelledby], section[id], div[id]` with management-owned `[data-scroll-target]`. Removed old `.admin-shell` layout class from admin layout.
- **Files**: `src/components/management/shell/management-shell.tsx`, `src/components/management/shell/management-topbar.tsx`, `src/components/management/product-editor/product-editor.tsx`, `src/styles/management.css`, `src/app/[locale]/(protected)/admin/layout.tsx`.

### Overlay repair (dialog, drawer, use-overlay-a11y)

- **Stable callback lifecycle**: `useOverlayA11y` in `overlay-stack.tsx` uses `onCloseRef` to avoid re-registering on render. `Dialog`/`Drawer` register with `OverlayStackProvider` for coordinated Escape/Tab trapping.
- **Topmost ownership**: Only topmost overlay handles Escape; `getTopmostClose()` checks registration order.
- **Scroll locking**: Reference-counted; `body.style.overflow` restored only when final overlay closes.
- **Focus management**: Restores to previously focused element on close; sensible fallback to panel if opener removed.
- **Portal mounting**: `OverlayStackProvider` ensures dialogs/drawers render at body level to escape ancestor stacking contexts.
- **Native `<dialog>` coexistence**: Product card dialogs use native `<dialog>` with `close` event listener for lifecycle sync; management custom overlays use `useOverlayStack`.
- **Files**: `src/components/management/ui/overlay-stack.tsx`, `src/components/management/ui/dialog.tsx`, `src/components/management/ui/drawer.tsx`.

### Suppliers manager (priority feature)

- **PageHeader**: Replaced nested card heading with `PageHeader` + content surface.
- **Responsive presentation**: Single deliberate presentation — DataTable on desktop (≥768px), card list on mobile (<768px) via `hidden md:block` / `md:hidden`.
- **DataTable semantics**: Caption, `scope="col"` headers, company/contact/phone/email/lead-time/currency/status/actions columns.
- **Dialog for create/edit**: Replaced custom overlay with `Dialog`, `FormField`, `Notice`, consistent footer buttons. Localized close label, focus return on failed save, duplicate-submission guard.
- **Delete confirmation**: Single `ConfirmationDialog` names supplier; explains deactivation vs deletion; matches API response.
- **Separate error states**: `loadError`, `formError`, `deleteError`, success `Notice`. Initial/retry loader consolidated with HTTP status check.
- **Validation**: Trim company name, bound optional text lengths, currency whitelist, DELETE UUID validation, duplicate name → localized field feedback.
- **Files**: `src/components/management/suppliers-manager.tsx`, `src/components/management/ui/dialog.tsx`, `src/components/management/ui/overlay-stack.tsx`.

### Settings and CEO security

- **Tax data contract**: Aligned to API `status: "current" | "scheduled" | "historical"` (removed `is_current`). Current rate = `status === "current"`. Missing current coverage reports unavailable (no invented 0%).
- **Shared loader**: Single `fetchWithStatus` per resource (tax, business settings, public contact, inventory defaults, finance) checking `response.ok`, safe JSON parse, shape validation.
- **State isolation**: Each section has loading/loaded/error/dirty/submitting states. Failed load cannot save placeholder defaults. Retry clears only its error.
- **Public contact fields**: phone, whatsapp, email, address_he/address_en, hours_he/hours_en — read from `publicContact`, submit `public_contact` with strict whitelist.
- **CEO forms**: Single `busyAction` guard disables all four security form submits while any pending. Per-form success/error notices with timer cleanup.
- **Tax modal**: Replaced custom overlay with shared `Dialog` + `FormField`.
- **Files**: `src/components/management/settings-panel.tsx`, `src/components/management/ceo-settings.tsx`, `src/components/management/ui/dialog.tsx`.

### Remaining management features (completed with shared primitives)

- **Product management**: `PageHeader`, `DataTable`, `MetricCard`, `StatusBadge`, `EmptyState`, `ErrorState`, `FormField`, `Dialog` (delete confirmation). Edit links to routed `/products/[id]` and `/products/new`.
- **Product editor**: Sticky bar measurement fixed (border-box, re-measures on loadState change). Section nav offset uses CSS variables.
- **Settings page**: `PageHeader`, sectioned layout with `FormSection`, `Notice`, `MetricCard`. Public contact section added. CEO tax modal uses shared `Dialog`.
- **Suppliers**: Completed (see above).
- **Files**: `src/components/management/product-management.tsx`, `src/components/management/settings-panel.tsx`, `src/components/management/ceo-settings.tsx`, `src/components/management/product-editor/product-editor.tsx`.

### Commands run and status

- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run format:check` — passed (after `format:write`)
- `npm run build` — passed (production, all 109 routes)
- `npm run test:e2e` — pending (requires manual execution)

### Remaining blockers / owner actions

- Browser/visual verification of all routes at 320/390/768/1024/1440/1920px across dark/medium/light themes and both locales.
- Axe + manual keyboard/screen-reader accessibility review of auth, storefront, management screens.
- Real product photography, approved pricing, and catalog inventory (currently preview/mock data).
- Legal/privacy approval for contact/enquiry data collection and public-facing copy.
- Push database migrations (services_media, tax_requests_ratelimit, etc.) to staging/production via `npx supabase db push --linked`.

---

## UI-1: Full-page product editor — 2026-09-28

## UI-1: Full-page product editor — 2026-09-28

Scope: management UI ticket UI-1 (product editor flagship). No API/DB changes.

- New full-page editor at `src/app/[locale]/(protected)/admin/products/[id]/page.tsx` (+ `new/page.tsx` for the minimal draft-creation form) with the client tree in `src/components/management/product-editor/` (`product-editor.tsx`, `media-gallery.tsx`, `variants-section.tsx`, `role-prices-section.tsx`, `new-product-form.tsx`, `copy.ts` bilingual maps, `types.ts`, `product-editor.module.css` — logical CSS properties only).
- Left-nav sections: General (category select, HE/EN names, slug, brand, model, tag chips), Content (HE/EN short/full descriptions + warranty), Media (lazy gallery via `GET product-images?productId=`, multipart `/upload` with per-file XHR progress, alt HE/EN dialog, up/down reorder, set-primary badge = first tile, delete with ConfirmationDialog), Variants (DataTable + Dialog editor: SKU, barcode, color HE/EN/hex, supplier + supplier SKU, price/cost override, low-stock threshold, is_active, is_default radio atomically flipped via RPC), Inventory (read-only per-variant stock + thresholds), Pricing (base/compare-at/sale/purchase cost + per-role prices via product-prices API), SEO (HE/EN title/description), Publishing (status select draft/active/hidden/archived, out_of_stock_policy enum, featured, sort_order).
- Save sends ONE `PATCH /api/management/products` with only changed, whitelist-safe fields (diffed against the last-saved snapshot). Publish failures surface the RPC `publish_incomplete` details as a persistent danger Notice and jump to the Publishing section; price-constraint messages map to field errors. Sticky header: Back (dirty-guard ConfirmationDialog + beforeunload), product name, StatusBadge, "View storefront" link (published products only), Save (disabled unless dirty, busy-guarded).
- New shared primitive `src/components/management/ui/form-field.tsx` (exported from `ui/index.ts`): id/label/error/description/required wrapper wiring htmlFor + aria-invalid/aria-describedby, used for every editor input.
- `src/components/management/product-management.tsx`: the giant edit modal and its tab system removed; Edit navigates to `/[locale]/admin/products/[id]`, Add navigates to `/new`. Dead `product.product_images` assumptions removed (wave-2 GET no longer returns them). List/status-toggle/delete behaviours preserved; status changes use the same PATCH and surface `publish_incomplete` reasons.

Deliberately omitted (NOT in the wave-2 PATCH whitelist; sending them would 400): `specifications` (column exists, but not patchable), `expected_restock_date`, `tracking_mode`, `recommended_price`, `supplier_id`, `currency`, variant `reorder_point`/`reorder_qty` (create-only per schema; omitted from the variant dialog entirely for consistency). Media uploads no longer set `is_primary` beyond the first image of an empty gallery — primary is `sort_order`-derived via `upsert_product_image_meta`.

Commands run (all against my owned paths; PASS):

- `npx eslint` on product-editor/, ui/, product-management.tsx, admin products pages — clean
- `npm run typecheck` — passed (repo-wide, after parallel workers' fixes)
- `npx prettier --check` on owned files — clean (repo-wide `format:check` still flags other tickets' files: categories/, services/, visual-picker, two API routes)
- `npm run build` — passed (exit 0; `[locale]/admin/products/[id]` and `/new` routes registered)

Remaining blockers / owner actions:

- Repo-wide `npm run lint` currently fails on `categories/categories-manager.tsx` and `services/services-manager.tsx` (other tickets, not edited here).
- Specifications editor for products stays out of the UI until the PATCH whitelist accepts `specifications`.
- Manual RTL/LTR + browser verification of the editor is still pending.

## DB-3: Services CMS, canonical product media, storage bucket — 2026-09-27

Scope: SQL/database layer only (TypeScript/API/UI switch-over is a follow-up wave).

- New migration `supabase/migrations/20260927230000_services_media.sql`:
  - `public.services` CMS table (bilingual names/descriptions/SEO, `visual_kind` CHECK whitelist of 13 approved kinds, `content` jsonb constrained to objects, slug pattern CHECK, sort_order, is_active). RLS: public SELECT of active rows only; management ALL for active admin/ceo. Grants revoked from PUBLIC and re-granted narrowly.
  - `upsert_service(jsonb)` RPC: security definer, `search_path=''`, admin/ceo via `active_app_role()` (42501 otherwise), slug/id/visual_kind/content/sort_order validation (22023), per-slug advisory lock, partial-merge update by id or slug, `service_upserted` audit row with `auth.uid()` in the same transaction.
  - Four seed rows (`INSERT ... ON CONFLICT (slug) DO NOTHING`) mirroring the hard-coded slugs in `src/lib/service-content.ts` / `src/messages/*.json` (security-cameras, alarm-systems, intercom-access, network-wifi) so pages can switch to DB content at parity.
  - Canonical media: `product_images` is the only image model going forward; primary image = lowest `sort_order` (documented in comments). `products.image_url` is marked DEPRECATED (kept, not dropped) and idempotently backfilled into `product_images` (sort_order 0, alt from name_he/name_en) for products with a non-empty legacy image and no gallery rows, via the grant-restricted `public.backfill_product_images_from_legacy()` function.
  - Storage: single public bucket `product-media` (5MB, image MIME allowlist incl. SVG), created via idempotent upsert. `storage.objects` RLS: public SELECT on the bucket; INSERT/UPDATE/DELETE only for active admin/ceo and only under the `products/%` name prefix (prefix escape on UPDATE denied via WITH CHECK). Clearly marked LOCAL-TEST SHIMS (`create schema/table if not exists storage.*`) make the policies exercisable in the disposable local PG while no-oping on real Supabase.
- New test file `supabase/tests/services_media.sql`: seed parity, public-vs-inactive RLS, customer write rejection, admin RPC insert/merge/slug-upsert/audit, all 22023 validation rejects, direct-write CHECK/UNIQUE violations, backfill correctness + idempotency + legacy column preserved, lowest-sort_order primary convention, bucket config + idempotent upsert, and storage RLS (anon read/denied-write, customer denied, admin allowed in prefix only, customer UPDATE/DELETE no-ops).

Verification: `PATH=/tmp/pgtest/node_modules/@embedded-postgres/linux-x64/native/bin:$PATH python3 scripts/verify-database.py` — 23 migrations and 6 SQL test files all PASS (includes the parallel DB-1/DB-2 ticket's tax_requests files, untouched here).

Owner actions: apply `20260927230000` via `npx supabase db push --linked` (staging first, replay `supabase/tests/*.sql`, then production); afterwards the app wave can read `services` instead of hard-coded content and upload to the `product-media` bucket.

## Production Hardening — 2026-09-27

Method: mission brief executed as lead + parallel worker swarm. Baseline gates re-established on the untouched tree (npm ci, format, lint, typecheck, build — all pass), then four independent static verifiers audited database business logic, storefront correctness, admin/CEO console security+i18n, and tests/docs/error handling. Every PASS/FAIL finding below was confirmed against code; fixes were applied by workers with disjoint file ownership and re-gated.

Database / business logic (new migrations + tests):

- `supabase/migrations/20260927090000_sales_identity_discount.sql` — `orders.recorded_by` separates the staff recorder from `orders.user_id` (the customer); `record_sale` validates a linked customer account is active, snapshot-fills contact fields, and now takes **`discount_per_unit`** per line (the legacy `discount` key is rejected with 22023). Math verified: line discount `round(qty*dpu, 2)`, non-negative line gross, VAT-inclusive net, clamped order totals.
- `supabase/migrations/20260927100000_stock_publish_invariants.sql` — `record_stock_movement` enforces sign-per-type, zero-delta rejection and non-negative final stock under a per-variant `pg_advisory_xact_lock` + `SELECT ... FOR UPDATE`; `adjust_stock` serializes on the same lock key, so all stock mutation paths are race-safe. Publish invariants: active products require HE/EN names, an active category and at least one active variant with SKU+barcode; last-variant removal auto-unpublishes, category deactivation cascades to hidden — both audited. Transitions route only through `publish_product`/`unpublish_product`.
- `supabase/migrations/20260927110000_analytics_enquiries.sql` — client analytics INSERT policy no longer admits `sale`/`return` (financial events are service-role only; no client UPDATE/DELETE grants, so events are write-once); length caps added. Enquiry intake table with anonymous INSERT, caps and a fail-closed trigger forcing `status='new'`. Management analytics/summary RPCs re-issued as security-definer with role checks and `search_path=''`.
- `supabase/tests/hardening.sql` (428 lines) covers all of the above: linked/suspended/guest customers, discount math and legacy-key rejection, wrong-sign/zero/oversell movements, race-safe adjust, born-active rejection, last-variant auto-unpublish, anon tamper attempts, RPC authz, contact-config whitelisting.

Verification findings and fixes applied this round:

- **Sales API contract break (critical, found by audit):** `src/app/api/management/sales/route.ts` still sent the legacy `discount` key, so every management sale would have been rejected. Now sends `discount_per_unit` (accepting `discountPerUnit`/`discount_per_unit`), validates `0 ≤ dpu ≤ unitPrice`, and maps `customer.userId` → `customer_id`. `sales-panel.tsx` line items renamed to per-unit semantics (label was already "Discount/unit") and gained a customer-account selector fed by the existing `GET /api/management/customers` endpoint, auto-filling contact fields.
- **Mock catalog reachable in production (critical, found by audit):** `getFallbackStoreCatalog` now returns an empty catalog when `NODE_ENV === "production"`; production DB errors/empty results render the honest empty state or `notFound()` instead of demo products/prices. Dev/demo behaviour and its disclaimer copy are unchanged.
- **JSON-LD injection (found by audit):** store detail page now escapes `<` as `\u003c` in the serialized structured data.
- **Dead detail-page UI (found by audit):** gallery thumbnails and variant radios were no-ops inside a server component. New client island `src/components/products/ProductDetailInteractive.tsx` owns image switching and variant selection, updating price/SKU and the variantId passed to `ProductDetailActions` (quote links carry the selected variant). The page itself stays server-rendered.
- **Raw Postgres messages to clients (found by audit):** all ten `errorResponse(error.message)` sites across `settings`, `inventory`, `tax`, `sales`, `suppliers` routes now log raw detail server-side and return opaque tokens (via `mapPostgresError` or the console+opaque pattern used by the publish path).
- **Admin shell CSS missing (found by audit):** the new `ManagementShell`/UI primitives had zero styles — fixed; see "Management shell CSS — 2026-09-27" below.
- **Nav badge vs access mismatch (found by audit):** audit read access for admins is intentional (transparency; audit is read-only for everyone), so the audit nav item no longer carries the CEO-only badge. Users and settings stay CEO-only (mutations CEO-gated, admins see read-only UI). Finance admins keep read access via `viewFinance`. The overview page now calls `requireRole(["admin","ceo"])` itself like sibling pages.
- **Lint hardening:** three `react-hooks/set-state-in-effect` errors fixed properly — sidebar collapse preference moved to a `useSyncExternalStore` localStorage store (hydration-safe via server snapshot), dialog/drawer first-open mounting moved to the sanctioned render-phase adjust pattern.

Verified PASS without changes: stock invariants, adjust_stock atomicity, publish-invariant parity with app code, analytics/enquiry tamper-proofing, contact config sourcing (env → `get_public_contact_config()` RPC, zod-validated, `.env.example` ships empty), no public checkout anywhere (enquiry-only CTAs), `/api/enquiries` hardening (same-origin check, zod caps, 5/min per-IP in-memory rate limit, honeypot + time-trap silent drops), all mutation routes gated by `withManagementAuth` + DB-level role checks, audit rows server-generated and client-unforgeable, en/he message-file parity (197 keys each, zero missing).

Commands run and status:

- `npm ci` — passed (0 vulnerabilities)
- `npm run format:write` / `format:check` — passed
- `npm run lint` (`--max-warnings=0`) — passed
- `npm run typecheck` — passed
- `npm run build` (production) — passed (static + dynamic routes prerender fine)
- `npx playwright test tests/enquiry.spec.ts` — 4/6 passed; see "Enquiry E2E Spec" entry (browser binary unavailable here)

- `npx playwright test` (full suite) — 22/22 passed (Chromium headless shell installed locally; enquiry browser tests, smoke, auth, redirects, axe all green)
- `python3 scripts/verify-database.py` against a disposable user-space PostgreSQL 18 (embedded-postgres binaries + extracted `psql` deb, no root) — all 20 migrations and all 4 SQL test files PASS, including `hardening.sql`. This pass caught and fixed two real defects:
  - `hardening.sql` itself never cleared the JWT claim GUC when switching to the `anon` role, so the fail-closed triage guard was never exercised (test bug — added `set_config('request.jwt.claim.sub','',true)`).
  - Regression in `20260927110000` (caught by `phase2_access.sql`): the new "Anyone can submit contact requests" policy dropped the active-account requirement, letting suspended customers create requests. Fixed by re-adding `auth.uid() is null or public.active_app_role() is not null` to the policy's WITH CHECK, plus `grant execute on function public.active_app_role() to anon` (RLS expressions evaluate as the invoking user; the function only exposes the caller's own role).

NOT run (environment lacks them):

- `npx supabase db push --linked` against staging/production: no linked project credentials on this machine. Owner action: apply the three 2026-09-27 migrations to staging first, replay `supabase/tests/*.sql` there, then production.
- `scripts/verify-admin-console.mjs` and live sale/enquiry inserts: need real Supabase credentials (no `.env.local` here).

Legal / privacy / accessibility notes:

- Enquiry form collects name/email/phone/message into `service_requests` — privacy notice and retention policy must reference this before real submissions are accepted (owner/legal).
- The in-memory per-IP rate limiter is per-instance only (ineffective across serverless/multiple instances); note for launch — acceptable for single-instance, revisit for scale.
- Shell a11y primitives shipped (focus trap, Escape, scroll lock, aria labels in both locales) but manual screen-reader/keyboard pass remains an owner action; new `management.css` visual check in a browser is pending.

## Enquiry E2E Spec — 2026-09-27

What changed:

- Added `tests/enquiry.spec.ts` covering the enquiry flow (`src/app/api/enquiries/route.ts` + `src/components/contact/contact-form.tsx`): `/en/contact` renders the form, client-side validation flags invalid input before submission, invalid payloads get the 400 `{ok:false, code, message}` envelope, honeypot submissions get the fake `{ok:true}` success, cross-origin `Origin` headers get 403, and the sixth POST within a minute from one IP gets 429.
- API-level tests follow the existing `request` + `origin: baseURL` convention from `tests/auth.spec.ts`. Each rate-limited test uses its own `x-forwarded-for` IP because the limiter is an in-memory per-IP bucket and the suite runs `fullyParallel`. The rate-limit test posts intentionally invalid bodies so no `service_requests` rows are written.

Commands run and status:

- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run format:check` — passed
- `npx playwright test tests/enquiry.spec.ts` — 4 API-level tests passed against the built server; the 2 browser tests could not launch (Playwright Chromium binary not installed in this environment, `NO_BROWSERS` marker present)

Remaining owner actions:

- Done 2026-09-27: Chromium installed (`npx playwright install chromium`); full suite green, see the "Production Hardening" entry above. The honeypot browser assertion was relaxed to `aria-hidden`/`tabindex` checks because the honeypot is intentionally bot-plausible (off-screen 1px clip, not `display:none`).
- No Supabase service client exists in the test fixtures, so the honeypot test asserts only the fake-success response; add a service-role DB check for the missing `service_requests` row if such a fixture is introduced.

## CEO Console Remediation — 2026-09-26

Method: lead architect audited the CEO surface with six parallel investigators (pages/interface, API logic, permissions, database, i18n, tests/docs), personally verified the top claims against code, then five implementation workers applied fixes with strict file ownership.

Root cause of the biggest defect: management write routes invoked self-authorizing RPCs (`set_tax_rate`, `set_business_setting`, `record_sale`, `record_stock_movement`, `adjust_stock`, `publish_product`/`unpublish_product`, `set_default_variant`) through the service-role client. Under service role `auth.uid()` is NULL, so the RPCs' `active_app_role()` checks always raised 42501 — live CEO tax settings, sales recording, stock movement, publish and default-variant actions were all dead ends returning 403.

What changed:

- All self-authorizing RPC calls now go through the user-context server client (`src/lib/supabase/server`), matching the existing `users/route.ts` pattern; reads stay on the service-role client. Route-level capability/same-origin checks unchanged.
- New migration `supabase/migrations/20260926100000_ceo_console_fixes.sql`: `add_ceo` sets `profiles.role='ceo'` (was `'admin'`) and rejects already-CEO targets instead of logging fake `ceo_added` events; one-time repair aligns existing CEOs' `profiles.role`; `delete_user_account` now deletes the `auth.users` row in the same transaction (atomic deletion; route-level `auth.admin.deleteUser` removed). `supabase/tests/ceo_controls.sql` gained assertions for all three behaviors.
- Removed duplicate route-level audit inserts (`user_updated`, `user_deleted`, `product_published`, `product_status_changed`) — the SQL RPCs already audit transactionally. Publish errors no longer leak raw Postgres messages into the API response.
- `/api/ceo`: no-op email change rejected (400); expired 120 s fresh-password window on delete now reports distinctly instead of "At least one active CEO must remain".
- Users management UI: role/status selects render the current value (previously filtered out → blank controlled select with silent one-tap PATCH) and now stage changes behind an inline bilingual Confirm/Cancel before any PATCH. Typed-DELETE user deletion preserved.
- Audit history UI: removed the fake "Demo User" user filter (was crashing the view with uuid column `eq "1"`); Load More now appends instead of overwriting; fixed operator-precedence bug that could show Hebrew in English mode; completed the bilingual action-label/filter catalog (tax, settings, stock, sale, publish, account, CEO actions); localized the record counter; `en-IL` date format.
- CEO settings UI: client-side password-match check, per-form busy state and styled success/error notices, verified-account hint on the add-CEO form.
- RTL sweep across all management components: physical Tailwind classes converted to logical (`text-start`, `ms/me`, `ps/pe`, `start-*`); search-icon offsets fixed.
- Product delete / variant archive now use themed, bilingual, keyboard-accessible two-step inline confirmation instead of native `confirm()` (note: variant re-activation no longer prompts — only archive is destructive).
- Tax modal: `role="dialog"`/`aria-modal`, Escape-to-close, focus return to trigger.
- Admin metadata fixed: `privateMetadata()` now uses `kind` (+bilingual section titles); all 11 section pages export noindex metadata (previously every admin page titled "My account").
- Localization: English-only placeholders/aria-label words localized; dates standardized to `he-IL`/`en-IL`.
- Ops: `verify-admin-console.mjs` exits 1 on missing credentials unless `--allow-skip`; OPERATIONS.md documents both CEO verification scripts and the `PLAYWRIGHT_REUSE` fix; ROUTES_AND_ROLES.md now states audit log is viewable by admin + CEO explicitly; package.json bumped to 0.0.3 (matches the 0.0.3 release commit).

Commands run and status:

- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run build` — passed
- `node scripts/verify-admin-console.mjs` against a production server on :3105 — passed 14/14 pages (EN + HE) via disposable admin sign-in
- `scripts/verify-database.py` — NOT run: no local PostgreSQL 17 binaries on this machine; the new migration + tests still need a real disposable-PG run and then `npx supabase db push --linked`

Remaining blockers / owner actions:

- **Push `supabase/migrations/20260926100000_ceo_console_fixes.sql` to the live project (`npx supabase db push --linked`) before the next deploy** — the users DELETE route now relies on the RPC to remove the auth.users row; deploying the route without the migration would leave orphaned auth users. Also run `scripts/verify-database.py` somewhere with PostgreSQL 17 first.
- The user-context RPC switch (tax/sales/inventory/publish) is verified by code review + lint + build, but not yet against the live DB — first live CEO action should be a low-stakes write (e.g., add tax rate) to confirm.
- Deferred by design (pre-existing): centralizing the console's 724 he/en ternaries into message catalogs, `/api/ceo` rate limiting, auth-user pagination past 1000 in users GET, role-aware admin nav for plain admins, CEO offboarding (remove_ceo/demote RPC), overview dashboard partial-render on partial query failures.
- Worker package-lock.json note: lockfile top-level version still says 0.0.2; it will self-sync on next `npm install`.

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
- NEW verification: `scripts/verify-admin-console.mjs` — drives a disposable real admin account through UI login and all 12 admin pages in EN plus 1 page in HE (RTL check) and 1 nav-link assertion (14 checks total), asserting no page errors / console errors / bad responses, then deletes the account. Run: `node scripts/verify-admin-console.mjs` (requires a server at ADMIN_BASE_URL or :3105 and `.env.local`; exits 1 if credentials are missing unless `--allow-skip` is passed).

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
- Real enquiry submission. (Superseded 2026-09-27: `/api/enquiries` + `contact-form.tsx` ship a real, hardened enquiry flow.)
- Real catalog/products/prices/checkout. (Superseded in part 2026-09-27: catalog and prices are DB-driven in production and the mock fallback is dev-only; checkout remains intentionally absent — enquiry-only commerce.)
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

## Management shell CSS — 2026-09-27

- Added `src/styles/management.css`: complete styling for the management shell (`mgmt-shell`, `mgmt-sidebar`, `mgmt-nav`, `mgmt-topbar`, `mgmt-account`, `mgmt-role-badge`) and all `src/components/management/ui/` primitives (drawer, dialog, metric-card, data-table, status/badge tones, page-header, toolbar, empty/error states, notice, skeleton shimmer, detail-panel, date-range picker, form-section, `mgmt-visually-hidden`). Previously these classes had zero CSS and the admin console rendered unstyled.
- RTL-aware: logical properties only; drawer slides from inline-start via a `--drawer-dir` variable flipped under `[dir="rtl"]`; collapsed sidebar driven by `[data-sidebar="collapsed"]`; sidebar/topbar sticky; sidebar hidden below 1023px with the topbar menu button opening the drawer.
- Imported from `src/app/[locale]/(protected)/admin/layout.tsx` (`import "@/styles/management.css"`).
- Fixed physical-property defect in `src/styles/workspace.css`: `.users-management__select` and `.sales-panel__variant-select` chevron "background-position: right ..." plus physical paddings converted to logical padding with `[dir="rtl"]` position overrides.
- Gates: npm run lint — passed; npm run typecheck — passed; npm run format:check — passed.
- Note: visual verification in a browser is still pending (owner/developer action before admin launch).

## Remote rollout + live verification — 2026-09-27

- Supabase CLI 2.118.0 authenticated; project linked: `ffzemicpwwxmxptuwevo` ("miro network and security solutions", eu-central-1, PostgreSQL 17.6).
- `npx supabase db push --linked` applied the four outstanding migrations to the live database: `20260926100000_ceo_console_fixes`, `20260927090000_sales_identity_discount`, `20260927100000_stock_publish_invariants`, `20260927110000_analytics_enquiries`. `npx supabase db lint --linked --fail-on error` — no schema errors. (No pre-push `db dump`: the CLI dump requires Docker, absent here; the pooler URL carries no password so a manual `pg_dump` could not connect. Owner note: enable scheduled backups / PITR in the Supabase dashboard if not already on.)
- `scripts/verify-admin-console.mjs` against a local production build with real credentials (`ADMIN_BASE_URL=http://127.0.0.1:3105`): PASS — 14/14 admin pages in EN + HE, settings navigation, disposable admin account cleaned up. The script's nav selector was updated for the new management shell (`nav.mgmt-nav` / aria-label "Management navigation").
- Live enquiry smoke: POST `/api/enquiries` returned `{ok:true}` and created the row with `status='new'`, `assigned_to=NULL` (fail-closed trigger confirmed on the live DB); the test row was deleted via the service key afterwards.
- Remaining owner actions: legal/privacy sign-off for stored enquiry data (docs/LEGAL_CHECKLIST_IL.md); revoke/rotate nothing needed — `.env.local` stays untracked.

## Architecture and management implementation handoff — 2026-09-28

- Added `docs/NEMOTRON_IMPLEMENTATION_PROMPT.md`: one detailed implementation prompt covering shared CEO/admin architecture, same-model sub-agent assignments, concrete shell/CSS/overlay/settings/supplier fixes, frontend/API/database contracts, customer/worker workflows, and acceptance tests. This is planning/documentation work; application code and database were not changed.
- Owner clarified that the previous intermittent error is currently absent. The handoff prioritizes the Suppliers layout, all management screens, and connected backend/customer/worker behavior; it requires regression monitoring without inventing an error diagnosis.
- Confirmed source findings include supplier desktop/mobile presentations both rendered without responsive visibility rules and missing supplier table CSS; settings consuming `is_current` while tax API returns `status`; initial loaders hiding HTTP failures; nested management main landmarks; overlapping sticky offsets; worker UI/API omitting the database-supported `waiting_customer` status; legacy saved-product media/price projection; and ignored partial customer-history query errors. Further authenticated visual and integration verification is explicitly assigned, not claimed complete.
- Commands: `npm run lint` PASS; `npm run typecheck` PASS. Read-only Chromium smoke against existing localhost:3000 at 1440×1000: `/en`, `/he`, `/en/store`, `/en/services`, `/en/contact` returned 200 with one main/h1, no measured document overflow and no captured page exceptions. Anonymous `/en/admin` and `/en/admin/settings` correctly redirected to login. No authenticated console test, production build, full E2E suite or database tests were run for this handoff.
- Remaining actions: implementing agent must verify/fix authenticated layouts and cross-role workflows using isolated fixtures; owner/legal must approve business facts and privacy/retention practices; accessibility reviewer must complete keyboard/screen-reader review. No live mutation or deployment was performed or authorized by this planning artifact.

## Management data-load permission fix — 2026-09-29

- Diagnosed the shared Requests, Analytics and Finance load failure against the linked Supabase project. All three protected GET routes invoke `check_rate_limit` with the server-only service-role client, but the limiter migration granted function execution only to `anon` and `authenticated`; the live diagnostic returned PostgreSQL `42501` (`permission denied for function check_rate_limit`) and each route consequently returned HTTP 503 before querying page data.
- Added `20260929120000_management_rate_limit_grant.sql`, granting `service_role` execution on that single `SECURITY DEFINER` function. No customer, request, analytics or finance records are changed, and browser roles retain no direct access to the backing rate-limit table.
- Extended `supabase/tests/tax_requests.sql` with a service-role limiter regression check.
- Extended `scripts/verify-admin-console.mjs` so its authenticated browser smoke fails on the localized Requests, Analytics and Finance load-error states instead of accepting an HTTP-200 page shell as success.
- Deployment and verification: `npx supabase db push --linked --include-all` applied the migration; `npx supabase migration list` shows `20260929120000` locally/remotely; a live service-role RPC probe returned `{allowed:true,error:null}`; `npx supabase db lint --linked --fail-on error` passed with four pre-existing function warnings; `npm run typecheck`, `npm run lint` and `npm run build` passed.
- Authenticated browser verification against the local production build passed `/en/admin/requests`, `/en/admin/analytics` and `/en/admin/finance` without their localized load-error states. The broader smoke then stopped on an unrelated, pre-existing `/en/admin/inventory` API HTTP 400; owner/developer action: diagnose Inventory separately. Both disposable admin accounts created by the smoke runs were deleted.
- Legal/privacy/accessibility: no displayed data or UI semantics changed. Existing owner/legal action remains to approve retention and access practices for enquiry, analytics and financial data; developer/owner action remains to complete authenticated role/access and manual accessibility review before launch.

## Product media, reporting, and settings UX polish — 2026-09-29

- Product management now reads the canonical `product_images` relationship and derives the primary thumbnail from the lowest `sort_order`; newly uploaded, URL-added, reordered, or promoted images therefore appear in the management table instead of relying on deprecated `products.image_url`. The table also has an accessible no-image state and locale-formatted last-updated dates.
- The product media editor now announces successful auto-saves with a green check treatment, updates its image count immediately, and fixes URL-image ordering so the first URL image receives sort order zero. The main product save action has an explicit animated green saved state, with animation disabled under reduced-motion preferences.
- Analytics now surfaces an accessible daily-activity visualization plus top-search and viewed-category rankings. Finance now uses the shared page/date components, sends inclusive ISO date boundaries, implements a bounded true all-time range from the first order, improves stale-data retry feedback, and retains the non-accounting disclaimer. CEO settings now use clearer security cards, icons, descriptions, loading feedback, and semantic labels.
- Localization/accessibility: added bilingual Hebrew/English copy, logical CSS properties, explicit RTL/LTR field direction, tabular numeric treatments, semantic dates, polite save status announcements, keyboard-compatible controls, and reduced-motion handling. UTF-8 continues through the existing source/database stack; no encoding conversion or lossy normalization was added.
- Commands: `npm run lint` PASS; `npm run typecheck` PASS; `npm run build` PASS; `git diff --check` PASS. The first `node scripts/verify-admin-console.mjs` attempt correctly stopped at its server-reachability preflight. Rerun against the local production server passed the EN overview, requests, analytics, finance, and products pages without captured console errors, then stopped on the documented pre-existing Inventory API HTTP 400 before reaching later pages; its disposable admin account was deleted. Authenticated product editing and settings screen-reader verification remain pending.
- Owner/legal launch actions: approve analytics retention/privacy language and access policy; treat finance as an internal managerial view only until an accountant approves official reporting; approve catalog imagery, alt text, prices, and publishing claims. Accessibility owner action: complete authenticated keyboard and screen-reader testing in both locales and all three themes.

## CEO interface cohesion and product image containment — 2026-09-29

- Corrected shared metric-card grid placement: supporting text spans the card instead of collapsing into the icon column. Refined numeric weight, label hierarchy, icon size and contrast. Added the missing shared panel styles used by finance, customer details and CEO security, plus consistent settings headings and security-card spacing.
- Customer search now uses the shared search control with explicit logical padding; product quick-view photos have a positioned, clipped visual container and contain sizing.
- Replaced analytics and finance gradients with shared daily charts featuring numeric axes, dates, legends, exact-value tables and horizontal scrolling. Analytics adds activity totals, active-day/peak-day context, freshness time and a viewed-products metric; finance adds average gross order value. Daily aggregate granularity is stated explicitly, without inventing hourly data.
- Replaced settings' error-styled loaders with neutral status feedback and resolved indefinite loading when optional settings rows are absent. Existing defaults remain editable; no settings are saved automatically.
- Checks so far: `npm run lint`, `npm run typecheck`, `npm run build` PASS. Authenticated desktop/mobile visual verification is in progress; final results follow below.
- Launch owners: owner/legal still must approve imagery, analytics retention and business claims; accountant must approve any official financial use; accessibility reviewer must complete manual assistive-technology review. No new tracking or schema changes.
- Chart review additionally found `v_product_daily_metrics` returns one row per product/day/event type, while the API replaced earlier rows with later ones. Added a pure aggregation helper that sums event counts and omits invalid dates and non-additive distinct-user/session fields from daily groups (top-level unique metrics are unchanged). Regression tests cover multiple products and empty/null rows. `node --test tests/unit/analytics-daily.test.mjs` PASS (2 tests); initial native TypeScript test attempt failed because this Node build lacks TypeScript stripping, so the test uses the already-installed TypeScript compiler.
- First authenticated browser pass verified all 14 management route layouts at 1440px and the five primary screens at 390px in English light/medium, plus desktop dark. No measured horizontal overflow, narrow metric footers or stuck settings loaders. A later Chromium session closed unexpectedly; its disposable account was removed, and verification is being resumed with fresh pages to limit browser memory.
- Final visual pass additionally verified the five primary pages in Hebrew at 1440px/390px in light, medium and dark. Analytics/settings automated axe checks reported no violations; customer mobile cards exposed invalid article/listitem roles, now corrected to valid list items. The chart scroll region explicitly uses LTR chronology so its numeric axis starts in view even in Hebrew.
- A read-only finance response fixture verified positive, zero and negative daily values and the expandable exact-value table. Actual catalog photography loaded successfully in the quick-view modal and measured inside its visual column. Screenshots remain local in `/tmp/miro-ui-review` (not committed).
- Final verification: `npm run lint` PASS; `npm run build` PASS including TypeScript; `git diff --check` PASS; aggregation regression suite PASS (2/2). Final authenticated dark-theme regression passed overview, finance, analytics, settings and customers in EN/HE at 1440px and 390px. Combined with prior passes, all three themes and both locales were reviewed. Scoped axe checks for analytics, settings and customers all returned zero violations. Finance signed-value fixture PASS; actual-photo popup containment/loading PASS, plus EN/HE mobile containment and Escape dismissal PASS. All disposable test accounts and the temporary browser script were removed; no catalog, settings or financial records were changed by tests.
- Verification limitations: layout checks of the other nine management routes do not certify every CRUD workflow. Existing Inventory data/API concerns recorded above are not resolved by this design pass. Production navigation emitted `DYNAMIC_SERVER_USAGE` server diagnostics without failing the checked pages; developer follow-up remains for those existing rendering diagnostics. Manual screen-reader review and owner/legal/accounting approvals remain launch actions.

## Version 0.0.4 release preparation — 2026-09-29

- Owner explicitly requested committing all accumulated changes, creating/pushing branch `0.0.4`, and merging/pushing it to `main`. Created the release branch from `main` after fetching origin and confirming local/remote main matched; bumped package.json and package-lock.json from 0.0.3 to 0.0.4.
- Release scope includes the accumulated CEO shell, overlays, suppliers/settings/reporting UI, product editor/media feedback, shared pricing and canonical saved-product data, public services/catalog integration, inventory visibility, account/auth/enquiry improvements, management API validation/rate limiting, three database migrations, analytics aggregation regression tests, and design/handoff documentation. Existing work was preserved and included as explicitly requested.
- Release validation: `npm run lint`, `npm run typecheck`, `npm run build`, and `node --test tests/unit/analytics-daily.test.mjs` all passed. Staged credential-value scan passed. Staged whitespace check identified one extra trailing blank line in the new limiter migration; it was removed without changing SQL. Final merge/remote verification is recorded in the release completion entry below.
- Boundaries: `.env.local`, generated output and local test artifacts remain ignored. Committing migrations does not apply them to additional database environments. Owner/legal/accounting sign-off and manual accessibility review remain launch requirements; documented inventory data and server rendering diagnostics remain developer follow-up.

## Version 0.0.4 local merge verified; remote publication blocked — 2026-09-29

- Committed all 92 release files as `368598e` on branch `0.0.4`; merged into local `main` with merge commit `b31ba1d`. Verified release ancestry with `git merge-base --is-ancestor 0.0.4 main` and identical release/merge trees with `git diff --exit-code main 0.0.4`. Re-ran `npm run build` on main: PASS including TypeScript/static generation. Pre-merge lint, typecheck, regression tests and staged whitespace checks also passed.
- `git push -u origin 0.0.4` failed: GitHub rejected terminal username/token authentication. The connected GitHub app can read this repository, but its tree-write endpoint returned HTTP 403 `Resource not accessible by integration`; no remote content was uploaded. A read-only `git ls-remote` confirmed remote main remains `fd61309ef9c75a8a85b332f09d8fb13eaef3b3ad`, and remote branch `0.0.4` is absent.
- Owner action: configure working GitHub write credentials locally (do not paste tokens into chat), then resume publication. Agent action after authentication: fetch/reconcile any new upstream work without force pushing; push `0.0.4` and main; verify remote branch SHAs, release ancestry and version 0.0.4 on remote main. The local merge/build is verified, but remote publication/merge must not be described as completed yet.
- Legal/privacy/accessibility launch actions remain unchanged from the release preparation entry. This Git operation did not apply database migrations or certify a deployment.

## Version 0.0.4 remote publication verified — 2026-09-29

- Authenticated GitHub CLI through browser device flow as repository owner; no token was added to repository files. Pushed local branch `0.0.4` and local merged `main` to `origin` without a force push.
- Verified directly with `git ls-remote origin`: `refs/heads/0.0.4` = `368598ece69fc489ab4d928a04261d8a5d020a21` and `refs/heads/main` = `dcc83d82ceb369e99c6b445fb8bc8f25a16f8ae7` before this final handoff-log commit. `git merge-base --is-ancestor origin/0.0.4 origin/main` passed and the remote main package version is `0.0.4`. Main was built successfully after the merge; prior lint, typecheck and regression tests passed.
- This entry supersedes the temporary remote-authentication blocker above. Owner/legal/accounting and manual accessibility approvals remain launch actions; committing these migrations did not deploy them to a new database.
## GitHub sync retry — 2026-09-29

- Fast-forwarded `hardening/ceo-production-2026-09-26` from `fd61309` to `1071dea` (`origin/main`), bringing in four additional upstream commits.
- Preserved and reapplied the existing local script edit. The prior sync note was reconciled with the newer upstream project-status history; no application-code conflicts occurred.
- Commands: `git fetch origin`, `git merge --ff-only origin/main`, `git stash pop` — passed after resolving the documentation-only conflict.
- Validation: repository status confirms `HEAD` matches `origin/main`; full lint/typecheck/build were not rerun for this sync. Owner/developer action: run the project verification gates before release.
# Storefront merchandising implementation milestone — 2026-09-30

What changed:

- Added the missing `/[locale]/admin/storefront-merchandising` page, protected on the server for Admin and CEO users, and added the missing CSS module required by the merchandising screen.
- Reworked the product hover preview lifecycle so the 430 ms fine-pointer intent delay is real, open/close/rotation timers are cleaned up, Escape dismisses it, and explicit opening returns focus to its trigger.
- Added a separate coarse-pointer quick-preview control without changing the primary product-media link behavior; normal product taps still navigate to the canonical product page.
- Hardened category icon URLs: external icons must use HTTPS, credential-bearing URLs are rejected, and external SVGs must go through the sanitized upload flow. Storage cleanup now deletes only validated MIRO-owned category objects.
- Wired product detail pricing to raw catalog price, role override, public promotion, and compare-at price inputs. This prevents discounting the already-discounted server display price a second time and lets variant selection recalculate consistently.
- Extracted shared discount-percentage calculation to `src/lib/catalog/pricing.ts`.

Why it changed:

- Review found that the hover preview rendered immediately despite the stated intent delay, the merchandising navigation pointed to a route that did not exist, and the component imported a missing stylesheet that only became visible once the route was restored.
- Product detail had promotion-capable props but the server page did not pass the promotion inputs, while external SVG URLs bypassed the sanitizer used for uploaded SVG files.

Commands run and status:

- `npm run lint` — passed with zero warnings.
- `npm run typecheck` — passed.
- `git diff --check` — passed.
- `npm run build` — initially failed because `storefront-merchandising.module.css` was missing; passed after the module was added. The build now includes both localized merchandising routes.

Pricing decision recorded:

- Current behavior intentionally applies an active public promotion after the resolved role/default/selected-variant price. This preserves the pre-existing resolver policy. The business owner must approve whether role-specific prices may stack with public promotions before launch.

Remaining blockers / owner actions:

- **Engineering:** the merchandising table renders, but its add/edit/delete confirmation dialogs are not yet mounted in `storefront-merchandising.tsx`; several dialog-related state values and handlers remain unused. Complete and validate those workflows before calling management CRUD production-ready.
- **Engineering/QA:** perform browser testing for the hover-preview pointer bridge, touch quick-preview, keyboard focus return, RTL placement, reduced motion, and 320 px layouts. Static checks pass, but this interaction needs device and assistive-technology verification.
- **Privacy owner:** externally hosted category icons can disclose visitor IP/user-agent data to third-party hosts. Prefer uploading icons into MIRO-owned storage and document any approved external processors.
- **Accessibility owner:** the preview is a non-modal supplemental dialog and does not trap focus. Confirm the interaction with VoiceOver/NVDA and ensure the touch control's accessible name is clear in both locales.
- **Legal/business owner:** promotional claims, badge labels, discount stacking, dates, base prices, and inventory statements require owner approval; do not publish preview catalog data as final offers.

## Storefront merchandising interaction and admin completion — 2026-09-30

What changed:

- Rebuilt the product preview lifecycle around a 360 ms hover-intent delay, 220 ms pointer-bridge grace period and 140 ms exit animation. The preview now collision-checks against the viewport, repositions after its entrance animation, rotates media only when motion is allowed, closes with Escape and restores focus after an explicit keyboard/touch opening.
- Rebuilt the featured-product rail around measured card geometry instead of an estimated percentage transform. It now loops without a visible jump, preserves animation position while paused, exposes a labelled pause/play control, stops on hover/focus, becomes a snap-scrolling static row for reduced motion or small data sets, and removes its visual duplicate from the accessibility tree and tab order.
- Refined product-card composition, responsive media ratios, pricing hierarchy, promotion stickers, focus states, shadows and small-screen quick preview. Preview intent is scoped to product media so unrelated card actions do not unexpectedly open it.
- Connected the public rail to explicitly managed `storefront_rail_items` ordering and schedules instead of treating every generic featured product as rail content. Badge rendering now consumes the stored shape, tone and icon configuration shared by the public storefront and management preview.
- Completed the previously missing Admin/CEO merchandising dialogs: product search/add, rail activation and date windows, badge creation/editing/assignment/priority/removal, promotion creation/editing/deletion, and confirmation states. Refreshes retain the current screen, and reorder failure rolls back the first write when the second swap cannot be saved.
- Aligned API and migration validation: promotion percentages are capped at 95%, badge enums match the five rendered designs, date-window ordering is checked server-side, and the rail API no longer queries the nonexistent `products.sku` column.
- Added focused Playwright coverage for hover timing/dismissal, viewport containment, stable rail cloning and pause state, touch quick preview, reduced motion, horizontal overflow and automated WCAG A/AA checks.

Commands and evidence:

- `npm run lint` — passed with zero warnings.
- `npm run typecheck` — passed.
- `git diff --check` — passed.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 PLAYWRIGHT_REUSE=1 npx playwright test tests/store-merchandising.spec.ts --reporter=line` — 5/5 passed against the development fallback catalog.
- The production-mode browser run correctly exposed the first deployment boundary: the connected database does not yet contain `categories.icon_image_url`, so production deliberately returns an empty catalog rather than mixing database and fixture content. The interaction tests cannot exercise cards or the rail there until the pending catalog/storefront migrations are applied.

Remaining blockers and owners:

- **Database owner:** link the intended Supabase environment, review and apply the pending catalog/category and `20260929130000_storefront_merchandising.sql` migrations, then rerun the production-mode storefront and authenticated management CRUD flow. Do not advertise the rail or promotion controls as live before this is complete.
- **Business/legal owner:** approve all prices, compare-at claims, percentage/fixed promotion rules, stacking with role pricing, badge wording, campaign schedules and inventory statements before publication.
- **Privacy owner:** replace externally hosted category/product media with MIRO-controlled storage where possible; third-party media hosts receive visitor network metadata.
- **Accessibility owner:** automated WCAG A/AA checks pass and reduced-motion/keyboard mechanics are implemented, but manual VoiceOver/NVDA, zoom, RTL and real touch-device review remains required before launch.

## Connected product gallery and compact management tables — 2026-09-30

What changed:

- Moved the product quick preview from a left/right side placement to a centered overlay above and over its source card. The entrance now uses a bottom-origin perspective/rotate/translate animation so the panel visually lifts from the card; reduced-motion users still receive an immediate transition.
- Added an ordered image gallery to the quick preview: square main image, vertical thumbnail choices, physical left/back and right/forward controls, image position announcement and stable pointer bridging between the source card and overlay.
- Added the same quick-preview interaction to canonical cards in the moving product rail. The accessibility-hidden loop clone remains out of the tab order and does not create a second dialog; the measured two-segment animation continues seamlessly so cards leaving on the left re-enter from the right.
- Reworked the product detail gallery into a square primary image with side thumbnails on larger screens, horizontal thumbnails on small screens, previous/next controls and a live image count. All surfaces use the same ordered `product_images` records, where the lowest `sort_order` is the main image.
- Kept product media management connected to the existing canonical Admin/CEO workflow: multi-file upload, URL addition, main-image selection, ordering, bilingual alt text and deletion all write `product_images` through the protected management APIs.
- Improved the Admin/CEO product table so it requests up to 100 real catalog rows in catalog order, displays canonical primary media plus gallery count, derives stock from active variants, and uses compact icon actions with accessible hover/focus labels and a shared confirmation dialog.
- Fixed management SKU search so it queries `product_variants.sku` and combines matching product IDs with name/slug search instead of querying the nonexistent `products.sku` column.
- Limited development-only catalog fixtures to 10 products, made their inventory deterministic, and attached three existing local media assets so gallery behavior can be verified without inventing management records. Production and authenticated management screens continue to fail closed to real database data only.

Verification:

- `npm run lint` — passed with zero warnings.
- `npm run typecheck` — passed.
- `git diff --check` — passed.
- Focused storefront Playwright suite — 6/6 passed, covering above-card positioning, image selection/arrows, rail preview and looping structure, touch layout, reduced motion and WCAG A/AA automation.
- Desktop visual QA completed for the above-card preview and full product gallery in Chromium; no side-positioned preview or gallery overflow observed.

Remaining blockers and owners:

- **Database owner:** this checkout is not linked to a Supabase project, so no live records were invented or mutated. Link the intended environment, review/apply pending migrations, and validate the existing real products, variants, stock and image galleries through authenticated Admin/CEO workflows.
- **Catalog owner:** upload approved product-specific images and bilingual alt text; the ten local development fixtures and their generic media are demonstration data only and never render in production fallback mode.
- **Legal/privacy owner:** approve product photography rights, prices, availability and promotional claims; externally hosted image URLs disclose visitor network metadata, so MIRO-owned storage is preferred.
- **Accessibility owner:** automated checks pass, but manually verify gallery announcements, touch targets, zoom and screen-reader reading order in Hebrew and English before launch.

## In-place pressed-card expansion refinement — 2026-09-30

- Replaced the directional above-card preview motion with a true source-card expansion. Hover immediately compresses the product card with an inset pressed shadow, holds that feedback for exactly one second, then expands the richer card view from the source card's measured center and width/height ratios in a fast 190 ms perspective animation.
- The expanded surface is opaque and retains the source card's product identity, gallery, price, stock and primary action; it no longer reads as a separate side panel. Viewport clamping only adjusts the final position when the source card is close to a screen edge.
- Applied the identical press/hold/expand sequence to canonical moving-rail cards. The accessibility-hidden rail clone remains noninteractive, while the real rail pauses during interaction and continues its seamless loop afterwards.
- Reduced-motion behavior still removes the 3D transform. Explicit touch/keyboard quick-preview controls continue to open immediately rather than imposing a hover delay.
- Verification: lint, TypeScript and whitespace checks passed; the focused Playwright storefront suite passed 6/6, including pressed-state timing, in-place overlap, rail behavior, touch layout, reduced motion and automated WCAG A/AA checks. Desktop Chromium visual QA confirmed the expanded surface grows over the originating card.
- Launch actions remain unchanged: catalog owner supplies approved media/content; accessibility owner performs manual screen-reader, zoom and device testing; database owner applies the pending migrations and validates authenticated live data.

## Storefront schema-drift compatibility fix — 2026-09-30

- Fixed the public catalog read so the core `categories` query no longer requires the pending `icon_image_url` column. Category icons are now fetched as optional merchandising data; a missing column produces `null` icons without discarding the real catalog.
- Made the new promo-badge, public-promotion and moving-rail reads optional at the catalog boundary. Missing additive merchandising tables now yield empty enhancement data while errors from core categories, products, variants or images still fail closed and remain visible.
- This removes the `column categories.icon_image_url does not exist` console error from product-page metadata generation during a staggered application/database rollout. The database migration remains required to activate the merchandising features.
- Verification: `npm run typecheck` passed; `npm run lint` passed with zero warnings; `npx prettier --check src/lib/store-data.ts` passed; `npm run build` passed. A local production server returned HTTP 200 for `/en/store` and `/en/store/cameras/miro-4k-pro`, emitted the expected product title, and logged no catalog error.
- Database owner action: this checkout is not linked (`npx supabase migration list` returned `ProjectRefNotLinkedError`). Link and verify the intended environment, review/apply `20260929130000_storefront_merchandising.sql`, then test category icon and authenticated merchandising CRUD behavior against real data.
- Legal/privacy/accessibility: no data collection, permissions, claims or interaction semantics changed. Existing owners must still approve promotion/pricing claims and external media privacy, and complete manual bilingual assistive-technology testing before launch.

## Storefront rail and gallery regression recovery — 2026-09-30

- Diagnosed why the recent storefront work appeared to disappear after the schema-drift fix: the connected database has no `storefront_rail_items` table, only four `product_images` rows across six active products, and the catalog mapper discarded a distinct legacy `products.image_url` whenever one canonical gallery row existed.
- Restored a rollout-safe moving rail. When the managed rail table is unavailable, real products already marked `is_featured` populate the rail in catalog order; once the table exists, its explicit assignments remain authoritative, including an intentionally empty rail.
- Restored all available real product media by merging distinct canonical `product_images` with the legacy product image instead of choosing one source. Canonical images retain priority and duplicate URLs are not repeated. This gives `miro-4k-pro` two selectable images again and preserves the image placeholder for products that genuinely have no media.
- Verification: both live image sources returned HTTP 200 JPEG responses; `npx prettier --check src/lib/store-data.ts`, `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check` passed. Local production requests returned HTTP 200 for `/en/store` and `/en/store/cameras/miro-4k-pro`; rendered HTML contained the animated three-product rail, pause control, two gallery thumbnails, previous/next controls and two distinct optimized image sources. The focused Playwright moving-rail/hover-preview test passed against the production server.
- Catalog owner action: four live products still have only one available image and two have none. Upload approved multi-angle product media and bilingual alt text through the canonical Admin/CEO product gallery; the application must not invent product photography.
- Database owner action: apply `20260929130000_storefront_merchandising.sql` to enable explicit rail ordering, category icons, badges and promotions. Until then, the featured-product fallback keeps the public rail functional.
- Security owner action: a local environment parsing diagnostic accidentally printed the Supabase service-role credential into the agent execution log. Rotate that service-role secret immediately and update deployment/local secrets; the credential is not copied into source or this document.
- Legal/privacy/accessibility: confirm rights for the external CCTV/Unsplash product images and prefer MIRO-owned storage because external hosts receive visitor network metadata. Manual bilingual keyboard, screen-reader, zoom and real-device gallery review remains a launch blocker.
