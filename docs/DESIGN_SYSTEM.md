# Design System

## Motion and Version 2 appearance — 2026-10-02

This entry supersedes older palette and metric-card geometry descriptions for active Version 2. Version 1 remains restorable from CEO Settings; retain all original layers and the immutable token snapshot.

- The central motion contract and operating guide are in `docs/ANIMATION_SYSTEM.md`. All 13 presentation effects start enabled, alongside the master switch and enhanced-appearance switch. Every effect has a bilingual explanatory note. Reuse duration/easing tokens, region skeletons, decode-aware images and accepted-navigation feedback; honor reduced motion.
- Public layers finish with `appearance-v1.css`, `customer-evolution.css` and `motion.css`. Version 2 public Light uses warm `#f1f2ed` background, `#fafbf7` surfaces, `#202821` text, `#515d53` muted text, `#765512` gold text/focus and `#e8bd42` primary controls. Dark uses calm charcoal/gold; Mid is a distinct softer blue-gray. Public colors exclude management surfaces.
- Protected Admin adds `console-evolution.css` and `insights-refinement.css` after its existing layers. Keep its Dark palette unchanged. Shape/spacing/icon refinements center components within a 104rem management frame. Only Light/Medium receive calmer reading surfaces.
- Version 2 report metrics use icon, content and supporting footer rows. Use `InsightCard` for interpretation, localized definitions and links. Activity charts retain exact-value accessibility and honest aggregation.
- All new visual overrides must be gated by `data-appearance-version="2"`. Restoring Version 1 applies original public tokens before hydration and leaves catalog, stock, orders and owner content intact. Do not alter the immutable backup through a generic settings save.
- Layout checks cover Hebrew/English and 320/390px phones, tablets and desktops. Table width remains based on real controls; scrolling and bounded pagination preserve readable identifiers. Never hide functional content to fit a viewport.

## Premium storefront system — 2026-09-21

These rules supersede earlier sizing and placeholder notes below.

