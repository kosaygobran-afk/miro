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
