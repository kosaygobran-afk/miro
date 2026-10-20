# MIRO POS: implementation and operating contract

Updated 2026-10-17. This supersedes the earlier redesign's placeholder layout and verification claims. The POS is a protected cashier workspace; payment-provider and official-document activation still require the business readiness described in `commerce/`.

## Interface and component ownership

The three owner references guide rounded icon tiles, a receipt/cart beside a product catalog on desktop, and a compact touch catalog with a persistent total/cart action on phones. MIRO's existing semantic theme tokens remain the palette. No restaurant copy, fabricated notifications, connection guarantees or unsupported hardware actions were copied.

- `pos-window.tsx`: per-actor draft validation/persistence, cart/customer/tender state, synchronous submission guard, canonical quote review and uncertain-write reconciliation.
- `pos-shell.tsx`, `pos-topbar.tsx`, `pos-workspace.module.css`: icon menu, desktop two-panel composition, live browser network indication and container-width responsive reflow. At 740px or narrower the product/cart views alternate with a persistent bottom action. The cart remains reachable in short landscape viewports.
- `pos-catalog.tsx`, `use-pos-catalog.ts`: localized real search, API category filters, bounded pagination, generation/abort guards and exact SKU/barcode lookup outside the visible category/page. Refresh after a completed sale invalidates old availability.
- `pos-product-card.tsx`, `pos-variant-picker.tsx`: single-variant add, multi-variant explicit choice, live available-stock disabling, readable titles and image-error fallback.
- `pos-cart.tsx`, `pos-cart-line.tsx`, `pos-order-summary.tsx`: exact agorot-derived totals, bounded quantity/discount editing, explicit draft allocation labels and accessible clearing confirmation. VAT is unknown until a real applicable rate is loaded; the canonical quote is checked before tender writes.
- `pos-customer-sheet.tsx`: controlled shared dialog, existing account selection and editable guest sale details; guest email is optional. Closing does not remove a selected customer.
- `pos-payment-panel.tsx`: localized icon methods, external-recorded versus provider-collected explanation, exact split allocations, cash received/change and capability-gated collection. Method labels alone do not charge a gateway. Cash recording requires an open shift.
- `management-tool-provider.tsx` and `floating-workspace-window.tsx`: shared drafts/window lifecycle, early-open hydration protection, viewport bounds, real native fullscreen where supported, shared overlay portals, Escape handling and edge-to-edge fallback. Calculator behavior remains separate.
- `sales-panel.tsx`: launches this same POS instead of a second obsolete sale editor; sales history/filter/details remain mounted and refresh when POS closes.
- `features/commerce/payment-page-client.tsx`: hosted payment return/status, remaining split balance and cashier-only return link. Unknown attempts block another charge; operation keys survive reload in the same tab.

## API and data authority

`GET /api/management/pos/catalog` requires active `recordSale` authorization. It returns only active POS-enabled variants, server POS price precedence and stock net of effective reservations. Search terms are safely quoted for the PostgREST filter grammar; pagination/input are bounded, responses are private/no-store and rate-limit failures stop the read. Availability aggregation uses service-only `commerce_pos_available_stock`, with bounded UUID batches.

Cashier images use the first `product_images` entry ordered by `sort_order`, matching the editor/storefront gallery. Only a missing gallery uses the legacy `products.image_url` field. Gallery removal/restoration therefore also appears in fresh POS reads; do not copy image URLs back into owner products to repair the presentation.

POS Accounts converts date controls through `reportingRangeParams`, sends only selected filters and uses the API's `payment-status` key and actual pending/paid/voided/refunded statuses. Cashier names are a paginated CEO/admin selector backed by the existing protected users API; the selected value is the cashier UUID. Summary/list failures remain visible after a refresh, pagination uses the server total, and range/filter changes reset the offset. Receipt details consume the nested `{order, order_items, order_payments, stock_movements}` response; closing/changing receipts aborts stale reads. Preserve these client/API contracts in `tests/unit/pos-accounts-dashboard.test.mjs`, including both locales and all-time ranges.

A sale creates `/api/management/commerce/intents`, then records confirmed external tenders through `/api/management/commerce/tenders`, or starts hosted collection through `/api/commerce/attempts`. `/api/commerce/intents/{id}` returns the authorized safe quote/status, attempt keys, actual order number and remaining balance. Staff-only POS resume links are excluded from guest payment-link responses. Website quote/status DTOs omit cost snapshots and internal customer/actor details.

The database computes price, VAT, discount, reservations and order totals. The browser's grand total never proves that all item prices are current; each quoted line and tax rate is reviewed. Finalization atomically writes one order, item/payment snapshots, stock ledger/audit and document outbox effect. Same-operation retries return the existing result; the same key with a changed payload or actor conflicts. Manual funds require explicit receipt confirmation in API and SQL.

