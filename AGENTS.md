<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Legal Reminders

At each milestone, briefly report newly relevant legal/privacy/accessibility issues and outstanding launch blockers, with an owner/action.

# AI Handoff Logging

After every meaningful project change, update `docs/PROJECT_STATUS.md` with:

- what changed
- why it changed
- commands run and whether they passed
- remaining blockers or owner actions

When a change affects how future agents should work, also update the relevant docs in `docs/` or this `AGENTS.md` file.

# Premium storefront enhancement — 2026-09-20

This update aligned the existing MIRO frontend with the supplied premium dark storefront reference and strengthened the experience without changing the core architecture. The site remains a Phase 1 front-end foundation, but the presentation now reads more like a premium Israeli security brand storefront instead of a generic placeholder.

What changed:

- refined the dark theme palette toward a more premium black/charcoal/yellow system with stronger contrast and calmer shadows
- elevated the visual hierarchy of the header, hero, cards, and CTA surfaces to match the provided reference more closely
- improved the storefront hero treatment with stronger radial glow, tighter typography, and a more product-focused composition
- upgraded the product cards and store sections so they feel more premium, brighter, and more conversion-friendly
- kept the site fast and lightweight by relying on CSS tokens and existing SVG/icon techniques instead of adding libraries or heavier UI frameworks

Why this change was needed:

- the previous version was structurally correct but visually more like a clean prototype than a premium business storefront
- the reference showed a stronger luxury-security look with darker surfaces, sharper contrast, gold accents, and denser product merchandising
- the site should now better match the intended MIRO brand direction before the next engineering phase starts

Files touched:

- src/app/globals.css
- src/app/[locale]/(public)/store/page.tsx
- src/components/layout/header-client.tsx

Commands run and status:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Remaining blockers / owner actions:

- real authentication and database/role work are still deferred to Phase 2
- final legal, privacy, accessibility and business identity approvals are still required before public launch
- actual product photography, approved pricing and catalog inventory remain pending and must be provided by the business owner

Future AI handoff note:

- the visual direction remains premium dark storefront, but the site is still a front-end preview and not a real commerce or operations system
- do not treat the current product data or submission flows as production-ready
- when further design updates are made, preserve the black/yellow premium palette and the clean three-level IA pattern: Home > Services > Store > Contact

# Three-mode theme refinement — 2026-09-20

This follow-up focused on the interactive theme experience requested by the owner: a premium three-mode system with dark, medium and light selections, a calmer medium-gray mode for readability, and a more intentional navbar treatment in the brighter modes.

What changed:

- expanded the global theme system to support `dark`, `medium` and `light` states through CSS tokens in `src/app/globals.css`
- set the default bootstrap script in `src/app/[locale]/layout.tsx` to prefer `dark` or `medium` from system preference, while honoring a stored user theme from `localStorage`
- assigned the new medium mode as the soft gray ergonomic default for long-form reading, with higher contrast and less visual fatigue than the brighter white setting
- refined the navbar and header surfaces so the bright/light theme reads as premium and cohesive rather than visually mismatched to the overall storefront direction
- converted the theme control into a switch-style segmented control with three state labels (D / M / L) to match the product-quality design intent
- kept the navigation hierarchy stable while making the control feel more polished and intentional in both desktop and mobile layouts

Why this change was needed:

- the previous theme system only supported dark and light, which did not match the requested enhanced design flow
- the bright mode navbar was too visually detached from the premium storefront language and needed a calmer, more aligned treatment
- the owner explicitly requested a medium mode that feels like a bright gray, easy on the eyes, and polished enough for long content reads

Files touched:

- src/app/[locale]/layout.tsx
- src/app/globals.css
- src/components/layout/header-client.tsx

Commands run and status:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Launch notes:

- no backend or data-layer change was introduced; this remains a front-end styling refinement
- manual design review should still confirm the final light/medium/dark balance on actual devices before launch
- legal/privacy and business approval remain required for any public-facing copy, photography or commercial claims

# Full-width premium density pass — 2026-09-20

This follow-up corrected the remaining layout feeling of too much empty space on the right side of the pages and increased the visual density so the site uses the available viewport more fully while preserving the premium MIRO brand personality.

What changed:

- widened the shared page container so the main content shells stretch further across the screen
- added more internal padding inside major page sections so cards, panels and text sit with richer breathing room
- increased the density of landing and services sections with extra stats, feature cards and richer mock content related to security and operations
- kept the internal component blocks centered and readable, while letting the page itself feel more filled and premium
- tied the added content to the security-business theme so the extra copy still feels real and editable later by the CEO/admin owner

