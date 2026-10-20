# Main categories and subcategories

The catalog has two levels. Existing categories remain main categories (`categories.parent_id is null`). A subcategory has one main category as its parent. Products use `category_id` for their main category and may use `subcategory_id` for an optional child. Creating a product requires a main category, including a draft.

## Management

Open `/he/admin/categories` or `/en/admin/categories`. Use **Add subcategory** on a main category to create its child. Ordering applies among siblings. Categories with products or children cannot be deleted or moved under another category until those assignments are resolved.

In product creation or editing, select a main category, then optionally a matching subcategory. **Create subcategory** creates the category immediately and selects it for the current draft; save the product to persist its assignment. Changing the main category clears the old child. Both forms explain that the main category is mandatory and assignments can be changed later. An uncertain inline category creation must be reconciled with a read before another attempt.

Deactivating either level hides affected active products. Reactivation does not automatically publish products. The database permits unrelated edits to historical unclassified drafts; no migration invents classifications for them.

## Storefront

Main category pages use `/[locale]/store/[rootKey]`. Subcategory selection uses `?subcategory=[childSlug]`, preserving existing `/[category]/[productSlug]` routes. Children use their literal slug; only main categories use shared legacy alias normalization. An invalid or unrelated subcategory does not render another category's products.

The main-category bar starts collapsed on entering a category page and displays the selected main category in a compact current-location card. A labeled chevron expands/collapses the list. Both selected levels are highlighted.

Subcategories render as their own full-width bar directly under the main-category band: a small reading-start label and one scrollable row of chips (Never a side column). Chips keep the current search query in their links, show per-subcategory product counts with an honest zero, and highlight the selected child. When the row overflows it stays one line with edge fades and non-sequential Step buttons that follow the reading direction; the active chip is scrolled into view on mount (or start-aligned when wider than the rail) without moving the page. Search and sort sit in their own row after the bar. Reduced motion disables snappy transitions; keyboard users reach every chip by tabbing. Layout coverage is asserted by `scripts/verify-category-hierarchy.mjs` for widths 320/390/768/1440, both locales and appearance versions.

Version 2 category controls center labels using equal reserved edge slots, with category media at the reading-direction start and the navigation icon at the end. Hebrew places media on the right and the entry icon on the left; English mirrors the positions. Narrow-phone cards keep opposite-corner icons above a centered full-width label. See the centered-control contract in `docs/DESIGN_SYSTEM.md`; Version 1 retains its original layout.

`StoreCatalog.categories` and global navigation contain roots only; `StoreCatalog.subcategories` contains children separately. Public products require a visible main category and, when assigned, a visible matching child. Never flatten children into root navigation or apply root aliases to child slugs.

## Database and verification

Migration `20261017010000_two_level_catalog_categories.sql` adds the optional FK without rewriting rows. Triggers enforce two levels, required roots for new products, matching assignments, active publication and safe deletion/reparenting. `update_product` clears an omitted old child atomically when changing roots. Keep PostgREST relationships explicit (`products_category_id_fkey` / `products_subcategory_id_fkey`) because products have two foreign keys to categories. Preserve authorization, private-column grants and audits.

Migration `20261017020000_catalog_root_route_uniqueness.sql` prevents separate roots from sharing a legacy normalized URL (for example, `tools` and `accessories`). Choose a distinct root slug when its route is already taken. Child slugs are not normalized by this guard. The immutable SQL helper `catalog_category_route_key` mirrors the client alias mapping; any future alias changes require a reviewed migration that checks collisions and rebuilds the expression index. Replacing the helper alone leaves stale index keys.

Use `python3 scripts/verify-database.py` for disposable migration/SQL coverage, `node --test --test-concurrency=2 tests/unit/*.test.mjs` for Node regressions, and `scripts/verify-category-hierarchy.mjs` for browser checks. Browser checks default to intercepted management writes. Opt-in public checks require `CATEGORY_HIERARCHY_FIXTURES=1` and create only uniquely identified, zero-stock, unpublished-price QA rows with cleanup in `finally`. Never edit owner catalog rows for QA. Actual results and live migration status are in `docs/PROJECT_STATUS.md`.

Search continues within the selected subcategory; **All products** returns to the main category's full selection.

No payment, pricing, availability claim or personal-data collection is introduced. Business owners approve public category labels; accessibility owners retain manual bilingual screen-reader, zoom and device approval.