Effective stock holds survive pending/unknown/nonterminal financial effects. Overdue partial captures enter reconciliation instead of silently releasing held inventory. Refund of money and physical return/restock are separate actions. Catalog/table column grants protect procurement, internal supplier and private POS pricing fields from anonymous/customer access; RLS alone cannot protect columns.

## Uncertain result and recovery

1. Save the same actor-scoped draft and operation key before every financial request/redirect.
2. When an intent creation or tender response is lost, protect cart, customer and payment allocations from edits. Do not receive the funds again.
3. Use **Check / finish pending sale**. Reuse the original create key if the intent ID was not received; query authorized status before tender retry. Skip a captured tender with the same key.
4. Pending/unknown provider attempts remain a reconciliation state. A browser redirect is not proof of payment.
5. **Cancel unpaid sale** unlocks only after server-confirmed safe cancellation. Partial/uncertain money cannot be discarded locally. Price/tax changes return to explicit review before further funds are recorded.
6. A verified final order clears the current draft and refreshes catalog availability. Reopening/minimizing/fullscreen preserves the draft. Draft storage is tab-local session storage, with age checks for nonfinancial drafts; no autonomous offline charge queue exists.

## Verification and evidence

Run the fresh commands recorded in `PROJECT_STATUS.md`; earlier counts are historical, not current evidence.

```sh
npm run lint
npm run typecheck
npm run build
node --test tests/unit/*.test.mjs
python3 scripts/verify-database.py
POS_REVIEW=1 COMMERCE_OUTPUT_DIR=/tmp/miro-pos-review python3 scripts/verify-commerce-integration.py
python3 scripts/verify-commerce-integration.py
```

The POS runner creates a disposable PostgreSQL database, applies actual migrations, exposes a bounded synthetic Supabase HTTP bridge and runs actual Next routes with synthetic authenticated actors. It never loads linked environment files, charges a real provider or changes owner inventory. The browser matrix covers Chromium/Firefox/WebKit, Hebrew/English, dark/medium/light and 320/390/768/1440px. Customer lookup is an explicitly intercepted empty fixture; named guest details and the sale traverse the actual API/database. Cash/change, a lost successful tender response, one order/payment/stock/outbox effect, variant/customer dialogs, keyboard, fullscreen and axe are observed, not inferred from source strings. Separate SQL multi-session tests cover concurrent reservations and replay.

Scoped new layout styles honor reduced motion and logical RTL properties. Native-screen-reader, physical iPhone/Android, real scanner and thermal printing review remain manual. Browser/network availability is not server health.

## Deployment and outstanding owners

Apply and verify the new additive migrations in order before deploying the dependent catalog/status changes. The isolated verifier is not evidence that linked Supabase is migrated. Never reset/reseed owner inventory or replace historical fiscal records. A rollback must preserve orders, attempts, reservations and reconciliation evidence; pause new writes before incompatible application rollback.

On 2026-10-09, the connected database was found to be 12 migrations behind the running application, causing missing POS price columns and missing commerce read/availability functions across the CEO pages. All pending migrations through `20261007040000` were applied after fresh isolated SQL/concurrency checks and an exact linked dry run. Historical deployment-blocker entries describe the earlier state.

For future rollouts, compare `npx supabase migration list --linked` and `npx supabase db push --linked --dry-run` with the application requirements, apply reviewed migrations before dependent app changes, and then run the connected HTTP read checks:

```sh
COMMERCE_LIVE_BASE_URL=http://localhost:3000 node scripts/verify-commerce-live-reads.mjs
```

This command loads the normal local connection configuration, creates and deletes a disposable CEO QA identity, and performs only GETs against existing business data. It checks products/categories, inventory, services, suppliers, requests, analytics/finance/settings/design, the POS catalog and gallery-image consistency, accounts with realistic date/payment/cashier queries, staff options, tax, customer lookup, sales and all commerce sections, plus anonymous denial. Evidence goes to a local temporary directory by default; `COMMERCE_LIVE_OUTPUT_DIR` overrides it. It never charges a provider or seeds/reset business records. Use the actual running application origin for deployment checks; do not mistake isolated fixture success for connected-schema readiness.

Account reporting functions require the actor's authenticated server client, not a service-role RPC call: SQL retains `active_app_role()`/`auth.uid()` authorization. Keep the management capability/rate-limit checks, non-null default list date bounds, actual nested detail projection, 404 missing-order handling and private/no-store responses. Regression coverage is in `tests/unit/pos-accounts-api.test.mjs`.

Business/provider owns merchant/card/bit setup and real signed sandbox exchanges; accountant/business owns verified identity, document types, signing/allocation/retention and official issuance. Privacy owns retention/visibility approvals; QA owns manual bilingual accessibility and real device/hardware review. Full C01–C18 status is in `commerce/IMPLEMENTATION_STATUS.md`. A provider flag, draft PDF, recorded external tender or local fixture is not live certification.