Why this change was needed:

- the site was structurally solid but still felt too narrow and too empty on the right side
- the owner wanted the pages to feel fuller, richer and more content-dense without breaking the MIRO direction or readability
- the visual language needed stronger “value and coverage” cues while preserving a premium, calm editorial look

Files touched:

- src/app/globals.css
- src/app/[locale]/(public)/page.tsx
- src/app/[locale]/(public)/services/page.tsx

Commands run and status:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Important notes for future agents:

- keep the full-width, rich-content composition but preserve the centered inner grouping inside each component
- any extra content blocks should remain editable by the CEO/admin later without requiring deeper architectural changes
- real owner-approved copy and final product catalog data are still required before launch

# Test data seed for local storefront validation — 2026-09-20

This pass added a small live database seed for the storefront catalog so the store pages can be tested with real rows in Supabase before the business owner provides final catalog content.

What changed:

- inserted a few sample categories: Security Cameras, Alarm Systems, and Intercom & Access
- inserted six example products with realistic Hebrew/English names, prices and image URLs
- added matching product image rows for the seeded products
- kept the content clearly as validation/test data rather than final product inventory

Why this change was needed:

- the storefront routes needed to render with actual data and realistic category/product relationships during local validation
- the app was already wired to use Supabase catalog data, but there was no real content to exercise that path in a live environment
- the seed allows visual and flow checks without pretending the catalog is final or approved

Files touched:

- supabase/schema.sql
- live Supabase database via the project connection

Verification:

- npm run lint — passed
- npm run typecheck — passed
- npm run build — passed

Important notes for future agents:

- this data is mock validation content only and should not be treated as approved inventory or business pricing
- replace or expand these rows with real owner-approved catalog data before marketing or checkout launch
- do not interpret this seed as a production inventory system or a legal product catalog

# Premium website release — 2026-09-21

- The latest design rules live in `docs/DESIGN_SYSTEM.md` under the 2026-09-21 entry; they supersede older container and placeholder styling notes. Shared wide containers are 112rem maximum with narrower informational/auth panels.
- Preserve all three themes, both locales, keyboard support, small-phone layouts and reduced motion. Never hide the site based on viewport size.
- New visual layers are `premium.css`, `experience.css` and `storefront.css`. Pure catalog helpers must remain outside client-only modules when called from server pages.
- The shared workspace may contain unrelated unfinished canvas/dashboard work. That work, its database schema and package changes were intentionally excluded from the verified `0.0.2` website release. Preserve it separately; do not fold it into storefront changes or bypass its failing checks.
- Catalog illustrations, sample prices and editable page content are previews. Real business facts, contact delivery, commerce, privacy/legal approval and manual accessibility review remain launch work. See `docs/PROJECT_STATUS.md` for checks and owners.

# Customer storefront design and navigation — 2026-10-02

- Preserve the established public dark/medium/light black/charcoal/gold themes. `src/styles/customer-refinement.css` enhances the customer experience without importing the console's neon palette. See `docs/CUSTOMER_DESIGN.md` for the public contract and operating steps.
- `/[locale]/admin/store-design` is CEO-editable and admin-read-only. Enforce writes in API authorization and the `update_storefront_design` database function; never weaken either check. Saves require the current revision and audit atomically. Public reads use `get_public_storefront_design`, never anonymous access to all `business_settings`. Inventory defaults use their separate, limited public RPC.
- Uploads use `/api/management/storefront/design/assets`, CEO-only, same-origin, 5 MB limits, content sniffing and safe SVG validation. An upload prepares a draft; publishing makes it visible. Use owned media storage where possible. Deleting a slide/brand removes its design entry, not shared storage assets.
- Reference catalog entries are real model references with manufacturer source metadata, original illustrative SVGs, unpublished prices and zero confirmed stock. Preserve quote-only behavior until the owner approves price/stock. Internal `MIRO-REF-*` barcodes are not supplier GTINs. Never invent availability, warranty, certification or authorized reseller status.
- Catalog artwork is published to the existing public `product-media` bucket so live database URLs do not depend on an unreleased frontend asset path. `scripts/seed-reference-catalog.mjs` is dry-run by default and additive with `--apply`; it preserves matching existing models and owner edits. Do not reseed or reset owner inventory.
- Mobile hamburger navigation is a document-positioned portal with glass styling. It floats above the hero and uses the document scrollbar; do not reintroduce a max-height/overflow scroll container or make the sticky header expand. Account popups portal separately, fit narrow phones, preserve focus, and Escape dismisses them before the enclosing navigation. Maintain the overlay hit-testing regressions in `tests/store-overlays.spec.ts`.
- Long customer product titles use `OverflowLabel`: measured continuous display-only rails, reading direction determined by the text, hover/focus pause, accessible single copy and static wrapping under reduced motion. Never animate input/textarea values. Product previews retain their stable 3D portal and configured hover intent; rails pause until the preview actually closes.
- Log meaningful changes and checks in `docs/PROJECT_STATUS.md`. Final manual bilingual accessibility review, catalog/brand rights approval and outbound notification/webhook implementation remain owner actions; existing enquiry intake is database-backed and checkout remains a request, without online payment or stock reservation.
- Store design revision conflicts use SQLSTATE `PT409`, applied by `20261002030000_storefront_design_conflicts.sql`. Do not raise `40001` for application version mismatches: hosted PostgREST retries serialization failures and may time out instead of returning a reviewable conflict.

