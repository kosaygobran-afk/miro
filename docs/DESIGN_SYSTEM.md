# Design System

## Visitor/customer frame and spacing parity — 2026-10-20

- The owner explicitly replaced the previous public circle/pill direction with the management interface's bordered rounded rectangles. `public-refinement.css` remains the final import and owns this Version 2 pass: 0.75rem icon frames, 0.85rem action controls, 0.5rem compact checklist/FAQ/theme cells, and the existing 0.8rem theme-group frame. Standalone icons use 1px `--border-control` outlines and lucide strokes use 1.8, with the existing public theme tokens. Header chrome and the stroke rule exclude management surfaces. This supersedes earlier circle-language entries below; it does not change Version 1, brand artwork, status dots, product media or the magnifier lens.
- Cover the header/account/cart/menu/theme controls; card/rail save, cart and preview actions; gallery/preview arrows and Close; magnifier toggles; hero/brand rail controls; subcategory steps; service/contact icon tiles and customer-account/footer heading icons. Mirror the nested preview and account ancestors and existing rail/gallery radius-only `!important` declarations. Check resolved styles, not only source order. Controls retain their shipped hit areas, keyboard/focus behavior and public palettes.
- The magnifier toggle owns one border around its existing 44px hit target. Its `::before` paint fills that frame with `inset: 0`, `border: 0` and inherited radius; do not leave the former inset outline as a second, nearly circular border. Hover/pressed states still use the accent outline and surface-hover paint. The optical magnifier lens remains circular.
- Independent product-card, rail and preview footer actions use 0.5rem gaps, including wrapped rows. Account-form labels use a grid with 0.5rem between label text and input. Contact field validation panels reserve 0.5rem above the panel. The payment CSS module now uses public surface/text/border/accent tokens in Version 2 instead of hard-coded dark fallbacks.
- `scripts/verify-public-spacing.mjs` inventories static public/auth pages, discovers category/product/service links, and checks actual control intersections, action/field gaps, icon frame geometry, page overflow and accessibility. It exercises validation, cart/checkout, preview, payment fixture states, and a disposable customer's forms/menu/saved product. Browser-only fixtures intercept tracking and business writes; only the disposable account's favourite is inserted, then explicitly removed. Never create financial documents/payments or change owner products to populate a presentation test. Store captures outside git, report exact coverage and retain failed baselines.

## Persistent card bitmap corners — 2026-10-20

- A computed 0.85rem radius was insufficient: resting `<img>` pixels still painted square because their overflow was visible and the fit wrapper could be wider than the natural bitmap. The rounded popup stage masked this difference. `product-card-sections.css` now clips only the grid/rail image element with `clip-path: inset(0 round 0.85rem)` in the Version 2 base state. No hover/intent/decode requirement; natural image proportions, card geometry, reveal opacity, source images and the popup magnifier/tooltip remain intact. Version 1 stays untouched.
- `tests/product-card-media.spec.ts` uses an opaque browser-only bitmap in square/wide/portrait ratios and samples screenshot corner pixels at 320/390/1440px before preview and after dismissal. Keep the paint-level check: a radius-only computed-style assertion falsely passed the original defect. No product image or catalog record is changed for the fixture.

## Management form and action spacing

- Commerce `SectionCard` owns its internal flow in Version 2: a single `minmax(0, 1fr)` track and a 1rem gap between header, field groups, help notes, tables and action rows. Keep direct action buttons intrinsic and aligned to reading-start. Do not add one-off button margins to cash/recurring/document screens; use the shared card contract. Direct header/toolbar/metric trailing margins are zero to avoid doubled spacing. Version 1 keeps its existing geometry.
- Shared `ReportChoices` retains its compact horizontal gaps and uses 0.5rem between wrapped rows. Form label/control spacing remains independent from field/action spacing.
- Request status filters use the same 0.5rem wrapped-row gap in Version 2, including their separate custom tab component. Bright-theme informational badges mix the existing cyan with foreground text for accessible contrast; CEO Dark and badge backgrounds remain unchanged.
- Version 2 dialog footers in `console-evolution.css` use wrapping flex rows with a 0.75rem gap. This applies to direct footer fragments as well as existing action wrappers; stacked full-width `.miro-button` actions must not touch on phones.
- The Version 2 calculator keeps six rows of at least 3.25rem. Its container can grow beyond a short tool window and uses the existing window-content scroller; history must never shrink the keypad beneath its buttons. Preserve keyboard reachability of VAT/history controls, original Version 1 geometry and calculation behavior.
- Review nested inputs, buttons, help notes, conditional fields, editor sections, dialogs, drawers and tool windows. Page overflow and separated card borders alone do not certify form spacing. `scripts/verify-management-spacing.mjs` enumerates admin routes and exercises these states without business writes. Scroll-region rails, padded dialog/section header/body/footer seams, media/body seams and connected POS navigation are integrated chrome; compare actual content/control bounds and account for native scroll clipping.
- Check live protected reads separately with the reporting harness. For repeated layout matrices use `SPACING_REPORT_FIXTURES=1`; fixtures affect browser GET responses only and must be identified in evidence. Keep normal server read limits intact. `SPACING_ROLE=admin SPACING_ADMIN=0` reviews the restricted page states; default CEO coverage also exercises nested dialogs/tools and then admin pages. Store private captures outside git and retain failed baselines alongside corrected scoped reruns.

