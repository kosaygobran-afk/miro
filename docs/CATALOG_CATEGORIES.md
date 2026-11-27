# Main categories and subcategories

The catalog has two levels. Existing categories remain main categories (`categories.parent_id is null`). A subcategory has one main category as its parent. Products use `category_id` for their main category and may use `subcategory_id` for an optional child. Creating a product requires a main category, including a draft.

## Management

Open `/he/admin/categories` or `/en/admin/categories`. Use **Add subcategory** on a main category to create its child. Ordering applies among siblings. Categories with products or children cannot be deleted or moved under another category until those assignments are resolved.

Active CEOs can open **Settings → Store category grid artwork** to select a main category. **Edit shared names** opens its canonical Hebrew and English fields. A name save applies to the category across storefront navigation, filters and product pages. **Edit photo and SVG** previews and publishes media for the grid below the navbar. Existing catalog permissions still apply to the shared fields.

Use a centered 3:2 photo at 960 × 640 px or larger, up to 4 MB and 16 megapixels. JPEG, PNG, WebP and AVIF uploads are converted to still WebP without photo metadata. For SVG, use a transparent `viewBox="0 0 240 160"` and leave padding around detailed, recognizable equipment. Keep lettering and product names outside the artwork. Graphics-only SVG up to 32 KB supports shapes, paths and local gradients. The photo fills the frame, and a custom SVG overlays it as a badge when both are saved. Removing both restores the bundled drawing.

In product creation or editing, select a main category, then optionally a matching subcategory. **Create subcategory** creates the category immediately and selects it for the current draft; save the product to persist its assignment. Changing the main category clears the old child. Both forms explain that the main category is mandatory and assignments can be changed later. An uncertain inline category creation must be reconciled with a read before another attempt.

Deactivating either level hides affected active products. Reactivation does not automatically publish products. The database permits unrelated edits to historical unclassified drafts; no migration invents classifications for them.

## Storefront

The localized Store landing page has a root-category grid beneath the navbar. It uses the published category names and destinations and has the DOM ID `store-top-categories`. Its Categories heading follows the gold eyebrow and alignment of the collection hero on Home. The desktop grid fits as many cards as the width permits and wraps when its minimum card width is reached. Phones and compact tablets start with one row and can expand or collapse the remaining links with the three-chevron button. On fine pointers, the artwork and name magnify together over adjacent cards while their link bounds and grid positions stay fixed. Keyboard focus uses the same visual treatment. Reduced motion and the shared micro-interaction setting control magnification. The row below the grid uses `ProductSubNav`, which also serves category pages.

Main category pages use `/[locale]/store/[rootKey]`. Subcategory selection uses `?subcategory=[childSlug]`, preserving existing `/[category]/[productSlug]` routes. Children use their literal slug; only main categories use shared legacy alias normalization. An invalid or unrelated subcategory does not render another category's products.

The 2026-11-01 owner reference follow-up makes the Version 2 main-category bar a visible horizontal row, with the active root scrolled into view and highlighted. Version 1 retains the collapsed current-location card and labeled expand/collapse control. Both selected levels remain highlighted; subcategories retain their separate row.

Subcategories render as their own full-width bar directly under the main-category band: a small reading-start label and one scrollable row of chips (Never a side column). Chips keep the current search query in their links, show per-subcategory product counts with an honest zero, and highlight the selected child. When the row overflows it stays one line with edge fades and non-sequential Step buttons that follow the reading direction; the active chip is scrolled into view on mount (or start-aligned when wider than the rail) without moving the page. Search and sort sit in their own row after the bar. Reduced motion disables snappy transitions; keyboard users reach every chip by tabbing. Layout coverage is asserted by `scripts/verify-category-hierarchy.mjs` for widths 320/390/768/1440, both locales and appearance versions.

The 2026-11-24 Version 2 refinement uses frameless category headlines, text-height dividers and an underline for the selected category. Filter counts follow the label in the reading direction. The root and child navigations and the local catalog filter keep their distinct behaviors.

`StoreCatalog.categories` and global navigation contain roots only; `StoreCatalog.subcategories` contains children separately. Public products require a visible main category and, when assigned, a visible matching child. Never flatten children into root navigation or apply root aliases to child slugs.

Product cards, quick previews and detail headings display the main category followed by its assigned subcategory, if any. Card paths wrap so long labels stay visible. The detail breadcrumb links the child to the root category route with its literal `subcategory` query parameter; products without a child show only the root.

## Database and verification

Apply `20261127010000_storefront_category_artwork.sql` before enabling CEO artwork publication. The service-only writer rechecks the active CEO, validates revisions and records successful changes with their audit event. Public reads project published graphics for active roots. Validated SVG renders through image sources, and photos use the existing public product-media bucket. An artwork read failure falls back to the bundled equipment drawings. Review rights and personal information before uploading public photos.

Migration `20261017010000_two_level_catalog_categories.sql` adds the optional FK without rewriting rows. Triggers enforce two levels, required roots for new products, matching assignments, active publication and safe deletion/reparenting. `update_product` clears an omitted old child atomically when changing roots. Keep PostgREST relationships explicit (`products_category_id_fkey` / `products_subcategory_id_fkey`) because products have two foreign keys to categories. Preserve authorization, private-column grants and audits.

Migration `20261017020000_catalog_root_route_uniqueness.sql` prevents separate roots from sharing a legacy normalized URL (for example, `tools` and `accessories`). Choose a distinct root slug when its route is already taken. Child slugs are not normalized by this guard. The immutable SQL helper `catalog_category_route_key` mirrors the client alias mapping; any future alias changes require a reviewed migration that checks collisions and rebuilds the expression index. Replacing the helper alone leaves stale index keys.

Use `python3 scripts/verify-database.py` for disposable migration/SQL coverage, `node --test --test-concurrency=2 tests/unit/*.test.mjs` for Node regressions, and `scripts/verify-category-hierarchy.mjs` for browser checks. Browser checks default to intercepted management writes. Opt-in public checks require `CATEGORY_HIERARCHY_FIXTURES=1` and create only uniquely identified, zero-stock, unpublished-price QA rows with cleanup in `finally`. Never edit owner catalog rows for QA. Actual results and live migration status are in `docs/PROJECT_STATUS.md`.

Search continues within the selected subcategory; **All products** returns to the main category's full selection.

No payment, pricing, availability claim or personal-data collection is introduced. Business owners approve public category labels; accessibility owners retain manual bilingual screen-reader, zoom and device approval.
