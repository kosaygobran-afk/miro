@AGENTS.md

# CEO/admin control plane — 2026-09-24

The CEO/admin interface was built out per the owner's direction and verified end to end. Key facts future sessions must respect:

- Roles are `customer | worker | admin | ceo`. CEO and admin share one management console at `/[locale]/admin` and otherwise browse as customers; the header account menu (`src/components/layout/account-menu.tsx`) is the switch — prominent gold "Management console" entry for ceo/admin, worker area for worker, account for customer, plus "Switch to storefront" and a visible Log out.
- Only the CEO controls the users list: migration `supabase/migrations/20260924120000_ceo_user_controls.sql` makes `manage_account` CEO-only (admin is read-only there by owner decision) and adds `delete_user_account`. CEO accounts are protected from deletion except through the audited self-delete flow (`add_ceo`/`delete_own_ceo_account`) that preserves at least one active CEO.
- The initial CEO is `kosay.gobran@gmail.com`, activated by migration `20260924130000_bootstrap_ceo.sql` once the owner signs up and verifies the email (re-run `npx supabase db push --linked`, or an existing CEO runs `add_ceo`). Nothing else grants the CEO role.
- `GET /api/auth/session` returns `{ authenticated, role, name }`; `POST /api/auth/logout` returns JSON 200 for fetch calls and 303 for form posts.
- `profiles` has no `email` column — management user lists merge emails via the service-role `admin.auth.listUsers` server-side.
- New header i18n keys live under `layout.header.actions.*` in `src/messages/{en,he}.json`; `roleBadge` is interpolated client-side via `t.raw` + replace.
- Verification: lint, typecheck, build, format:check, 16/16 e2e, 20/20 recovery e2e, 60-combo design suite all passed. Run e2e against a custom port with `PLAYWRIGHT_REUSE=1 PLAYWRIGHT_BASE_URL=...` if 3000 is occupied.

Full details, legal notes (hard user deletion, admin PII visibility) and owner actions are in `docs/PROJECT_STATUS.md` (2026-09-24 entry); the permission model is documented in `docs/ROUTES_AND_ROLES.md`.

# Premium storefront enhancement — 2026-09-20

This session reviewed the existing AI handoff notes and matched the design direction to the supplied premium dark storefront reference. The goal was to elevate the current MIRO site from a clean front-end foundation into a more polished, higher-trust, more premium sales-facing experience without changing the project’s Phase 1 architecture.

What was improved:

- stronger dark-mode premium visual system with higher CTA contrast and more intentional gold accents
- hero and storefront layout improvements to make the page feel more product-driven and editorial
- more elevated card styling, shadows, and button emphasis to better match the supplied reference
- refined header and layout surfaces so the interface feels more premium and stable across desktop and mobile
- kept the site lightweight and production-safe by working primarily through CSS tokens and existing layout primitives

Why it matters:

- the current project was already usable and stable, but visually it still felt like a polished prototype rather than a premium brand storefront
- the supplied reference clearly emphasizes black luxury surfaces, sharper white copy, gold accents, and stronger product presentation
- this step was intended to make the front-end feel closer to launch-quality marketing before real business operations are added

Files reviewed and used as basis for this update:

- AGENTS.md
- CLAUDE.md
- docs/PROJECT_STATUS.md
- src/app/globals.css
- src/app/[locale]/(public)/store/page.tsx
- src/components/layout/header-client.tsx

Verification:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Important launch constraints still remaining:

- real authentication, roles, and data layer remain out of scope for Phase 1
- legal and privacy review is still required before public launch
- owner-approved product photography, price rules and catalog inventory are still pending

Future agent direction:

- keep the premium dark storefront palette and product-first merchandising approach
- continue treating the current store and forms as preview content only until the business and data layers are implemented
- preserve the separation between public front-end polish and future operational systems

# Three-mode theme refinement — 2026-09-20

This update addressed the owner’s follow-up request for a calmer premium theme system and an improved header treatment in the brighter modes. The design goal was to keep the strong MIRO storefront DNA while making the experience more readable, softer and more intentional across theme states.

What changed:

- added a three-mode theme pipeline: dark, medium and light
- made the medium mode the ergonomic gray-balanced default for long reading and comfortable browsing
- refreshed the bright/light navbar surfaces, so they feel aligned with the premium storefront rather than too stark or mismatched
- replaced the single icon toggle with a switch-style segmented control for a more polished, product-minded UI
- preserved the existing premium palette and motion language while reducing the visual friction of the very light theme

Why it matters:

- the previous dark/light split felt too limited for the requested design direction
- bright-mode navigation needed a more premium balance between readability, warmth and contrast
- the new medium mode supports a more human-centered visual rhythm across screens without abandoning the luxury dark storefront identity