## Reporting section spacing — 2026-10-19

- Finance's loaded content uses `contentStack` from `reporting-workspace.module.css`: a Version 2 grid with a 1.5rem gap between metric rows, insight context, chart/ledger panels and the final scope note. This fixes a longstanding zero-gap wrapper, independently of the recent card alignment changes. Overview and daily-ledger views share this layout; Version 1 keeps its existing geometry.
- `motion-content-reveal` owns animation only. Give multi-section wrappers an explicit layout class; never add grid/flex globally to the animation class, which also appears on table bodies and single-content public wrappers. Existing analytics and collection-summary grids retain their own spacing.
- The reporting browser harness checks actual section separation and card intersections in Hebrew/English, all three themes, and 320/390/1024/1440px layouts. Keep these geometry checks alongside page-overflow checks: touching cards can fit the viewport and still be wrong.

## Rounded card media — 2026-10-19

- Owner request: images inside the product cards get rounded corners. Implemented as the appended "Rounded card media — 2026-10-19" block at the end of `src/styles/product-card-sections.css`, the owner of card media geometry, using the existing catalog media radius `0.85rem` (the `.sf-thumbnail` family) — not the pill control radius.
- Rounded surfaces (all `:root[data-appearance-version="2"]`-scoped, radius-only): grid/rail card media images (`.sf-product-image-fit`, `.sf-product-visual`, `.sf-moving-rail-image`), quick-preview stage image (`.sf-hover-preview-image`, including the magnifier stage's img) and preview thumbnails (`.sf-hover-preview-thumbnail` img/image-fit). Deliberately NOT touched: the enhanced popup stage's own `0.9rem` bordered shell (owned by `product-preview-refinement.css`; adding an outer radius there would be redundant and could clip the magnifier tooltip if it ever gets `overflow` changes — no overflow clipping was added anywhere), detail-page gallery surfaces (`.sf-main-image` already has its own larger `1.5rem` shell), badges/stickers, and every reveal/press/hover transform contract.
- Version 1 keeps its protected square media; no element gained `overflow: hidden`.
- Verification (production build): computed-radius script — card media `13.6px` (0.85rem), rail image `13.6px`, popup stage image `13.6px`, popup thumbnail `13.6px`; Playwright `product-card-sections`, `product-preview-styles`, `product-preview-identifiers`, `product-image-magnifier`, `smoke`, `store-overlays`, `navigation-bar`: 115/115 passed; `verify-design.mjs` full sweep: all PASS, exit 0 (one earlier single-artwork transient "content image did not load" wait reproduced neither of the two following single runs — it is a network-bound image-decode check against remote Supabase storage, not a build regression). `npm run lint` ✔, `npm run typecheck` ✔, `npm run build` ✔.

## Storefront toggle radius completion — 2026-10-19

- Owner request: every remaining catalog toggle that still rendered rounded-square corners now shares the card control language (999px pill; circles for icon-only controls) in the Version 2 public presentation. Applied in `src/styles/public-refinement.css` — the final import — in a dated "Storefront toggle radius completion" section.
- Radius-only principle: widths/heights/paddings/glyphs/painted hover states stay exactly as shipped (frozen 44px rail squares keep their 44px geometry; glass gallery arrows keep their on-image hover). Version 1 is untouched (all rules are `:root[data-appearance-version="2"]`-scoped) and none of these classes render on the console.
- Controls unified: featured-rail footer buttons (`.sf-moving-rail-details-link`, cart/preview — the preview button mirrors `customer-refinement.css`'s `!important` radius at higher specificity), detail purchase row (`.sf-add-cart-button`, `.sf-action-contact`, `.sf-action-link`), variant choice chips (one radius rule covers selected/checked states), detail gallery arrows and counter pill, quick-preview counter cell (mirrored `:is(.sf-hover-preview, .sf-detail-magnifier)` root like the toolbar circles), magnifier toggle + its `::before` ring, and FAQ disclosure chevrons as checklist-style circles.
- Already circular before this pass (verified, unchanged): hero slideshow controls (34px circles in the glass pill), subcategory step buttons, departments expand/collapse pill, header chrome circles, preview close/arrows, search clear, theme segmented control, card footer pills.
- Deliberately not pill-ed: `.sf-thumbnail` media tiles keep their media radius (image cells, not labeled toggles; selection geometry is owned by `product-card-sections.css` contracts). On-image controls keep glass fill hovers instead of outline-circle hovers — documented difference (on-image vs on-surface language).
- Newly circled controls are added to a reduced-motion kill block; FAQ chevron rotation was already killed flat in `experience.css`.
- Verification (production build): computed-radius script — root version `2`, rail details `999px`, rail preview `999px` (was 0.7rem), FAQ tile `999px`, detail contact/action-link `999px`, variant chip `999px`, gallery arrow `999px` (was 0.8rem), detail counter `999px` (was 0.6rem); skipped entries are quote-only states (no cart button rendered by contract). Playwright `product-card-sections`, `product-preview-styles`, `product-preview-identifiers`, `smoke`, `store-overlays`, `navigation-bar`: 94/94 passed. `verify-design.mjs` (both locales, three themes, five viewports, axe scans, keyboard/theme/reduced-motion checks): all PASS, zero FAIL. `npm run lint` ✔, `npm run typecheck` ✔, `npm run build` ✔.
- Future cascade guard: `customer-refinement.css` and `product-preview-refinement.css` set some of these radii with `!important` or inside nested `:root` blocks; radius overrides must keep mirroring those resolved shapes before assuming a rule applied (verify with computed styles).

## CSS foundation cleanup — 2026-10-19

- `src/app/globals.css` was rebuilt to contain only live tokens/controls: 1968 → 658 lines. Removed the entire retired pre-premium class families (`miro-hero/store/service/stat/feature/step/mini/visual/split/contact/nav/product-menu/product-subnav/product-card/product-grid/footer-grid/business/brand`, `.miro-viewport-warning`, `.miro-text-balance`, `.miro-heading`, `.miro-rich-panel`, `.miro-search-input`, `.miro-icon-action`, `.theme-switch*`, `.theme-icon-*`, `.miro-desktop-action`); their markup no longer exists anywhere (verified by class-reference scan across `src`, `tests`, `scripts`).
- Merged the duplicated `@media (max-width: 639px)` blocks and the duplicated reduced-motion blocks (kept the stronger 0.001ms values and the `html { scroll-behavior: auto }` guard, exactly the previous cascade outcome).
- `.miro-container` is now single-sourced in `globals.css` (width 100%, max-width 112rem, 2rem gutters, 1rem under 768px); `premium.css` no longer re-declares it. Runtime values are unchanged.
- Removed the legacy unreferenced files `src/styles/globals.css` and `src/styles/tokens.css` (nothing imported the `tokens.css` palette; all its tokens are re-declared by the active `globals.css` theme blocks).
- Owner-preserved unfinished canvas/workspace utility classes (`.canvas-*`, `.selection-highlight`, `.snap-line-active`, `.minimap-viewfinder`, `.active-tool-pill`, `.glass-panel`) remain in `globals.css` untouched.
- Catalog (`sf-*`), motion (`motion.css`), management and customer layers were not restructured: they build some class names dynamically (`sf-promo-badge-<shape>`) or style state hooks owned by other layers, so substring scans cannot safely judge them; no changes made there.

## Public-surface engineering pass — 2026-10-18

- `src/styles/public-refinement.css` (last import in `[locale]/layout.tsx`, after `card-refinement.css`) owns this page-level pass: Version 2 only, Version 1 protected. Product card/preview typography stays owned by `card-refinement.css`; this layer does not touch media sections.
- Collection filter chips render as one uniform grid — `display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr))` — giving equal-width cells per row instead of grown flex rows. Labels use `overflow-wrap: normal` (word-boundary wrapping only, no mid-word breaks) and `text-wrap: balance`. The 0.82rem/650 label voice drops to 0.78rem only inside this grid so balanced wrapping fits the cells; the base chip layer already sizes labels.
- Centered-control contract: `justify-content: center` on `.sf-product-actions .sf-product-action`, `.sf-hover-preview-footer` links/buttons and `.sf-product-actions-detail .miro-button` (shop-from detail actions were already centered; this catches the rest). `.miro-centered-control` chips/cells keep their equal-edge grid centering.
- Icon-only controls speak one circle language in Version 2: header chrome (`.premium-icon-button`, `.premium-theme-selector` + inner buttons, `.premium-account-trigger`) — every size variant keeps height/width and uses `999px` + `--border-subtle` with an accent-mix hover, guarded by `:not(:has(.mgmt-shell-root, [data-management-surface="true"]))` so the CEO/admin console shell never changes; preview close/arrow buttons and search clear join the same circles.
- Cascade note: `product-preview-refinement.css` declares toolbar/gallery geometry inside nested `:root[data-appearance-version="2"]` blocks, which outrank later flat selectors — mirror the resolved ancestor shapes (`:is(.sf-hover-preview, .sf-detail-magnifier) .sf-hover-preview-toolbar .sf-hover-preview-close`, and the arrow's parent preview nesting) when overriding preview controls.
- Category-page chrome stays in rhythm: the collapsed-bar control gains the shared pill (999px, 42px, 0.95rem padding), subcategory chips match collection `padding-inline` (0.9rem), and the toolbar summary row drops to a 48px baseline. Static card widths and the popup preview are out of scope.
- Services capability strip icons become bordered circular tiles (2.6rem, `--surface-muted`, `--border-subtle`); contact checklist check icons become compact bordered circles (1.55rem). Contact page direct methods (`experience-contact-methods`) are full-width centered bordered pill rows with lucide icons added in the page; address/hours notes join them inside matching 24rem bordered panels so all five rows share one column width and symmetric rhythm.
- Verification: lint, typecheck, build, Playwright `product-card-sections` + `product-preview-identifiers` + `product-preview-response` + `product-preview-styles` + `customer-evolution` + `store-overlays` + `number-counting` + `navigation-bar` (104 passed). Visual QA in dark/light × EN/HE × 1440/390/320 with computed-style assertions (chips equal cells, header circles 999px, centered CTA labels ±2px). Failing `store-comprehensive`/`store-merchandising`/`store-loading` cases fail identically at HEAD on a clean checkout unconnected to this layer.

## Card and control refinement — 2026-10-18

Owner-requested compact unified card pass. `src/styles/card-refinement.css` (imported last in `[locale]/layout.tsx`) owns all Version 2 presentation changes; Version 1 keeps its protected original card geometry. The shortened unpublished-price copy is data (`store-copy.ts`) and applies to both versions.

- **Unified controls.** Card footers, quick-preview footer actions and collection chips share one size system: 42px minimum height, 0.79rem/700 labels for actions, pill radius in Version 2, 10px radius in Version 1. Card footer icon squares (cart, save, quick preview) are exactly 40×40 with `flex: 0 0 40px; width: 40px; min-width: 40px;`, gap 0.3rem and `0.5rem 1.05rem` row padding. The details link keeps `flex: 1 1 5rem; min-width: 0` so all four controls fit one row at desktop card widths; storefront.css `max-width: 600px` stacking is re-declared inside the same media query because the shorthand would otherwise defeat it. The label ellipsizes through the existing `.sf-product-action-label` contract; never replace it with wrapping.
- **Body typography.** Category eyebrow 0.68rem/750 with 0.06em tracking; title `h3` 1rem/760/1.45; description 0.8rem/1.62. `.product-identifier-label` and `.sf-product-facts dt` render 0.66rem/700 in `--accent-text`; `.product-identifier-value` and `dd` 0.74rem/650 foreground; identifier/fact grids tighten to 0.3rem gaps. Summary gap 0.42rem.
- **Price presentation.** Price blocks drop to `min-height: 4.75rem` and 0.8rem padding. Priced amounts (amount container `:has(small)`) are 1.2rem/780; unpublished-price notices (`:not(:has(small))`) are supporting text at 0.82rem/640 with 1.55 line height — both selector shapes mirror the strongest existing rules with `.sf-product-card`/`.sf-hover-preview`/`.sf-moving-rail-card-shell` ancestors so they win the cascade regardless of source order. VAT smalls 0.7rem. Copy: “Price not published — contact us for details.” / “המחיר טרם פורסם — לפרטים פנו אלינו.”
- **Quick preview.** The inner frame cap is **37rem (592px)** and the placement constant `maximumHeight` in `product-hover-preview.tsx` changes with it — update both together (previously 560). Popup details gain the same body typography plus title 1.06rem, category 0.68rem, details gap 0.62rem. Popup gallery geometry and image sections are untouched.
- **Collection chips.** `.sf-category-filters` buttons now mirror `.sf-subcategory-links a`: min-height 42px, Version 1 radius 10px (Version 2 keeps evolution's pill), foreground labels at 0.82rem/650 on `--background`, hover on `--surface-hover`, selected weight 800 with the primary fill. Counts render as badges matching `.sf-subcategory-count` (12%/24% currentColor, 0.66rem/750, tabular-nums, opacity 1). Keep `miro-centered-control` slots and `AnimatedNumber`.
- **Untouched by design:** card media aspect/padding/expand affordance, popup gallery, Version 1 typography, moving-rail internals, detail-page layouts. Reduced motion block duplicates the control list with 0ms transitions.
- **Verification:** the identifiers popup spec now asserts the 592px inner height and relaxed identifier emphasis (weight ≥620, size ≥11px) — these are the encoded contract for this pass, not loose tolerances. Lint, typecheck, build, 295 unit tests, product-card/preview/overlay/widget suites and bilingual dark/light responsive captures pass; exact commands in `docs/PROJECT_STATUS.md`.

## Category hierarchy bars — 2026-10-17

- Category pages render a three-row hierarchy: the main-category band (collapsed by default, one compact current-location card), then the **subcategory bar**, then the search/sort row. Subcategories are a single-row scrollable chip bar in their own bordered panel — never a free-wrapping side column. `subcategory-bar.tsx` owns the bar; `category-hierarchy.css` owns its styles for both appearance versions and reading directions.
- The bar has a reading-start label with a hairline divider (caption row on phones), chips of height 42px (44px in Version 2, pills in Version 2), and honest per-subcategory product counts from the already category-scoped product list, including a visible zero. Chips carry the current search query in their hrefs so chip navigation preserves a typed query. Selected chip uses the primary fill; hover uses the accent border; focus-visible outlines remain visible inside the faded rail.
- Overflow engineering: the chips rail never wraps. A ResizeObserver plus scroll listener measures which physical sides hide content, drives `data-fade-left/right` mask fades and renders reading-direction `ChevronLeft/Right` step buttons (`tabIndex={-1}`, labeled, not in tab order because tabbing the chips scrolls natively). Scroll math is coordinate-based (`scrollLeft` adjustments and `scrollBy` with the RTL sign), not hardcoded to physical sides, and uses `auto` behavior under reduced motion. The active chip is kept in view on mount without page scrolling; when a chip is wider than the rail, it aligns to its reading-start edge instead of centering. Steps only render while measureable overflow exists.
- The collapsed main-category card is compacted for both versions (48–50px tall, smaller media/arrow, Version 2 keeps its 30px icon-tile identity) while expanded category grids keep their existing card geometry. Preserve the centered-control slots, `aria-current="page"` selection, both locales, all themes, the 320px stacked layout and reduced motion. `scripts/verify-category-hierarchy.mjs` asserts bar-above-toolbar geometry, distinct bold selected state and fitting at 320/390/768/1440 in both engines tested.

## Product-page magnifier coverage — 2026-10-17

- Every Version 2 product-detail route uses the same `ProductImageMagnifier` as catalog/rail popup previews. It applies to the selected main photo, including single-image galleries; thumbnail/arrow changes reset magnification to off/2×. Thumbnail buttons continue selecting the main image. Reuse the shared component for new full-size product-image inspection views rather than adding a separate zoom implementation or putting buttons inside image links.
- `sf-detail-magnifier` stretches inside the existing main image frame, with the compact left icon, independently centered counter and active-only slider below the image. Preserve equal desktop gallery/info panels, full-width single/zero-image frames and intrinsic stacked phone/tablet layout. Keep the main frame's inline size explicit. At the stacked breakpoint, keep the wrapper in flow with a square aspect ratio; otherwise WebKit can shrink the frame or collapse the image track. The media inset follows the detail's existing 2rem/1.25rem spacing; base and lens copies must share exactly the same fit. Disable the old detail-image hover scale inside this magnifier to keep the lens sampling accurate.
- `ProductMedia` accepts actual minimal product identity, optional fallback and fetch priority; the main detail image keeps high loading priority and its existing illustration fallback/annotation. Missing/failed images offer no magnifier. `product-preview-refinement.css` shares the control/lens rules across previews and detail; `product-detail-refinement.css` owns the page integration. Version 1 retains its original image/gallery behavior.
- Product-page Escape handling is local to the image and its controls, so an active lens does not consume Escape intended for an account menu or another overlay elsewhere on the page. Preview dialogs retain their first-Escape lens exit contract. Empty images with no counter render no empty toolbar.

## Centered category controls — 2026-10-17

- Version 2 category cards, category/count filters, expand/collapse buttons, header category links and mobile shortcut links use `miro-centered-control`. Put the label in `miro-control-label`, leading media in `miro-control-start` and trailing icons/counts in `miro-control-end`. Equal side tracks reserve both sides even when only one has content; center the label within the whole control, not the remaining space beside an icon. Start/end follow inherited Hebrew RTL or English LTR, with each icon aligned to its padded outer edge.
- `navigation-refinements.css` owns this shared layout. Category media reserves equal 40px tracks on desktop; the responsive category grid gives labels room without shrinking type/icons. Phones keep two columns, opposite-corner icons and a centered full-width label row. Other public cards keep their existing dimensions. Preserve Version 1 geometry, locale-aware arrow shapes, keyboard/focus behavior, themes and reduced motion.
- The desktop category dropdown has a viewport-bounded height, native scrolling and symmetric scrollbar gutters so a growing bilingual root list stays reachable. The mobile navigation portal continues using only the document scrollbar.
- For future simple label/icon controls, reuse these slots and symmetric padding. Keep richer content cards, form inputs and icon-only controls on their own layout contracts. Counts stay accessible through the existing `AnimatedNumber`; do not hide or duplicate their spoken value.

## Preview metadata and magnification — 2026-10-17

- Version 2 shared identifiers use aligned label/value rows with bold gold labels, readable actual codes and preserved LTR code order. The identifier container stacks each pair below 250px of available content width; static card widths remain unchanged. Preview specifications use the same gold label hierarchy. Missing/internal identifier semantics remain unchanged.
- The popup header separates Close from the gallery. The image has its own bordered, centered `contain` stage, with 44px arrow lanes outside it. Picture count and magnifier controls sit below the image border, never over product pixels. Thumbnail images also use `contain`; preserve native thumbnail scrollbars, selected-item visibility, short-phone layouts and compact/minimal source-action fallbacks.
- `ProductImageMagnifier` uses a movable circular lens over the unchanged base image. Its icon-only toggle stays physically left, with a localized hover/focus helper and 32px visible frame inside a 44px hit target; the 32px-tall image counter stays centered independently. The native zoom slider/current value appear only while active, from 1.25× to 5× in 0.25× steps (initially 2×). Wheel over the active image adjusts zoom; Ctrl/Meta wheel stays native. Mouse movement, touch/pen dragging and physical arrow keys move the lens; Home recenters. Slider keys adjust only zoom. First Escape exits magnification and focuses its toggle; the next closes the preview and returns to the source. Image selection resets to 2×/off. Never offer magnification for missing/failed image fallbacks. Native scrolling/pinch stays available outside active magnification; no interpolated zoom/pan animation is introduced.
- `product-preview-refinement.css` owns these Version 2 overrides. Preserve the 416px/560px popup limits, Version 1 presentation, actual media fallbacks, existing hover/hold behavior and source footer hit-testing. `tests/product-image-magnifier.spec.ts` covers bilingual alignment, themes, keyboard/pointer/touch behavior, image reset and scoped accessibility with browser-only synthetic image bytes; it never changes owner catalog data.

## Smaller popup previews and visible identifiers — 2026-10-17

- The owner's clarification applies smaller, unified dimensions **only to popup product previews**, not static catalog, rail, service or editorial cards. Preserve existing responsive static-card widths and natural content flow. Do not add a universal fixed card frame or scrolling static summaries for this request.
- Version 2 popup width is capped at 26rem (416px) and the normal frame height at 35rem (560px), with 16px viewport gutters. `product-preview-refinement.css` owns this popup-only refinement; the placement calculation uses matching enhanced limits. Available space above source actions, compact/minimal fallbacks and short viewports override those maximums. Keep original footer hit-testing, 44px controls, keyboard focus return, thumbnails, native gestures and reduced motion.
- Long preview content scrolls inside the existing named/focusable details region; image, close and footer controls retain their own areas. The normal popup size stays consistent across products at the same viewport. Preserve Version 1 dimensions and the source-action clearance contract.
- Actual SKU/barcode strings use shared `ProductIdentifiers` in cards, rails, previews and the selected detail variant, with distinct bilingual labels, bold readable values and LTR code order. Do not coerce codes to numbers or invent missing barcodes. `MIRO-REF-*` codes are explicitly internal catalog codes, not asserted supplier GTINs. The catalog projection already selects barcode; retain it in the public variant mapping. New identifier styling is Version 2 only.

## Balanced product details and card hierarchy — 2026-10-17

- Enhanced Version 2 detail pages use equal-width desktop columns with equal-height image/information panels. The main grid stretches both panels to the taller content; no fixed-height clipping or inner scrolling is introduced. Tablet/phone layouts stack naturally at 1100px and below. The gallery has an explicit full track width so its aspect ratio cannot push into the information panel. Enhanced detail panels scroll together; Version 1 retains its previous gallery positioning and geometry.
- `src/styles/product-detail-refinement.css` loads after the card layer and gates every visual override to Version 2/public detail scope. It owns the heading, price/availability group, SKU, stock note, variant controls, purchase actions, disclosures and specifications. Section wrappers use `display: contents` in Version 1. Keep actual price/stock conditions, navigation, image decoding and cart/contact behavior unchanged when refining presentation.
- Desktop detail panels use 2rem internal padding and a 1.5rem inter-panel gap; phones use 1.25rem internal padding. Detail titles are 2rem desktop/1.625rem phone; numeric prices are 2rem while unpublished-price notices use readable 1.05rem supporting text. Primary actions are at least 52px tall; secondary actions and variant chips at least 48px. Phone contact alternatives stack into full-width rows instead of wrapping into narrow columns.
- Variant names use their localized color name, the other available name, then the real SKU. Do not leave an unnamed selection or invent a color. Full-description sections render only when actual description text exists; do not add empty editorial bands or placeholder commercial claims.
- Version 2 catalog cards retain their existing image/details/pricing/actions anatomy. Titles are 1.125rem, descriptions 0.875rem, numeric prices 1.5rem and quote notices 1rem; facts/VAT text use 0.75rem. Section padding is 1.25rem and footer actions retain symmetric padding, one-line detail labels and 48px minimum height. Preserve all preview/hold/footer hit-testing contracts and the protected Version 1 styling.
- Verification: `scripts/verify-product-presentation.mjs` checks actual single/multi-image products across locales, themes and widths, including equal desktop panel dimensions, visible image pixels, phone containment, keyboard/thumbnail behavior and optional captured Version 1 geometry. The card sections suite verifies the real portal/footer hit-testing; exact commands/results and remaining manual accessibility owners are in `docs/PROJECT_STATUS.md`.

## Laptop width, card and header contract — 2026-10-17

This entry restores the accurate component contract after the overnight density pass was reverted; it supersedes any density/shrink guidance the removed `public-density.css` experiments introduced. Keep the established 112rem frame and standard component sizes — density wins must come from real content, never from shrinking controls.

- **Laptop is the contract width.** The owner reviews at 1440px full width. Do not reduce control heights, paddings or type sizes to fit more per row. Reverting the uncommitted density pass is the reference behavior; `src/styles/public-density.css` and its test were deleted on purpose.
- **Hamburger stays mobile-only via `:where()`.** In `src/styles/navigation-refinements.css`, the `.premium-header-actions :where(...)` sizing rule must not use `:is()`: the `.premium-account-trigger.compact` selector would raise specificity to (0,5,0) and defeat `.premium-mobile-toggle { display: none }` above 1199px (and reveal guest `.premium-account-action` ≤1399px). New cascade additions should use `:where()` for cover-scoping and never beat explicit visibility rules.
- **v2 product-card footer contract** (`product-card-sections.css`, gated by Version 2): descriptions reserve no row when empty (`:empty { display: none }`, `min-height: 0`); the details action renders one line with ellipsis through `.sf-product-action-label` (`product-card.tsx` wraps the label), keeps symmetric `0.55rem` padding, `min-height: 48px`, and omits the trailing in-button arrow (icons elsewhere still carry affordance; Version 1 keeps its original row). Centered sticky price chips and the existing section dividers are unchanged.
- **Symmetric spacing.** Note/callout paddings are uniform on all sides (`.experience-note` = `1rem`), cards keep `1rem`/`1.5rem` responsive padding, and borders stay on one side telegraphically (`border-inline-start` on notes) rather than balanced frames — do not reintroduce top-only or asymmetric directional paddings.
- **Icon direction is locale-aware.** Arrows in header/footer/gallery context follow `html[dir="rtl"]` mirroring; management `ArrowUpRight` stays direction-neutral. Verify RTL icons after any navigation or card change (HC desktop captures exist per locale/theme).
- **Verification for this contract:** product-card sections, store loading, navigation and overlay suites (66 cases), lint, typecheck and build passed on 2026-10-17; laptop-width bilingual captures for both themes are the visual record. Re-check nav exclusivity at 1199/1201px whenever header rules change.

- **Category chip boxes fit their designed internals.** Version 2 department boxes render a 40px icon board inside a 40px grid track with an 18px arrow column and 8px gaps — a board must never outgrow its track (the earlier 44px board inside a 32px track laid the label under the tile with zero visible padding, in both reading directions). Labels wrap whole-word with balance; boxes grow in height and never overlap.
- **Category arrows follow the owner-reversed contract (2026-10-17):** Version 2 corner arrows point down-left in LTR and down-right in RTL (mirrored glyphs, one package in every language). Version 1 keeps forward `ArrowRight`/`ArrowLeft` per direction. The nav-bar regression suite pins all three appearance toggles.
- **Numbered service boxes stay compact (2026-10-17, services page).** The services `experience-category-card` overrides the shared v2 panel clamp with a fixed calm `1.25rem` padding, `0.95rem` internal rhythm, a 40px icon tile and tightened type (`h3` 1.02rem, `p` 0.82rem/1.65, link 0.73rem) and a `0.8rem` grid gap — measured card heights dropped from ~212–290px to ~156–199px at 1440px. Indices render zero-padded to two digits for any count (`01`–`13`, fixing `010`–`013`), and a service entry without owner description renders no empty paragraph (`:empty` removes the dead row). Icon sizing is scoped to category cards only; `solution-detail` keeps the larger shared tile. Missing service descriptions/link labels are owner content gaps, not added copy.

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

- **globals.css**: Foundational semantic tokens (colors, radii, shadows, spacing per dark/medium/light), the Tailwind `@theme inline` mapping, base elements (html/body/scrollbars/text wraps/focus-visible), live shared controls `.miro-container`, `.miro-main`, `.miro-section`, `.miro-page-shell`, `.miro-page-panel` (+`-narrow`), `.miro-contact-form`, `.miro-card`, `.miro-button` (+primary/secondary), `.miro-input`, `.miro-site-header`, `.miro-auth-panel`, `.miro-page-panel-narrow`, `summary/details` styling, `#mobile-navigation` entrance, `::selection`, `miro-enter`/`miro-menu-enter` keyframes, sales-channel badges (`.mgmt-sales-channel-badge`), the preserved canvas/workspace utilities (`.canvas-*`, `.selection-highlight`, `.snap-line-active`, `.minimap-viewfinder`, `.active-tool-pill`, `.glass-panel`), the `:where(button…)` low-specificity foundation and the reduced-motion/prefers-contrast media queries. Retired pre-premium families and the theme-switch primitives were removed in the 2026-10-19 cleanup.
- **premium.css**: Public header/footer chrome (`.premium-topbar`, `.premium-header`, `.premium-footer`, `.premium-brand`, `.premium-desktop-nav`, `.premium-nav-link`, `.premium-nav-disclosure`, `.premium-disclosure-button`, `.premium-dropdown`, `.premium-header-actions`, `.premium-icon-button`, `.premium-language`, `.premium-quote-action`, `.premium-theme-selector`, `.premium-header-search`, `.premium-mobile-search`, `.premium-mobile-toggle`, `.premium-mobile-navigation`, `.premium-mobile-shortcuts`, `.premium-footer-main`, `.premium-footer-brand`, `.premium-footer-column`, `.premium-footer-consult`, `.premium-footer-bottom`, `.premium-footer-legal`, `.premium-preview-label`, `.premium-account-menu`, `.premium-account-trigger`, `.premium-account-dropdown`, `.premium-account-header`, `.premium-account-avatar`, `.premium-account-info`, `.premium-account-primary-action`, `.premium-account-secondary-action`, `.premium-account-logout`). Theme tokens for three modes (dark/medium/light) including `--header-sticky-offset` for sticky coordination.
- **experience.css**: Marketing/services/about/contact/legal editorial layouts.
- **storefront.css**: Catalog and product-detail presentation (`.sf-storefront`, `.sf-hero`, `.sf-departments`, `.sf-collection-section`, `.sf-catalog-toolbar`, `.sf-search`, `.sf-sort`, `.sf-category-filters`, `.sf-catalog-summary`, **`.sf-catalog-grid`**, `.sf-product-card`, `.sf-product-media`, `.sf-product-body`, `.sf-product-actions`, `.sf-empty`, `.sf-load-more`, `.sf-preview-note`, `.sf-product-dialog`, `.sf-bundle-section`, `.sf-assurance-grid`, `.sf-guide-section`, `.sf-faq-section`, `.sf-category-hero`, `.sf-category-help`, **`.sf-product-detail-layout`**, `.sf-product-breadcrumb`, `.sf-breadcrumb`, `.sf-product-main`, `.sf-product-gallery`, `.sf-main-image`, `.sf-thumbnail-strip`, `.sf-thumbnail-list`, `.sf-thumbnail-item`, `.sf-thumbnail`, `.sf-product-info`, `.sf-product-price-block`, `.sf-price-display`, `.sf-variant-fieldset`, `.sf-variant-chips`, `.sf-variant-chip-label`, `.sf-variant-radio`, `.sf-variant-chip`, `.sf-variant-swatch`, `.sf-variant-sku`, `.sf-product-short-description`, `.sf-product-actions-detail`, `.sf-action-contact`, `.sf-action-secondary`, `.sf-action-link`, `.sf-product-disclaimer`, `.sf-product-specs`, `.sf-product-warranty`, `.sf-product-description-section`, `.sf-description-content`).
- **management.css**: Management shell and shared management primitives (`.mgmt-shell`, `.mgmt-sidebar`, `.mgmt-topbar`, `.mgmt-nav`, `.mgmt-drawer`, `.mgmt-dialog`, `.mgmt-button`, `.mgmt-metric-card`, `.mgmt-table`, `.mgmt-status-badge`, `.mgmt-page-header`, `.mgmt-toolbar`, `.mgmt-empty-state`, `.mgmt-error-state`, `.mgmt-notice`, `.mgmt-skeleton`, `.mgmt-detail-panel`, `.mgmt-date-range`, `.mgmt-form-section`, responsive breakpoints at 1023px/767px/639px).
- **workspace.css**: Legacy feature styling until deliberately migrated (overview-panel, inventory-manager, suppliers-manager, settings-panel, sales-panel, sales-history, customers-manager, finance-dashboard, analytics-dashboard, users-management tables/cards, admin-console-header).
- **Feature CSS Modules** (e.g., `product-editor.module.css`): Feature-specific layouts only.

### Spacing & sizing contract

- Public wide frame: max-width 112rem, declared once on `.miro-container` in globals.css (single source; premium.css no longer re-declares it).
- Desktop page gutters: 2rem (via `.miro-container` padding-inline).
- Phone gutters: 1rem (via the ≤767px `.miro-container` padding rule in globals.css).
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
- **Floating tool context**: In `ManagementShell`, `OverlayStackProvider` must wrap `ManagementToolProvider`, which renders floating tools beside its page children. Both must share the same overlay stack; placing the stack inside the tool provider crashes the POS review dialog even while closed. Verify with `ADMIN_BASE_URL=http://127.0.0.1:<port> node scripts/verify-management-tools.mjs` against a local production server; the script uses disposable admin authentication and synthetic tool data/mutations.
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

## Full-screen request details — 2026-10-22

- Version 2 request details opens edge to edge at full viewport height using the shared `Drawer` portal, focus trap, Escape handling, scroll lock and focus return. `requests/request-details.module.css` owns this layout; scope overrides to this drawer and the Version 2 overlay host. Filters and other record drawers retain their existing geometry. The actual animation-settings context selects the original Version 1 JSX; preserve its content as well as its dimensions when changing the new workspace.
- Keep the close control in a fixed header outside the scrolling body. Customer identity, received time and current status lead into a desktop main column (message, optional linked product and request metadata) with a separate contact/management column. Below 56rem, stack the columns; retain 44px controls, safe-area padding, native document direction and reduced motion. Avoid nested message scroll regions.
- Long product names/SKUs, email addresses and request identifiers must stay bounded. Explicitly bound grid tracks with `minmax(0, 1fr)` and keep `OverflowText` for display rails. When a rail sits inside a link, keyboard focus on the link must stop animation and reveal its complete text. Messages wrap in full; optional missing contact/product/message content has truthful empty states. Preserve immediate protected assignment/status updates and inline success/error feedback.
- Verify with `REQUEST_DETAILS_BASE_URL=http://127.0.0.1:<port> REQUEST_DETAILS_OUTPUT_DIR=/tmp/miro-request-details-review node scripts/verify-request-details.mjs`. The harness authenticates a disposable admin, intercepts request/directory reads and update writes with synthetic fixtures, checks actual dialog geometry and keyboard behavior, scans the portaled dialog with axe, and deletes its actor in `finally`.

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