# Version 0.1.0 release handoff — 2026-10-02

- The owner authorized the accumulated console and storefront work together for the `0.1.0` release branch and merge into `main`. Current package version is `0.1.0`; release scope, verified checks and remaining owners are in `docs/releases/0.1.0.md` and `docs/PROJECT_STATUS.md`.
- A local Vercel CLI environment export can be named `preview` without an `.env` prefix. Its exact root path is now ignored because it contains credentials. Never stage environment exports or print their values when preparing releases; scan staged content without echoing matches.
- Historical audit documents describe the September 28 baseline, not the current system. Treat current migrations, permission tests and latest completion/release records as the implemented state. Preserve both audit evidence and current verification evidence.

# Motion, Version 1 restoration and component refinement — 2026-10-02

- Read `docs/ANIMATION_SYSTEM.md` for the motion contract, CEO controls, file map and verification. Use shared `MotionLink`/motion router, motion tokens, region skeletons and `RevealImage`; connect effects to the existing explained switches. Reduced motion always wins. Keep navigation feedback independent of background refreshes and preserve opaque menu text while opening.
- Animation settings writes require active CEO authorization in both API and `update_animation_settings`, same-origin access, revision `PT409` and atomic audit. Public reads use the explicitly limited `get_public_animation_settings` projection. Keep the generic settings setter unable to overwrite this configuration or the protected backup.
- `appearance_version_1_backup` is immutable, including against service-role writes. Restore is a reviewable draft followed by explicit Save. New geometry/palette overrides must remain gated by `data-appearance-version="2"`; preserve `appearance-v1.css` and the original style layers. Personal theme preference, catalog, inventory, finance and storefront design content are outside this restore.
- Keep the CEO/management Dark palette intact. Version 2 public palettes exclude `.mgmt-shell-root` and `[data-management-surface="true"]`. Public Light uses warm quiet surfaces and darker gold text; public Dark/Mid retain charcoal/gold. Preserve Hebrew/English and 320px layouts.
- Analytics interpretation must state its actual data scope: UTC chart windows, recorded events, independently saved requests/orders, and the returned top-product cohort. Never label event ratios as attributed conversions or invent previous-period baselines. Finance ratios are order-backed; expenses are not included.
- Verification scripts support `REPORTING_OUTPUT_DIR` and `CONSOLE_OUTPUT_DIR` so new QA does not overwrite historical release evidence. Mock business saves, use disposable auth actors and clean them up. Record final checks and launch owners in `docs/PROJECT_STATUS.md`.

- Account history/saved previews are the latest ten source entries, not lifetime totals. `getSavedProductsWithCanonicalData` returns `null` on failure and an array on success; preserve independent errors and scoped role pricing. Product links use the normalized `category` key, not raw database category slugs. Forms keep independent statuses/drafts and never automatically retry uncertain writes.
- Navigation completion requires routed elements to exist and all `data-route-loading` markers to settle. A URL can commit before its streaming fallback mounts. Keep the indicator effect dependent on its enabled state/duration rather than settings object identity; equivalent server payloads and unrelated settings must not cancel an active trip. Cross-engine checks live in `playwright.cross-browser.config.ts`.
