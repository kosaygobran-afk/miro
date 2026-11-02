# Variant images, pricing and stock

Updated 2026-11-02 following the owner's request.

- Every variant has a stored quantity. New variants default to 0; an optional positive opening count is recorded through the existing stock ledger atomically with creation. A separate count/reason operation changes existing stock, checks the expected quantity and respects reserved stock. Never write `stock_qty` through the metadata editor or retry uncertain writes.
- Product availability totals sum active variants. Inventory totals are calculated from all siblings before search/status filters and pagination; archived variants retain their own historical quantities and are excluded from available totals.
- Each product image may be general (`variant_id IS NULL`) or assigned to one variant of the same product. Multiple images may share a variant. A composite foreign key enforces ownership even for direct/service writes. Assignment to a new inactive variant is rejected. Existing archived assignments remain visible in management and can be cleared. A restrictive SELECT policy also inherits the assigned variant's existing visibility/audience rules; general product images retain their original product policy.
- Global main image remains the first image by the established sort order. Main-image status and variant assignment are independent. File/URL uploads first belong to the product; use the image's assignment selector afterward. Setting another image as main moves it first. No original images or owner assignments are changed by the migration.
- In product detail and eye preview, selecting a variant shows its sorted images first and general images afterward. Other variants' images are excluded. If there are no matching/general images, show the established placeholder. Main-image media on catalog cards preserves global ordering.
- Selection updates price, SKU/barcode, quantity, gallery, detail quote parameters and cart variant together. Zero stock remains selectable for inspection/enquiry and disables cart addition. Explicit variant price applies to all customer types; an empty variant price falls back to the existing product role price, then base price. Public promotions use that same resolved price. Never fall back to the price of an unrelated default sibling when a variant is selected. Preserve `null` base prices through UI props.
- Existing permissions remain: active admin/CEO manage catalog and stock; public reads expose assignment metadata, never private originals/costs. No payment or official invoice readiness is enabled by this work.

## Additive integration

`20261102010000_variant_media_stock.sql` adds `update_catalog_image`, `create_catalog_variant_with_stock`, `adjust_catalog_variant_stock` and `management_inventory_variant_list`. They wrap existing RPCs so deployed validation, status/audience/revision, reservation and audit rules remain authoritative. `20261102020000_variant_media_visibility.sql` protects assigned-image reads through the existing variant RLS. Catalog version triggers continue to notify open storefronts.

The linked database preflight revealed catalog hardening absent from the repository migrations. **Do not overwrite live legacy catalog RPCs from the older local definitions.** Engineering/owner must reconcile that pre-existing schema-source drift separately; the additive wrappers were tested against both environments.

## Verification

- `python3 scripts/verify-database.py`: disposable migrated PostgreSQL, permission suites and stock concurrency.
- `node --test tests/unit/variant-media-pricing.test.mjs tests/unit/variant-management-api.test.mjs tests/unit/inventory-pagination-api.test.mjs tests/unit/product-image-reprocessing.test.mjs`: gallery/pricing, authenticated API wiring/validation/conflicts, bounded pagination and original-media regressions.
- `python3 scripts/verify-variant-experience.py`: copies real components into a temporary Next app, uses synthetic HTTP responses only, exercises both languages/appearance versions and role price fallbacks. Never loads repository env files or writes owner business data.
- `npx supabase db query --linked --file supabase/tests/variant_media_stock.sql`: linked permission/media/ledger proof, all fixtures rolled back.

Manual bilingual screen-reader, physical-device and image-rights/approved-price approval remain QA/business-owner launch actions.