- Active shared styles load in order: `src/app/globals.css`, `src/styles/premium.css`, `src/styles/experience.css`, `src/styles/storefront.css`. The last three separate shared brand/navigation, public editorial pages and catalog-specific presentation. Unrelated canvas styles remain unchanged.
- Shared outer frame: 112rem maximum, 2rem desktop / 1rem phone gutters. Store and marketing pages use this full frame; reading panels stay around 58rem, and paragraph measures remain narrow inside wider sections.
- Preserve Hebrew RTL and English LTR. Prefer logical spacing/positioning, mirrored directional arrows and localized accessible control names. All content stays available at 320px and in short landscape viewports.
- **Theme mapping (2026-09-29)**: Three modes — `light`, `medium`, `dark`.
  - **Light** (`light`): Clean cool white (#f7f8fa background). Preserved from previous Light.
  - **Mid** (`medium`): Former Dark appearance — neutral charcoal (#090b0d background, #121518 surface). Primary yellow #ffca28 with dark text.
  - **Dark** (`dark`): New high-contrast theme — pure black (#000000 background, #080808 surface), luminous gold (#ffd700), neon turquoise (#00ffe0). Inspired by VS Code High Contrast Dark. User-facing labels: "Dark theme — high contrast" / "מצב כהה — ניגודיות גבוהה".
- Shared header uses a geometric MIRO brand, five main destinations, a button-operated category disclosure and direct dark/mid/light controls. The mobile menu and category disclosure support Escape/focus return. Search submits to localized Store and preserves its query.
- Keep public content server-rendered; client islands are for navigation, theme, search/filter/sort and forms. Avoid extra runtime libraries, perpetual animation and hover-only features. Respect reduced-motion preference.
- Use the existing local security studio image for premium photographic heroes; original SVG hardware illustrations are category concepts, not exact manufacturer product photography. Keep illustration/sample content disclosed. Do not add fabricated reviews, partner endorsements, customer counts, guaranteed support hours or delivery times.
- Shared public sections live in `src/components/public/experience-sections.tsx`. Edit bilingual content at its source arrays; this structure is ready for later approved content integration, not an implemented CMS.
- Catalog cards and product details expose consistent cart actions. The header cart leads to a review page and a checkout-request form; keep the UI explicit that payment, stock reservation and final delivery pricing are not yet online. Real payment commerce remains separate engineering work.
- Run production smoke tests and `DESIGN_BASE_URL=http://127.0.0.1:<port> node scripts/verify-design.mjs`. The browser script exercises both locales, all three themes, five viewport widths, keyboard/menu/theme behavior, reduced motion and representative axe checks.

## Tokens

Runtime source of truth: `src/app/globals.css`. Files under `src/styles/` **are** the active palette for their respective layers (premium.css for header/footer, experience.css for editorial, storefront.css for catalog, workspace.css for management).

## CSS Ownership & Spacing Contracts — 2026-09-29

### Stylesheet responsibilities

- **globals.css**: Foundational semantic tokens (colors, radii, shadows, spacing), base controls, `.miro-container`, `.miro-auth-panel`, `.miro-page-shell`, `.miro-page-panel`, `.miro-split-panel`, `.miro-contact-layout`, `.miro-visual-grid`, `.miro-visual-tile`, `.miro-rich-panel`, `.miro-stat-grid`, `.miro-feature-grid`, `.miro-steps-grid`, `.miro-card`, `.miro-button`, `.miro-input`, `.miro-site-header`, `.miro-brand-mark`, `.miro-nav-link`, `.miro-product-menu-link`, `.miro-icon-action`, `.miro-product-subnav-link`, `.miro-search-input`, `.miro-product-grid`, `.miro-desktop-action`, `.miro-hero`, `.miro-eyebrow`, `.miro-store-highlight-row`, `.miro-store-hero-section`, `.miro-store-package-band`, `.miro-store-trust-section`, `.miro-store-brand-row`, `.miro-store-category-hero`, `.miro-service-card`, `.miro-mini-grid`, `.miro-service-grid`, `.miro-heading`, `.miro-section-heading`, `.miro-business-inner`, `.miro-details-grid`, `.miro-contact-band`, `.miro-step-number`, `.glass-panel`, `.canvas-container`, `.canvas-scrollbar`, `.selection-highlight`, `.snap-line-active`, `.minimap-viewfinder`, `.active-tool-pill`, theme switch primitives, focus-visible base, reduced-motion/prefers-contrast media queries.
- **premium.css**: Public header/footer chrome (`.premium-topbar`, `.premium-header`, `.premium-footer`, `.premium-brand`, `.premium-desktop-nav`, `.premium-nav-link`, `.premium-nav-disclosure`, `.premium-disclosure-button`, `.premium-dropdown`, `.premium-header-actions`, `.premium-icon-button`, `.premium-language`, `.premium-quote-action`, `.premium-theme-selector`, `.premium-header-search`, `.premium-mobile-search`, `.premium-mobile-toggle`, `.premium-mobile-navigation`, `.premium-mobile-shortcuts`, `.premium-footer-main`, `.premium-footer-brand`, `.premium-footer-column`, `.premium-footer-consult`, `.premium-footer-bottom`, `.premium-footer-legal`, `.premium-preview-label`, `.premium-account-menu`, `.premium-account-trigger`, `.premium-account-dropdown`, `.premium-account-header`, `.premium-account-avatar`, `.premium-account-info`, `.premium-account-primary-action`, `.premium-account-secondary-action`, `.premium-account-logout`). Theme tokens for three modes (dark/medium/light) including `--header-sticky-offset` for sticky coordination.
- **experience.css**: Marketing/services/about/contact/legal editorial layouts.
- **storefront.css**: Catalog and product-detail presentation (`.sf-storefront`, `.sf-hero`, `.sf-departments`, `.sf-collection-section`, `.sf-catalog-toolbar`, `.sf-search`, `.sf-sort`, `.sf-category-filters`, `.sf-catalog-summary`, **`.sf-catalog-grid`**, `.sf-product-card`, `.sf-product-media`, `.sf-product-body`, `.sf-product-actions`, `.sf-empty`, `.sf-load-more`, `.sf-preview-note`, `.sf-product-dialog`, `.sf-bundle-section`, `.sf-assurance-grid`, `.sf-guide-section`, `.sf-faq-section`, `.sf-category-hero`, `.sf-category-help`, **`.sf-product-detail-layout`**, `.sf-product-breadcrumb`, `.sf-breadcrumb`, `.sf-product-main`, `.sf-product-gallery`, `.sf-main-image`, `.sf-thumbnail-strip`, `.sf-thumbnail-list`, `.sf-thumbnail-item`, `.sf-thumbnail`, `.sf-product-info`, `.sf-product-price-block`, `.sf-price-display`, `.sf-variant-fieldset`, `.sf-variant-chips`, `.sf-variant-chip-label`, `.sf-variant-radio`, `.sf-variant-chip`, `.sf-variant-swatch`, `.sf-variant-sku`, `.sf-product-short-description`, `.sf-product-actions-detail`, `.sf-action-contact`, `.sf-action-secondary`, `.sf-action-link`, `.sf-product-disclaimer`, `.sf-product-specs`, `.sf-product-warranty`, `.sf-product-description-section`, `.sf-description-content`).
- **management.css**: Management shell and shared management primitives (`.mgmt-shell`, `.mgmt-sidebar`, `.mgmt-topbar`, `.mgmt-nav`, `.mgmt-drawer`, `.mgmt-dialog`, `.mgmt-button`, `.mgmt-metric-card`, `.mgmt-table`, `.mgmt-status-badge`, `.mgmt-page-header`, `.mgmt-toolbar`, `.mgmt-empty-state`, `.mgmt-error-state`, `.mgmt-notice`, `.mgmt-skeleton`, `.mgmt-detail-panel`, `.mgmt-date-range`, `.mgmt-form-section`, responsive breakpoints at 1023px/767px/639px).
- **workspace.css**: Legacy feature styling until deliberately migrated (overview-panel, inventory-manager, suppliers-manager, settings-panel, sales-panel, sales-history, customers-manager, finance-dashboard, analytics-dashboard, users-management tables/cards, admin-console-header).
- **Feature CSS Modules** (e.g., `product-editor.module.css`): Feature-specific layouts only.

### Spacing & sizing contract

- Public wide frame: max-width 112rem (`--container-max` in globals.css).
- Desktop page gutters: 2rem (via `.miro-container` padding-inline).
- Phone gutters: 1rem (via `@media (max-width: 639px)` on `.miro-container`).
- Reading content: ~58rem maximum (`.miro-page-panel-narrow`).
- Paragraph measure: ~60–70ch (via `max-width: 58ch` on `.miro-split-copy p`, `.miro-contact-copy p`).
- Auth form panel: 28rem maximum (`.miro-auth-panel`).
- Card padding: 1rem phone, 1.5rem desktop (via `.miro-card` and responsive overrides).
- Component gaps: 0.5rem, 0.75rem, 1rem, 1.5rem, 2rem (standardized across components).
- Public section spacing: ~2.5rem phone, 4rem desktop (`--space-section`).
- Management section spacing: ~1.5–2rem (via `.mgmt-shell__main` padding).
- Primary controls: min-height 44px (`.miro-button`, `.mgmt-button`, `.premium-nav-link`, `.premium-disclosure-button`).
- Avoid tiny functional text to force content into narrow cards; use `minmax(0, 1fr)` and `min-inline-size: 0` on flex/grid children that must shrink.

### Sticky coordination contract

- **Public header**: Measures own height via `ResizeObserver` (border-box) → sets `--header-sticky-offset` on `:root`.
- **Product detail gallery**: `position: sticky; top: var(--header-sticky-offset, 120px)` with `@media (max-width: 68.75rem)` disabling stickiness.
- **Management topbar**: `position: sticky; top: 0; z-index: 40`; measures height via `ResizeObserver` (border-box) → sets `--mgmt-topbar-height`.
- **Product editor sticky bar**: `position: sticky; inset-block-start: var(--mgmt-topbar-height)`; measures height → sets `--mgmt-stickybar-height`.
- **Editor section nav**: `inset-block-start: calc(var(--mgmt-topbar-height) + var(--mgmt-stickybar-height) + 0.5rem)`.
- **Scroll margin**: `[data-scroll-target]` in management scope uses `--mgmt-sticky-stack-height` (topbar + stickybar + 1rem) for anchor clearance.
- For short screens, reduce or disable secondary stickiness rather than letting stacked bars consume usable viewport.

### Overlay contract

- **Portal mounting**: Management dialogs/drawers render into body-level portal (via `OverlayStackProvider`) to escape ancestor stacking contexts.
- **Topmost ownership**: Only topmost overlay handles Escape/Tab trapping; coordinated via `OverlayStack` context.
- **Scroll locking**: Reference-counted; original `body.style.overflow` restored only when final overlay closes.
- **Focus management**: Restores to connected opener element; sensible fallback (panel) if opener removed.
- **Nested dialogs**: Parent remains active and scroll-locked when child closes.
- **Native `<dialog>` coexistence**: Product card dialogs use native `<dialog>` with `close` event listener for lifecycle sync; management custom overlays use `useOverlayStack`.

### Theme system

- Three modes: `dark`, `medium`, `light` (defined in `premium.css` and `globals.css`).
- Default bootstrap prefers `dark` or `medium` from system preference; honors stored `localStorage.miro-theme`.
- Segmented switch control (D / M / L) in header.
- `--header-sticky-offset` token added per theme for sticky coordination.

## Premium Refinement (2026-09-20)

### Proportion Rules (Latest)

- Content width: 76rem maximum; 1rem mobile and 1.5rem larger-screen edge gutters.
- Spacing: `--space-section` 2.5/3/4rem, `--space-panel` 1.25/1.5rem. Use shared tokens before adding individual margins.
- Section type: `--type-section` 1.375/1.5/1.75rem. Card titles 1.125rem, descriptions and buttons 0.875rem. Hero 2/2.5/3rem. Font sizes respond at breakpoints; they do not scale with viewport width.
- Text measure: hero title 18ch, description 42ch; body copy in bands max 60ch. Layouts use minmax(0, 1fr) to accommodate translated content.
- Alignment: mobile hero and conversion bands centered; readable lists/cards follow language direction. Desktop text and actions align to the same container grid.
- Cards: desktop vertical icon/title/description, mobile compact icon beside title/description. Grid controls equal widths and row alignment; container query controls padding.
- Responsive image region participates in mobile layout using aspect-ratio; do not reintroduce arbitrary bottom/left offsets.
- Latest values above supersede older refinement sizing notes below.

- Typography: Heebo variable font, Hebrew and Latin subsets, via next/font in the locale layout. Body 16px; hero 36/42/56px at explicit breakpoints; no viewport-scaled type or letter spacing.
- Dark: background #090a0b, surface #141617, white foreground, #b9c0c2 secondary text.
- Light: background #f5f6f7, white surface, #080b0d foreground, #4b565b secondary text.
- Action yellow: #ffcf00 with near-black text. Teal: #63e6d0 dark / #006b60 light. Text gold uses separate contrast-aware tokens.
- Cards and controls use connected rounded rectangles from the shared radius tokens. Buttons keep at least 44px touch height. Page sections stay unframed unless they are actual item cards, rails or bands.
- Hero: black photographic band in both modes, responsive image positioning, no decorative frame. Generated equipment is illustrative and labeled accordingly.
- Motion: 180-220ms interaction transitions, 700ms one-time hero entrance. Only opacity/transform entrance animation; reduced motion overrides all animation and transitions.
- Performance: self-hosted variable font, responsive next/image delivery, preloaded hero, no new runtime dependency and no perpetual animation.
- Validation: `node scripts/verify-design.mjs` against a running server; 12 size/language/theme combinations plus axe, interaction and reduced-motion checks.

## Components

- Shared accessible primitives in src/components/ui/
- Layout components in src/components/layout/
- Feature-specific components in src/features/

## Reference Images

The user supplied two MIRO reference images on 2026-09-20: a dark black/charcoal/gold version and a softer light gray/white/gold version. Phase 1 now follows that visual DNA with semantic tokens, product-style cards, strong gold CTAs, responsive service tiles and a security-technology hero treatment. The user also supplied a store/e-commerce screenshot on 2026-09-20 as a layout reference for the Store page: hero banner, category strip, product cards, business-package band, trust/service row and brand slots. The images are references only, not copied production assets.

## Store Surface

- Public naming is Store / חנות. Internal component names may still say product because the cards represent products.
- Store navigation sits directly after Home in the header.
- Active navigation has two visible levels: Store stays highlighted for all `/store/*` routes and the active category subnav item is highlighted separately.
- Header, dropdown and store subnav active states are rounded button/pill states only. Do not reintroduce underline bars or underline shadows.
- Product cards currently use icon placeholders and stable image slots. Future CEO-managed product images, item names, inventory and catalog editing require the real admin/data layer; do not fake that backend in the public preview.

## Visual Rules

- Professional security technology aesthetic
- Confident typography, generous spacing
- Bright yellow actions and restrained teal secondary accents
- Clear service/product cards
- Practical conversion actions

## CEO reporting and shared panels — 2026-09-29

- Metric cards use named grid areas: content and trailing icon, followed by a full-width footer. Never allow supporting text to auto-place in the icon column. Use moderate label/numeric weights and contrast-aware accent text.
- Use `mgmt-card` / `mgmt-card--padded` for bordered management panels and shared toolbar search classes for icon-safe RTL/LTR input padding.
- Reporting charts use the shared `ActivityChart`: labeled axes and legends, scrollable dates, accessible exact-value tables, and honest aggregate granularity. Do not fabricate hourly detail from daily totals or represent zero as a positive bar.
- Next Image `fill` requires a positioned media parent. Product popup images must remain contained in `.sf-dialog-visual`, without overlapping the copy column.
- Missing optional settings rows must resolve to editable defaults; loading UI uses a neutral status, while failures use actual error feedback.

## Catalog controls and price hierarchy — 2026-10-01

- Keep action buttons at least 44px tall, with rounded corners, visible focus rings, and a clear gap from adjacent controls. On small phones, show a single product card per row so its price, stock and actions have room.
- Public product prices show the VAT-inclusive amount first and a smaller VAT-exclusive amount below. Keep stock quantity beside the price, using the shared `StockIndicator` so cards, previews and details share accessible status wording.
- Stock colors are quantity based: 15+ bright green, 6–14 green, 4–5 orange, and 0–3 red. Color is supplemental; show the numeric quantity and a short status on hover or keyboard focus.
- The current storefront calculation uses the seeded 18% VAT rate. If the CEO changes the scheduled tax rate, update the public rate source and verify the displayed net amounts before publishing.

## Admin scrolling and sidebar interaction — 2026-10-01

- Desktop navigation uses `--mgmt-sidebar-width` (15.25rem expanded) and `--mgmt-sidebar-collapsed-width` (6rem collapsed). Collapsed links remain 46px square with space for focus outlines and magnification; do not let their width shrink to the icon's intrinsic size. Labels appear in a body portal to escape the vertically scrolling navigation container.
- Collapsed hover/focus uses a gold surface and foreground contrast. Fine-pointer hover magnifies the active link and its neighbors; respect `prefers-reduced-motion`. Keep the mobile/tablet drawer and role-specific navigation intact.
- Constrain flex/grid feature panels with `min-inline-size: 0` so wide tables overflow inside their local scroll containers. Preserve document scrolling for product-editor sticky controls; do not set `overflow: auto` on the shared main panel.
- Use shared `ScrollRegion` for wide or long data tables. It keeps native wheel/touch/keyboard scrolling and adds a synchronized native range control above overflowing content. The upper control remains visible when macOS hides native scrollbars, supports Home/End/arrows, and uses the table's localized accessible label. It disappears when content fits.
- Reserve padding below horizontal scroll content and stable gutters beside vertically scrolling navigation, replenishment lists and overlay bodies. Keep scrollbar tracks and thumbs on theme tokens; avoid covering controls with a scrollbar.
- Inventory SKU/barcode cells retain their readable width, and row actions stay in one line inside the horizontally scrolling table. Small screens retain the existing inventory card presentation.

## Premium management controls — 2026-10-02

- CEO/admin controls share 44px minimum targets, 12px corners, restrained inset highlights and aligned 17–18px stroke icons. Use `IconAction` from management UI for compact row edits/deletes: its label works on hover and keyboard focus and is portaled outside table clipping. Do not remove accessible labels when removing visible button text.
- Use `ActivationSwitch` for binary catalog/supplier state. Its `aria-checked` represents persisted state, and its label includes the current state and proposed action. Preserve existing confirmation policies; disable controls during saves. State uses both thumb position and color. All animation must respect reduced motion.
- The sidebar brand uses a gold shield tile; collapse/expand uses panel icons in a bounded control with an RTL mirror. Keep its persisted state and mobile drawer behavior.
- Request queues use fixed column proportions and bounded wrapping for long contact/product strings. Filters wrap in their own groups. Shared scroll regions remain local to tables and keep their keyboard-operable top control. Governance tables must retain native table semantics and scoped headers.
- Arrow labels refer to adjacent row movement, while displayed positions are independent from persisted ranks. Existing PATCH-based ordering is sequential and reloads authoritative data after failures; do not claim transaction safety or concurrent-editor protection.

## Management layout contract and moving text — 2026-10-02 follow-up

This entry supersedes the earlier admin table wrapping and cosmetic-control notes.

- `src/styles/console.css` is the final management-only presentation layer, imported after `management.css` by the protected Admin layout. Keep public storefront styling separate. Section titles, metadata, inputs and table headings have a consistent scale; section icons belong in `FormSection`'s `icon` slot, rather than title fragments. `sectionId` supplies an anchor target.
- Use `ScrollRegion` for bespoke tables and `DataTable` for shared tables. Products, Customers, Inventory, Users, Sales and Variants must retain local synchronized upper scrolling. Customers and Users keep their tables at phone widths; do not hide their scroll regions in favor of cards. Never rely on narrow columns or forced character wrapping to make wide tables fit. Declare column widths and table minimum widths sufficient for the actual controls; headers and cells in a column must use matching alignment.
- At the owner’s request, table headers and values center consistently, including name/contact columns. Clipped text rails start at the reading edge while moving; text that fits remains centered. Counts, prices, status, dates and action groups center within their columns. Slugs, emails, phones, SKU/barcode and record IDs remain intact on one line; use an appropriate LTR direction for identifiers. Multiword descriptive copy can wrap normally.
- Use `OverflowText` for bounded identifiers or names. It measures the actual overflow and animates only clipped strings at reading speed as a continuous rail. A second, aria-hidden copy enters from the other edge; do not reintroduce back-and-forth motion. LTR strings move left and RTL strings move right. Hover/focus pauses it; focus provides native horizontal access; reduced motion disables animation. The console-wide pause control stops all loops. Full text remains in the DOM and in a native title. Never use an always-moving decorative marquee for text that fits.
- `SearchField` keeps the native input and full accessible label. Its empty/unfocused placeholder is visually duplicated through an aria-hidden `OverflowText` overlay so it can be read when narrow; focused editing uses the native placeholder/input. Choices remain native, keyboard-accessible select controls with consistent borders, spacing and RTL chevrons. Date ranges use the existing managed dialog and native date editors, preserving focus restoration and Escape dismissal.
- Product navigation/actions use `IconLink`/`IconAction` with portaled labels so tooltip text is not clipped by cells. Maintain existing publishing/archive confirmations and authorization behavior.
- Audit search/action/entity/date filters run on the protected API, with a single counted, bounded query and stable pagination ordering. Date filters represent Israel calendar days, including DST. The details dialog displays already-authorized event fields; any change to access scope, retention or recorded detail fields requires a separate privacy/security decision.

## Product names and bounded Users choices — 2026-10-02 owner review

- Product rows show one localized name through `TextHint`; the alternate name and slug appear in a portaled hover/focus tooltip. Preserve keyboard focus, Escape dismissal, pointer access to the tooltip and single-line overflow treatment.
- Users role/status selectors in table actions have bounded 10rem widths and align in one centered row. Preserve existing change confirmation and protected CEO-account behavior.
- All category rows retain a delete action slot. Linked-product categories use focusable `aria-disabled` controls with an explanation and a no-op click; empty categories keep type-to-confirm deletion. Do not remove the existing deletion constraint merely to make rows visually consistent.

## Premium reporting and request workspace — 2026-10-02

- Requests, Finance and Analytics share `ui/reporting-workspace.tsx` and its CSS module: premium dark surfaces, MIRO gold identity, restrained neon cyan/violet/lime chart/status accents, and contrast-aware brighter-theme colors. Related section/store links must include the active locale and resolve to real routes.
- Prefer four primary metrics, then focused overview/ledger or overview/product views; secondary details belong in reusable accessible drawers. Keep chart line/bar and metric controls honest: amounts and counts have separate axes/views, zero stays zero, no fabricated hourly data, no invented conversions/funnels.
- Finance comparisons use the API's `previous` period. A zero baseline shows no percentage; current inventory must never show a historical-period delta. Discounts already affect revenue; do not subtract them again. Gross profit excludes operating expenses.
- Requests work-board metrics explicitly describe the current page, while matching total comes from the protected counted query. Filters and pagination still run on the API. Reload after successful updates; never persist an unsuccessful assignee selection through a later status change. The board is a button-based alternative view, with existing status/assignment updates in its detail drawer.
- Analytics product filters/sorting apply to the API's top-ten product cohort, not the full catalog. Keep that scope and unique-viewer cap visible. Store drill-down needs both category/product slugs; editor links use product IDs. Tracking event names must match `src/components/analytics/track.ts`, including `product_search`.
- Date-control ranges use Israel calendar-day bounds through `reportingRangeParams`; daily analytics remains UTC aggregate data and is labeled as such. All sends omitted date bounds and must actually fetch. Shared report requests are abortable so refresh and range changes cannot race.
- Continue using measured `OverflowText` on bounded display names/identifiers/choice labels. It remeasures at resize, runs only for clipped text, and respects focus/hover/global pause/reduced motion. Inputs, textareas and editable content stay native and static; descriptive paragraphs can wrap. Supplier name/icon groups center within the same column as their centered headers.

- Shared overlays keep their stack registration immediately available to keyboard handlers through a ref. Capture whether a closing overlay owns focus restoration before unregistering; do not depend on a later React state commit for fast Escape or nested date-picker behavior. Staff assignment choices include all active users through bounded pagination.

### Complete business console — 2026-10-02

- The entire protected CEO/admin layout imports `business-console.css` after `management.css` and `console.css`. It defines the shared deep navy/charcoal, gold, cyan, violet and lime palette and contrast-aware medium/light variants, including the body-level overlay portal. Keep these tokens scoped to management; preserve the public store design.
- Use the shared workspace `PageHeader` for every management route. It derives the section icon, role, locale and real related-workspace links from `WorkspaceProvider` and the canonical nav model. Compact editor action headers use `variant="plain"` and `headingLevel={2}` so one full page H1 remains.
- Collection summaries always name their loaded/filter/page scope. New filters and view choices must operate on existing data contracts; do not present invented finance, logistics or analytics figures. Overview attention links validate async Next page searchParams and seed actual controls; stale requests use the same protected 48-hour query rule.
- The shared page finder uses canonical management routes and respects editing shortcuts and existing overlays. Comfortable/compact density persists per browser and preserves accessible control targets. Keep global text-motion pause and reduced motion. Use rails for clipped display text and native static fields for typing; paragraphs wrap.
- Modal drawers and dialogs capture their trigger during layout before background inert. Restore focus after inert is released, including conditional unmount, and suspend lower overlays during nesting. Preserve existing inert ownership. Always label table header cells with actual text (visually hidden is appropriate for icon-action columns).
- Retain mounted sales drafts when switching entry/history views, existing review/idempotency controls, independent dirty settings drafts, CEO-only setting/account controls, protected API auth and database/RPC contracts.
- Management browser evidence can contain customer/account data. Store real-data screenshots only in a local temporary directory; committed visual evidence must use synthetic data. Disposable verification accounts must be deleted in `finally`; never use verification to mutate existing stock, orders, requests or accounts.
- Role/status/overdue text must use the management theme tokens rather than hard-coded yellow or purple across all themes. Allow theme surface transitions to settle before automated contrast measurements. With reduced motion enabled, full display text wraps in place; keep typing controls static in every motion mode.

## Customer storefront refinement and glass navigation — 2026-10-02

- Public identity stays black/charcoal/gold with the existing dark, medium and light tokens. Do not inherit CEO/admin neon colors. Refine shape, weight, spacing, arrows and icons through the final `customer-refinement.css` layer.
- Eight category cards lead into the company rail and product collection rail. Company slots have identical dimensions and contain modest marks, with theme-aware monochrome treatment. The eight initial technology names do not establish reseller partnerships. Brand controls support visibility, ordering, replacement, removal and motion timing.
- Five original decorative studio backgrounds rotate every ten seconds by default. Keep typography readable through theme-aware gradients. Rotation pauses for focus, hidden tabs or the explicit pause button; reduced motion leaves a still image with manual navigation. CEO controls choose fade/slide/zoom/none, transition duration and interval.
- Product media stages contain whole devices, side thumbnails and distinct RTL-aware arrows. SVG reference artwork is labeled as illustrative. Unpriced reference models show availability on request, without fabricated prices or stock claims. Card/cart/preview quantity controls use the same cart state and appear after the first add; zero returns to the add action.
- 3D quick previews retain a stable anchored portal, fast configurable hover intent (default 200 ms), pointer grace, keyboard close/focus restoration and bounded mobile scrolling for actual product content. Product rails pause while their portal remains open, including pointer travel from the moving card into the portal.
- Public layers: page/hero, header (900), product preview (1000), mobile navigation (1100), account menu (1200), skip link (1300). Account/mobile menus portal outside clipping ancestors. Account popups clamp within 16px gutters. Glass panels blur underlying imagery while their text remains fully visible throughout a transform-only entrance.
- Hamburger navigation floats below the measured header, keeps its natural height and scrolls with the document. It must not add an inner scrollbar or inflate the shared sticky-header offset. Escape dismisses a nested account popup first, then the navigation; arrows navigate account menu items.
- Long display names use continuous measured rails only when clipped; hover/focus pauses them, duplicated text is aria-hidden, text direction follows its first letter, and reduced motion wraps the complete string. Editable controls retain static native text.
- Keep automated hit-testing, real click/focus behavior, three themes, both locales and narrow-phone coverage in `tests/store-overlays.spec.ts`. Automated accessibility checks supplement manual review.