Files reviewed and changed:

- src/app/[locale]/layout.tsx
- src/app/globals.css
- src/components/layout/header-client.tsx

Verification:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Future agent direction:

- keep the premium storefront palette consistent across all three modes
- treat the medium mode as the most comfortable reading mode for longer content and product browsing
- do not move the theme switch away from a segmented switch pattern unless the brand direction changes again

# Full-width premium density pass — 2026-09-20

This refinement addressed the sense that the pages still had too much empty space on the right and that the visual rhythm was too narrow compared with the premium reference direction.

What changed:

- widened the content shell so the page spans more of the viewport
- added more internal padding to the sections and component groupings to create a richer visual rhythm
- layered in denser mock content blocks for stats, service highlights and firm security-related copy to make the page feel more premium and complete
- kept the internal panels centered and readable, while letting the page overall use the full available width more confidently
- held the content within the MIRO brand direction instead of drifting toward a generic sales template

Why it matters:

- the site looked good, but the rhythm still felt too sparse and too boxed in on desktop
- the owner wanted the layout to feel richer and more confident, with more information present without becoming cluttered
- this update was aimed at a stronger business storefront feel while preserving future editability for the CEO/admin owner

Files reviewed and changed:

- src/app/globals.css
- src/app/[locale]/(public)/page.tsx
- src/app/[locale]/(public)/services/page.tsx

Verification:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Future agent direction:

- keep the page shell full-width while preserving centered inner modules and component pads
- add or remove content blocks via the owner edit layer later without reworking the page structure
- continue to align new text and blocks with the security, monitoring and trust positioning of MIRO

# Test data seed for local storefront validation — 2026-09-20

This pass added a small live database seed for the storefront catalog so the store pages can be tested with real rows in Supabase before the business owner provides final catalog content.

What changed:

- inserted a few sample categories: Security Cameras, Alarm Systems, and Intercom & Access
- inserted six example products with realistic Hebrew/English names, prices and image URLs
- added matching product image rows for the seeded products
- kept the content clearly as validation/test data rather than final product inventory

Why it matters:

- the storefront routes needed to render with actual data and realistic category/product relationships during local validation
- the app was already wired to use Supabase catalog data, but there was no live content to exercise that path in a real environment
- the seed allows design, navigation and data-flow checks without pretending the catalog is final or owner-approved

Files reviewed and changed:

- supabase/schema.sql
- live Supabase database project connected through the local VS Code integration

Verification:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Future agent direction:

- treat this data as mock storefront sample content only
- replace or expand it with approved pricing and inventory before any commercial launch
- do not consider the seed a production catalog or final legal product list

# Commerce / inventory / admin platform — 2026-09-25

The project now includes a full business layer. Future sessions must respect these architecture rules:

- **Products ≠ Services.** Products: catalog, variants, inventory, sales, analytics. Services: `service_requests` + quotes. Never share logic across the two; customer CRM shows them as separate labelled groups.
- **`product_variants` is the canonical sellable/inventory entity** (SKU/barcode unique, one default per product). Simple products have one default variant. `products.inventory_count` is deprecated — stock lives on variants.
- **Price `NULL` = not published** (never render ₪0; show the bilingual "price not published, contact us" fallback). Effective price precedence: role price → default variant override → base price.
- **Stock changes only via `record_stock_movement`/`adjust_stock` RPCs** (append-only `stock_movements` ledger). Sales only via `record_sale` (atomic order+items+stock+VAT snapshots). Never write `stock_qty` directly.
- **Permissions: `src/lib/permissions.ts` capabilities** — CEO: all; admin lacks manageUsers/manageTax/manageSettings. New management routes must use `withManagementAuth(request, capability)` from `_shared.ts`, never scattered role checks.
- **Admin console IA**: `/[locale]/admin` sections (overview, products, inventory, suppliers, sales, customers, analytics, finance, users, requests, audit, settings). Management components use inline `he ? ... : ...` ternaries and workspace.css classes; loading/error/empty states required; no fabricated metrics.
- **Analytics**: real events only via `POST /api/track` + `src/components/analytics/track.ts` (sendBeacon/fetch keepalive, `miro_sid` localStorage session, no fingerprinting). Reads are admin/ceo-only.
- **CEO bootstrap**: `kosay.gobran@gmail.com` via migration `20260924130000_bootstrap_ceo.sql` (owner signs up, verifies, re-runs `npx supabase db push --linked`).
- Known deferred items (see docs/PROJECT_STATUS.md 2026-09-25): Storage image uploads, serial-unit UI, CSV export, stock aging UI, storefront checkout.

Verification contract unchanged: lint, typecheck, format:check, build, `python3 scripts/verify-database.py`, e2e 16, recovery e2e 20, design suite 60 combos must stay green.
