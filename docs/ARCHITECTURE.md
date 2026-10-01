# Architecture Boundaries

## Rendering/Caching Decisions

- Public content is server-rendered and cached appropriately.
- Private content is rendered on the server with user-specific data.
- Client components are used for interactions (theme switching, mobile navigation, forms).

## Data Flow

- Route files handle framework conventions and compose screens.
- Feature modules contain business validation, components, and use cases.
- Server-only data access verifies identity and permissions and queries Supabase.
- Database constraints, grants, and row-level security enforce data ownership.
- Shared UI components contain presentation and accessibility, not hidden business permissions.

## Catalog and inventory workflow (2026-10-01)

- The public store, category, and product pages render active Supabase products only. Local mock products are for the isolated catalog preview; they must not be mixed into live routes when a database read fails or the catalog is empty.
- A product starts as a draft. Admin/CEO add a sellable variant, set its stock through the inventory ledger, and publish the product. `product_variants.stock_qty` is the canonical quantity; the legacy `products.inventory_count` must not be edited or displayed as current stock.
- Admin/CEO stock receipt, adjustment, and outgoing actions call the authenticated stock RPCs. Those RPCs write stock movements and audit events together. Public pages sum active variant quantities and show the remaining count on the store and product page.
- The customer cart and checkout request do not reserve stock or create an order. The enquiry route checks current canonical product/variant identity, available quantity and price before submission and stores a server-derived estimate. Staff must confirm current stock before recording a sale through the authenticated sale RPC.
- Migration `20261001000000_catalog_atomic_writes.sql` adds transactional product and variant creation with actor audit, preserves variant history on archive, records unattributed opening snapshots for legacy stock and restricts public catalog column grants. The API create paths require this migration before use. Historical seeded balances have no identifiable movement actor.
- Open storefronts refresh within five seconds and on focus. Database Realtime is not enabled for product rows because their full payload includes private cost data. Do not describe this as guaranteed instantaneous sync.
