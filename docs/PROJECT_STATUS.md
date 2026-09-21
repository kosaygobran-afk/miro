# Project Status

Last updated: 2026-09-21 (Phase 2 authentication and deployment repair)

## Phase 2 Authentication, Permissions And Deployment Repair — 2026-09-21

Current phase: Phase 2 implementation and database rollout; final deployment verification in progress. This entry supersedes older Phase 1 “next task” notes below.

- Completed cookie-backed authentication, session refresh, safe confirmation callbacks, password recovery/reset validation, localized logout and server-side customer/worker/admin/CEO guards. Missing development credentials keep public pages available and disable account submission.
- Added profile updates, authenticated service requests, worker assignment/status workflows and audited account management. Administrative operations use authenticated RLS/RPC permissions, not a browser-exposed service key.
- Fixed profile role/status escalation, legacy inactive-catalog visibility, customer-controlled order writes, admin changes to CEO accounts, open redirects and cross-origin writes. Follow-up migration fixes SQL NULL handling for unassigned workers.
- Added CEO password re-verification, verified email-change initiation, promotion of existing verified accounts and self-deletion. CEOs cannot demote/block another CEO; deletion has no target argument and atomically preserves at least one active CEO. The user-designated initial CEO was provisioned; no password or private key is stored in the repository.
- Applied migrations 20260921220000, 20260921221000 and 20260921223000 after isolated PostgreSQL tests. Earlier foundation/account migrations were already present remotely. Regenerated database types from the linked schema.
- Added explicit Vercel Next.js framework/build/output configuration after live diagnosis showed public images available but all application routes returning platform NOT_FOUND. Canonical URL configuration now accepts APP_URL and Vercel’s production domain.
- Preserved the premium storefront and existing catalog. Public guest contact remains an explicitly labeled preview; authenticated requests are functional. Checkout/payments, invoicing issuance, catalog editing and email notifications are subsequent commerce/operations work, not completion claims for this authentication phase.

Verification:

- Isolated PostgreSQL: every migration applied; customer A/B isolation, anonymous access, metadata escalation, profile column permissions, admin/CEO restrictions, worker assignment, suspended writes and transactional audit tests passed.
- CEO database tests: password freshness, unverified target rejection, protected peer CEO, self-deletion and last-active-CEO invariant passed.
- Production build, lint, TypeScript and formatting checks passed before the final CEO additions; final checks recorded below after release validation.
- Real CEO sign-in, account/admin rendering and rejected incorrect re-verification password: passed against the linked Supabase project.
- `python3 scripts/verify-database.py`: all seven migrations and both access/CEO test suites passed in disposable PostgreSQL.
- Browser suite: 16 tests passed for public routes, localization, accessibility smoke, anonymous protected routes, callback redirects, origin checks and password confirmation.
- The private service key was corrected in ignored local configuration using authenticated project access; the new management flows do not require it at runtime.

Outstanding launch actions:

- Engineering: finish release/deployment verification; Supabase site URL and callback allowlist now include the correct production domain. Test actual inbox delivery with the owner. Do not claim SMTP delivery from database or browser mocks.
- Owner: change the temporary CEO password from the account security page after first login.
- Owner/legal: approve privacy and retention text for the now-live account/profile/request collection and self-deletion behavior. Business records and audit entries have separate retention needs. QA: manual screen-reader and device review remains outstanding.

## Removed Unneeded Canvas Worktree Changes — 2026-09-21

The uncommitted canvas/dashboard experiment and its related Supabase schema, package dependencies, local MCP configuration and utility changes were removed because they were outside the verified Phase 1 storefront scope and were not ready for safe release. The working tree now matches the pushed `0.0.2` release.

Verification:

- `git diff --exit-code origin/0.0.2 --`: passed.
- Source cleanup left no canvas/dashboard files or dependency changes; this status entry is the only remaining working-tree edit.

Future work:

- Reintroduce canvas/dashboard functionality only as a separately scoped Phase 2 implementation with reviewed migrations, authentication/RLS, localized routes, accessibility coverage and feature tests.

## Supabase Phase 2 Foundation — 2026-09-21

Implemented and applied the repository-side Supabase foundation to the linked Supabase project:

- unified browser and server clients around `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, with backward-compatible fallback to the older anon-key name
- rejected a publishable key when supplied as `SUPABASE_SERVICE_ROLE_KEY`
- added explicit catalog read diagnostics instead of silently hiding every connection failure
- added an additive migration for catalog tables, profiles, user roles, service requests, audit events, triggers, grants and RLS policies
- added initial TypeScript database definitions for those tables
- switched public catalog reads to the server Supabase client so they use the catalog RLS grants and do not require a service-role key

Verification:

- `npm run format:check`: passed
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm run build`: passed
- `git diff --check`: passed
- Supabase endpoint health responded.
- Remote migration `20260921205000` is applied and matches the local migration.
- Public-key REST verification returned HTTP 200 for `categories` and `products`; protected `profiles` and `service_requests` correctly rejected anonymous access.
- Added and applied `20260921211500_grant_service_role_access.sql` after the project required explicit `service_role` table grants for trusted server-side reads.
- `supabase db lint --local --fail-on error`: blocked because no local Supabase database is initialized.

Blocking owner action:

- Replace the local/deployment `SUPABASE_SERVICE_ROLE_KEY` with the actual private service-role secret before implementing admin-only workflows. The current local value is identical to the public publishable key and must not be used for admin reads.
- The migration has been applied to the linked project after an explicit confirmation. Future schema changes must be tested in staging before production.

## Premium Storefront And Public Experience — 2026-09-21

The website now follows the supplied premium black/gold and light storefront references with wider merchandising layouts, focused reading areas and usable interactive catalog controls.

What changed and why:

- Rebuilt the shared header/footer with an original geometric brand mark, five primary destinations, desktop/mobile product search, keyboard-operable category disclosure and directly selectable dark/medium/light themes. Removed the nonfunctional cart indicator.
- Introduced shared `premium.css`, editorial `experience.css` and catalog `storefront.css` layers. Full page frames use a 112rem maximum with consistent gutters; About/Contact/service details and authentication forms keep narrower measures.
- Rebuilt Home and Services with photographic equipment heroes, category navigation, home/business/network solution cards, a connected-system diagram, four project stages, useful FAQs and project CTAs. Home/business/detail service pages and About/Contact now share this composition and bilingual content structure.
- Rebuilt Store and category pages with original SVG hardware illustrations, searchable category-aware catalogs, price/name sorting, clear/reset, load-more and accessible native product dialogs. Product inquiry links carry the product name into the Contact preview message.
- Preserved the Supabase read path and added consistent localized fallback catalog data. Known fallback category routes remain reviewable when the connected test catalog omits them. Illustrations/prices remain explicitly sample content, with no invented ratings, partner endorsements or delivery/support guarantees.
- Removed the rule hiding the site on phones at 360px or below and short landscape screens. Added localized skip navigation, visible keyboard focus, menu Escape/focus return, reduced-motion handling and enlarged-text reflow.
- Kept the existing local image and existing website dependencies; no new frontend runtime package or database mutation was needed. Editable bilingual content arrays prepare the design for approved copy; a CMS is not implemented.

Verification and fixes:

- Release validation uses an isolated worktree at `/tmp/miro-release-0.0.2` with the website package metadata at `0.0.2`. An earlier unrelated canvas/dashboard experiment was removed from the working directory because it was outside this release scope. No check was disabled or weakened to make the release pass.
- `npm ci --ignore-scripts --no-audit --no-fund` in the release worktree: passed.
- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed for the isolated website release.
- `npm run build`: passed, 49 statically generated pages plus dynamic Contact/Store/category routes.
- `PORT=3101 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 npm run test:e2e`: all 7 Chromium tests passed. An initial category-route failure was fixed by moving the pure visual-kind helper outside the client component boundary.
- `DESIGN_BASE_URL=http://127.0.0.1:3101 node scripts/verify-design.mjs`: passed 60 Home/Store combinations (320/390/768/1440/1920px, Hebrew/English, dark/medium/light), 14 axe scans, keyboard menus, persistent themes, header search, reduced motion, small landscape and 200% text enlargement. Also passed catalog search/empty/reset/sort/category/dialog/inquiry/shared-query checks. An initial enlarged-text header overflow was corrected and the matrix rerun successfully.
- Additional production browser review: 56 route/viewport checks across Services, Home/Business solutions, four service details, About, Contact, Privacy, Terms, Accessibility and category routes; 30 more axe scans across both languages and three themes; no errors. Selected-product Contact prefill verified.
- Existing local development server checks: Hebrew Store, Cameras and English Network Gear returned 200 with populated cards and no browser errors; no database mutation was performed.
- Desktop Hebrew Home/Store, English Contact/Home Solution and phone light Store screenshots visually inspected. Review artifacts are local at `/tmp/miro-design-review`; they are not committed assets.

Launch blockers and owners:

- Business owner: approve final company/contact facts, service copy, real product photography, specifications, prices and availability. Current catalog and package content remain illustrative.
- Engineering/business owner: implement and validate actual inquiry delivery, checkout, inventory and protected-account workflows. The Contact preview explicitly does not submit data; this visual release does not certify pre-existing authentication work as production-ready.
- Owner/legal reviewer: finalize privacy, terms, accessibility statement and commercial claims before public launch. No analytics or new data collection was added.
- QA: complete manual screen-reader and real-device review; automated accessibility checks are evidence, not a substitute for that launch review.

Release branch: `0.0.2`, requested by the user for the verified website update. Website changes and prerequisite storefront foundation changes are included; canvas/dashboard functionality remains deferred to a separately scoped Phase 2 implementation.

## Full-Page Layout And Responsive Centering Pass

User requested continuing the design work so each page uses the available space more naturally, with content lowered or centered according to that page's purpose while preserving the established MIRO design DNA.

Changes made:

- Added reusable full-page layout primitives in `src/app/globals.css`: `miro-page-shell`, `miro-page-panel`, `miro-page-panel-narrow`, `miro-split-panel`, `miro-contact-layout`, `miro-split-copy`, `miro-contact-copy`, `miro-visual-grid`, `miro-visual-tile` and `miro-contact-form`.
- Bounded the shared wide container at `96rem` so large screens feel intentionally filled without allowing text and controls to drift across unlimited width.
- Gave short informational pages a viewport-aware shell that centers their main panel vertically when space permits while returning to natural document flow on smaller screens.
- Updated About, Privacy, Terms and Accessibility pages to use the narrower centered full-page panel treatment.
- Rebuilt Contact as a wide responsive split layout, with its copy and form balanced as one composition on desktop and stacked cleanly on mobile.
- Updated the Home and Business service pages to use centered split panels with responsive visual tiles, and updated individual service detail pages to use the shared full-page panel.
- Replaced remaining radial decorative backgrounds in the edited surfaces with restrained linear treatments, removed viewport-scaled heading sizes and removed negative letter spacing from shared CSS.
- Added mobile and tablet rules so split layouts collapse, copy centers where appropriate, visual tiles stack without overflow and compact pages no longer force artificial viewport height.
- Kept the Store, navigation hierarchy, theme system and existing page-specific layouts intact; this pass changes composition and spacing without adding new product or data behavior.

Verification commands and results:

- `npm run format:check`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass. The production build generated 49 static pages.
- `npm run test:e2e`: pass. All 7 Playwright Chromium tests passed against a fresh production build/server.
- Targeted responsive layout scan: Home, Store, Services, Home Service, Business Service, service detail, Contact, About, Privacy and English Contact returned 200 and had no horizontal overflow at 1440x1000 and 390x844.
- Targeted axe WCAG A/AA checks on Contact, About, Home Service and Store: pass, no violations.
- Visual screenshots of desktop Contact, desktop About and mobile Home Service were inspected during the session; temporary screenshots were not committed.
- Confirmed the local production preview was stopped after verification and no process remained intentionally running for this milestone.

Important notes for future agents:

- Use the shared page-shell and page-panel primitives for short content pages instead of adding one-off fixed margins or heights.
- Choose page-relative alignment: short informational pages may center vertically; catalog and long content pages should begin naturally near the top; split pages should center their columns as a group and stack on small screens.
- Preserve the `96rem` maximum width unless a tested page has a concrete reason to be wider. Keep readable text measures narrower inside that outer frame.
- Legal/privacy launch blockers remain owner/legal review of privacy, terms, accessibility statement, business claims, contact facts and future catalog/commerce behavior. Owner action: approve or replace public-facing copy before deployment.
- Accessibility launch blocker remains manual keyboard, 200% zoom and screen-reader review even though automated axe checks pass. Owner/QA action: complete manual assistive-technology testing before launch.

## Three-Mode Theme Refinement And Navbar Polish

User requested a richer theme system with bright, medium and dark states, a softer medium-gray mode for long reading, improved navbar styling in the brighter themes, and a switch-like control instead of a simple icon toggle.

Changes made:

- Added a third theme state in `src/app/globals.css`: `dark`, `medium` and `light`, with the medium palette tuned as a calm gray-neutral for eye comfort and readability.
- Updated the pre-render theme bootstrap in `src/app/[locale]/layout.tsx` to honor stored values and use a valid default that matches the new three-mode system.
- Refined the header surface and navbar color tokens so the bright/light navbar reads as part of the premium storefront instead of feeling visually detached.
- Rebuilt the theme control in `src/components/layout/header-client.tsx` as a segmented switch with D / M / L states and proportional thumb movement.
- Kept the existing MIRO brand direction intact: dark storefront, premium gold accents, and a professional security-brand feel without introducing heavy libraries or unnecessary animation.

Why this change was needed:

- The project had only dark and light support, which did not match the requested design flow.
- The light/bright navbar was visually weaker than the rest of the storefront and needed a more premium, cohesive treatment.
- The owner specifically requested a medium mode that is easy on the eyes while still reading as premium and modern.

Verification commands and results:

- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass.

Important notes for future agents:

- Keep the three-mode theme model intact: `dark`, `medium`, `light`.
- Treat medium as the default comfort mode for product browsing and extended reading.
- Preserve the segmented switch style and maintain a premium dark storefront tone across all modes.
- Legal/privacy launch blockers remain owner review of business claims, product imagery and public-facing copy before launch.

## Store Rename And Screenshot-Inspired Redesign

User supplied a store/e-commerce screenshot on 2026-09-20 as a visual reference, not as content to copy. User requested changing the Products section to Store, moving Store beside Home, keeping the MIRO design DNA, removing underline-style active effects, showing both section and sub-section active states, using rounded connected shapes, reserving product image slots for later CEO-managed images/items, and recording the work for future AI agents.

Changes made:

- Renamed the public product route surface to Store: `/he/store`, `/en/store`, and `/store/[category]`.
- Removed the live `/products` route files and added permanent redirects from `/products` and `/products/[category]` to the matching `/store` URLs.
- Moved Store directly after Home in the header navigation.
- Kept a two-level active state: Store stays active on `/store/*` and the selected store category subnav stays active on its own category page.
- Preserved rounded button/pill active states and removed underline-style active treatments from header/dropdown/subnav surfaces.
- Rebuilt the Store landing page around the supplied reference structure: top hero banner, department tiles, category rail, featured item cards, business package band, service/trust row and brand slots.
- Product images are intentionally placeholders/icons for now. Future real product images, editable item names, inventory and add/manage flows are still planned for the CEO/admin account and require the real data/admin layer.
- Localized Store copy, no-results text and cart/action labels in Hebrew and English.
- Added `dir="auto"` to product card text fields so English item names inside Hebrew pages keep sane number/text ordering.
- Replaced the Store hero's orb-like radial highlight with a linear treatment and changed the Store title to fixed breakpoint sizes instead of viewport-scaled type.
- Updated `src/app/sitemap.ts`, `tests/smoke.spec.ts`, `docs/ROUTES_AND_ROLES.md`, `docs/DESIGN_SYSTEM.md` and `docs/OPERATIONS.md` for the Store route and redirect contract.
- Removed a duplicate Hebrew `metadata.about` key from `src/messages/he.json`.

Verification commands and results:

- `npm run format:check`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass. Final build generated 49 static pages and shows `/[locale]/store` plus `/[locale]/store/[category]`, with no live `/products` route.
- `npm run test:e2e`: pass. 7 Playwright Chromium tests passed, including `/he/store`, old `/he/products/cameras` redirecting to `/he/store/cameras`, localized metadata and automated axe checks on home pages.
- Manual production preview: `npm run start` was ready in about 65ms.
- Targeted Playwright check: `/he/store` Store nav has `aria-current="page"`; `/he/store/cameras` Store nav has `aria-current="location"` and Cameras subnav has `aria-current="page"`.
- Targeted layout check: `/he/store`, `/he/store/cameras` and `/en/store` had no horizontal overflow at 1440px desktop or 390px mobile.
- Targeted axe WCAG A/AA check on `/he/store`: pass, no violations.
- Visual screenshots inspected at `/tmp/miro-store-final-desktop.png` and `/tmp/miro-store-final-mobile.png` during the session. Temporary screenshot artifacts were not committed.
- Confirmed no local process remains listening on port 3000 after verification.

Important notes for future agents:

- Public wording should remain Store / חנות unless the owner changes it. Internal component names may still say Product because the cards represent products.
- Preserve Store beside Home in the header.
- Preserve the two active levels: Store as the active parent section and the selected category as the active subpage.
- Product image slots are placeholders only. Do not fake CEO catalog editing or inventory; implement it later with real authentication, roles and storage.
- Legal/privacy launch blockers remain owner/legal review of business claims, product claims, legal pages, contact facts and any future catalog/commerce flow. This pass introduced no real data collection.
- Accessibility launch blocker remains manual keyboard, zoom and screen-reader review before launch, even though automated axe checks passed.

## Modern Rounded Design And Product Navigation Refinement

User requested a more modern rounded design, stronger contrast/shadows/lights, softer fast effects, removal of the double underline/button active effect in the header, active parent Products state on product subpages, active product subnav state, better centering/connected shapes, fast rendering and full AI handoff logging.

Changes made:

- Reworked global shape tokens in `src/app/globals.css` with larger shared radii, stronger but soft shadows, glow tokens and faster 140-160ms interaction transitions.
- Replaced header active underline/shadow effects with a single rounded active pill state.
- Made the Products header nav item stay active for all `/products/*` routes. Exact product category links in the subnav remain separately active, so users can see both the section and subsection.
- Removed underline-style `after` bars from product dropdown and product subnav active states.
- Added connected rounded surfaces for the product subnav rail, dropdown menu, search input, product card media, product icon shell and cards.
- Updated product listing layout from nested containers/grid tracks to a centered wrapping layout. Incomplete final rows now center correctly in RTL and mobile cards use full available width.
- Centered product and category page headings/search area to better match the product browsing surface.
- Reduced product search debounce from 300ms to 180ms for a quicker feel without filtering on every keystroke.
- Fixed a regression caught in visual review: the shared icon-action class had overridden `lg:hidden`, making the mobile menu icon visible on desktop. The class no longer sets `display`, so responsive Tailwind utilities work again.
- Changed Playwright config to `reuseExistingServer: false`, so `npm run test:e2e` always starts its own `npm run build && npm run start` server and cannot accidentally test a stale dev server.

Verification commands and results:

- `npm run format:check`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass. Final build generated 49 static pages and detected Proxy.
- `npm run test:e2e`: pass. 6 Playwright Chromium tests passed from a clean port with the production-backed server.
- Targeted Playwright DOM check on `/he/products/cameras`: pass. Products nav has `aria-current="location"` and active class; Cameras subnav has `aria-current="page"` and active class.
- Targeted desktop/mobile layout check on `/he/products/cameras`: pass. No horizontal overflow; desktop hamburger hidden; mobile hamburger visible; 6 cards render; final row centered on desktop; cards full-width on mobile.
- Extra axe WCAG A/AA check on `/he/products/cameras` and `/en/products/cameras`: pass, no violations.
- Visual screenshots inspected at `/tmp/miro-products-desktop-final2.png` and `/tmp/miro-products-mobile-final2.png` during the session. Temporary screenshot artifacts were not committed.

Important notes for future agents:

- Product navigation intentionally has two active levels: parent Products as section (`aria-current="location"`) and category subnav as page (`aria-current="page"`).
- Header/subnav active states should remain pill/button states only; do not reintroduce underline bars or inset underline shadows unless explicitly requested.
- Keep `npm run test:e2e` production-backed and non-reusing. Stop any local server on port 3000 before running it.
- Legal/privacy launch blockers remain owner/legal review of draft pages and business claims. This design pass introduced no real data collection.
- Accessibility launch blocker remains manual keyboard, zoom and screen-reader review before launch, even though automated axe smoke checks passed.

## Run / Deployment Stabilization And AI Handoff Update

User requested fixing project run, deployment problems and running time, then asked that all future work be recorded for other AI chats.

Changes made:

- Installed dependencies with `npm install` and verified clean CI-style install with `npm ci`.
- Read local Next.js 16.3.5 docs from `node_modules/next/dist/docs/` before touching framework-sensitive code.
- Verified `src/proxy.ts` is correct for Next.js 16 Proxy convention.
- Ran Prettier across the repo so `npm run format:check` passes. Many existing docs and TSX files changed only by formatting.
- Simplified `next.config.ts` from an empty placeholder object with a comment to `const nextConfig: NextConfig = {};`.
- Set `localeDetection: false` in `src/i18n/routing.ts` so `/` deterministically redirects to the Hebrew-first default `/he`, independent of browser language.
- Added `playwright.config.ts` with production-backed `webServer` behavior: `npm run build && npm run start`.
- Added `tests/smoke.spec.ts` covering Hebrew/English route rendering, localized `lang`/`dir`, root redirect to `/he`, and automated axe WCAG A/AA smoke checks on home pages.
- Added `/playwright-report` and `/test-results` to `.gitignore`.
- Installed Playwright Chromium locally with `npx playwright install chromium` so `npm run test:e2e` can run on this machine.
- Cleared generated Playwright artifacts after the run.
- Confirmed no local server process remained on port 3000 after verification.
- Updated `AGENTS.md` to require future agents to record meaningful project changes in this file for cross-chat handoff.

Verification commands and results:

- `npm ci`: pass. npm reported 0 vulnerabilities.
- `npm run format:check`: pass after formatting.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass. Final production build generated 49 static pages and detected Proxy.
- `npm run test:e2e`: pass. 6 Playwright Chromium tests passed.
- `npm run start`: pass. Production server was ready in about 55ms during final manual check.
- `curl -I -L http://localhost:3000/`: pass. `/` returns 307 then `/he` returns 200.
- `curl -I http://localhost:3000/he`: pass, 200.
- `curl -I http://localhost:3000/en/contact`: pass, 200.
- `npm run dev`: pass. Dev server was ready in about 203ms during final manual check.

Important notes for future agents:

- `npm run test:e2e` now starts a production build/server through Playwright config. It is a real deployment smoke check, not just a placeholder command.
- The app is Hebrew-first by design. Do not re-enable Accept-Language root routing unless the owner explicitly requests language auto-detection.
- Playwright browser binaries are machine-local cache, not committed project files. On a fresh machine or CI worker, run `npx playwright install chromium` if the browser binary is missing.
- npm currently reports install scripts awaiting review for `@parcel/watcher`, `@swc/core` and `unrs-resolver`. Builds and tests pass without approving them, but a project/security owner should decide whether to approve or deny those scripts before CI hardening.
- Legal/privacy launch blockers remain: owner/legal review of privacy, terms, accessibility statement, business identity, contact facts and service claims.
- Accessibility launch blocker remains: automated axe smoke checks pass, but manual keyboard, zoom and screen-reader review is still required before launch.

## Proportions And Performance Follow-up

User feedback: text, components and positioning needed a more coherent relative scale.

- Added shared rem-based section-spacing and heading tokens. Bounded content width is now 76rem, with consistent responsive gutters. Typography changes at explicit breakpoints, never continuously with viewport width.
- Homepage hero now uses content-driven mobile height and an aspect-ratio media region instead of absolute image offsets and 650px reserved height. Mobile copy/actions are centered; desktop remains direction-aware with bounded text measure.
- Section headings use 22/24/28px equivalents; card titles 18px and icons 36px. Buttons use 14px labels and keep at least 44px touch height. Narrow layouts stack hero actions when their labels need space.
- Service cards share a layout on home and services pages: four/two columns on larger containers, compact icon/text rows on phones. Container queries adjust card padding.
- Business/contact bands now align copy and actions as a unit; mobile uses centered stacking. Process/FAQ columns and footer have consistent gutters and smaller, proportionate type.
- Removed unnecessary viewport-height main padding, allowing short pages to use the body's flex layout to place the footer.
- Removed the unused NextIntlClientProvider wrapper and full-dictionary serialization. Client components already receive translated props and do not use next-intl hooks. Deleted the unused providers.tsx. Server translations and locale routing remain intact.
- Independent homepage translation reads run together. Responsive hero sizes now reflect its bounded media region. No new dependencies, polling, or animation runtime.

Measured on local production `/en`, Chromium, 390x844, fresh browser, same font/image readiness:

| Measurement                             |  Before |   After |
| --------------------------------------- | ------: | ------: |
| Rendered document outerHTML UTF-8 bytes |  57,548 |  47,497 |
| Script resource encodedBodySize total   | 155,143 | 144,878 |
| Optimized mobile hero bytes             |   7,684 |   7,684 |

These are local payload measurements, not Lighthouse scores or a claim of equivalent percentage loading-speed improvements. Real-device/network Core Web Vitals remain unmeasured.

Verification: final `npm run typecheck`, `npm run lint`, `npm run build` and `node scripts/verify-design.mjs` all exited 0 after the last code changes. The 12-combination design script found no console errors or axe A/AA violations. Additional production browser checks passed for home/services/contact/login/about in he/en at 320, 1024 and 1920px (30 cases): no horizontal overflow or clipped text. A 200% root-font-size reflow check at 768px had no horizontal overflow. Screenshots inspected for mobile English light and desktop Hebrew dark. The temporary production server on port 3100 was stopped intentionally; the existing dev server remains on localhost:3000.

Next owner review: approve proportions on real phone/desktop. Developer: retain these shared tokens for subsequent components and measure production field performance after deployment. Accessibility reviewer: manual screen-reader and zoom testing across the full site remains a launch task. Legal/business owner: existing copy, imagery and legal-page approvals remain open; this refinement adds no personal-data collection.

## Latest Design Refinement

User requested stronger premium styling, better fonts, high contrast colors, polished modes, motion and optimization.

- Replaced Arial on localized pages with Heebo variable font for Hebrew and English, self-hosted by next/font with swap loading.
- Replaced muted gold/beige tones with near-black, white, bright yellow and restrained teal. Light mode uses cool neutral surfaces; the photographic hero intentionally stays black in both modes.
- Added original generated, unbranded security-equipment artwork at `public/images/security-studio.png`. It is illustrative, not a claim about available stock. next/image supplies responsive optimized delivery and preload; reserved hero dimensions prevent image-driven layout shifts.
- Replaced placeholder hero icon boxes with full-width photography and localized brand-first text. Reworked service tiles, process rows and full-width business/contact bands; reduced card/button radii and removed heavy shadows and decorative background gradients.
- Added CSS entrance, hover, press, FAQ and menu motion. No animation dependency, scroll listener or continuous animation loop. Reduced-motion preference suppresses motion.
- Added aria-current to active navigation and protected theme switching against blocked localStorage.
- Updated localized homepage copy while retaining unavailable contact/auth behavior.
- Added reproducible `node scripts/verify-design.mjs` browser verification. Requires a running local server and installed Playwright Chromium. Optional DESIGN_BASE_URL overrides localhost:3000.

Verification for this refinement:

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; 47 static pages generated.
- Initial ad hoc axe test: exit 1 because AxeBuilder requires an explicit browser context. Corrected the test harness; no application change was needed for that error.
- `node scripts/verify-design.mjs`: exit 0. All 12 combinations of 360/768/1440 width, Hebrew/English and dark/light passed. Checks cover RTL/LTR, image loading, horizontal overflow, theme switch/reload persistence, keyboard reachability, menu/Escape, reduced motion, console/page errors and axe WCAG 2 A/AA rules. No axe violations detected. Screenshots saved in `/tmp/miro-design-review` (temporary artifacts).
- Inspected desktop light and mobile dark screenshots after correcting hero cropping. Initial screenshot pass exposed tight image framing; final imagery keeps the equipment visible.
- No Lighthouse score, production field performance measurement, full screen-reader test, or accessibility certification claimed. Optimization is architectural, not a measured speedup.

Handoff and next steps:

1. Owner: review the refreshed local site in both languages/modes; approve final business copy and illustrative visual or provide approved product photography.
2. Developer/accessibility reviewer: complete manual screen-reader and full route keyboard testing before launch. Automated homepage checks do not cover all accessibility requirements.
3. Owner/legal reviewer: existing legal drafts, contact facts and privacy launch blockers remain open; no new personal-data collection was introduced.
4. Stay in Phase 1 until explicitly authorized to begin the existing Phase 2 plan below. Real authentication, enquiries and catalog remain unavailable.
5. Future design changes should reuse `src/app/globals.css` tokens and run the verification script; avoid adding motion libraries for simple transitions.

## Current Phase

Phase 1 complete locally. Do not start Phase 2 until the owner asks for real authentication/database work.

## What Was Found Before This Update

- The repository already had a Next.js app, npm lockfile and many Phase 0 document stubs.
- `docs/PROJECT_STATUS.md` was stale and still said Phase 0 was in progress.
- `node_modules` was missing, so checks could not run until `npm install`.
- The app had broken or incomplete Phase 1 behavior:
  - Client hooks were used in server components.
  - Locale links did not consistently include `/he` or `/en`.
  - Hebrew messages contained corrupted text.
  - Tailwind tokens were not actually wired into the global CSS.
  - Metadata did not consistently provide canonical or alternate URLs.
  - Auth forms looked active but did not honestly report unavailable auth.
  - Private pages were previews instead of clearly closed routes.
  - Development preview routes were not production-blocked.
  - Static `public/robots.txt` pointed to `yourdomain.com` and wrong protected paths.

## Completed In This Pass

- Installed dependencies with npm from the existing `package-lock.json`.
- Completed Phase 1 visual/structural foundation without recreating the project.
- Added official `next-intl` routing setup for Next.js 16:
  - `src/i18n/routing.ts`
  - `src/i18n/request.ts`
  - `src/proxy.ts`
  - `next.config.ts` plugin wiring
- Implemented Hebrew `/he` and English `/en` routes with server-rendered `lang` and `dir`.
- Implemented root locale handling through `next-intl` proxy; `/` resolves to Hebrew.
- Rebuilt MIRO styling around semantic tokens in `src/app/globals.css`.
- Matched the supplied design direction: black/charcoal and gold dark theme, soft light theme, security/product visual language, responsive sections, strong CTA styling.
- Implemented working theme control:
  - Uses `miro-theme` in `localStorage`.
  - Applies before paint with a small script in the locale layout.
  - Persists after reload.
  - Does not reset language.
- Implemented working language control that switches to the equivalent localized path.
- Implemented responsive header, footer, mobile drawer, Escape-to-close, and keyboard-reachable controls.
- Implemented public pages with localized metadata:
  - `/he`, `/en`
  - `/services`
  - `/services/home`
  - `/services/business`
  - `/services/[slug]`
  - `/about`
  - `/contact`
  - `/privacy`
  - `/terms`
  - `/accessibility`
- Implemented auth pages as honest unavailable forms:
  - `/login`
  - `/signup`
  - `/forgot-password`
  - `/reset-password`
- Implemented private routes as closed/noindex pages:
  - `/account`
  - `/worker`
  - `/admin`
- Implemented development-only/noindex preview routes:
  - `/design-system`
  - `/catalog-preview`
  - Both call `notFound()` in production.
- Added `.env.example` with `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Added dynamic `robots.ts` and `sitemap.ts` using `NEXT_PUBLIC_SITE_URL` with localhost fallback.
- Removed stale `public/robots.txt`.
- Removed stale Tailwind v3 `postcss.config.js`; kept Tailwind v4-compatible `postcss.config.mjs`.
- Installed Playwright Chromium and performed browser verification.

## Completed, Incomplete, Unverified

### Completed

- Phase 0 repository assessment and status update.
- Phase 1 executable public foundation.
- Hebrew RTL and English LTR.
- Light/dark theme switching and reload persistence.
- Mobile/tablet/desktop responsive navigation.
- Localized page metadata, canonical URLs, alternate language URLs, sitemap and robots.
- Development previews noindex and production-blocked.
- Missing Supabase settings do not break public pages.
- Auth UI does not simulate success.
- Private routes fail closed with no protected data.

### Incomplete By Design

- Real Supabase authentication.
- Real roles, profiles, RLS policies and database migrations.
- Real enquiry submission.
- Real catalog/products/prices/checkout.
- Real business contact details, address, service area, legal copy, reviews, projects and brand partnerships.

### Still Unverified

- Full accessibility certification. Basic keyboard/browser checks passed, but manual screen-reader testing and axe coverage should be added.
- Current Israeli legal applicability. The checklist is engineering prep only, not legal approval.
- Real production domain behavior. `NEXT_PUBLIC_SITE_URL` must be set before deployment.
- Real Supabase credentials and callbacks. Phase 2 must implement and test them.

## Commands Actually Executed

- `npm install`
  - Exit code: 0
  - Result: Pass. Installed dependencies from npm lockfile. npm reported 0 vulnerabilities.
- `npm run typecheck`
  - First relevant failure: missing `.next/types` when run in parallel with build.
  - Final exit code: 0
  - Result: Pass.
- `npm run lint`
  - First failure: React lint errors for state updates inside effects in the header.
  - Final exit code: 0
  - Result: Pass.
- `npm run build`
  - First failure: stale Tailwind v3 `postcss.config.js`.
  - Second issue: missing official `next-intl` config.
  - Final exit code: 0
  - Result: Pass.
- `npx playwright install chromium`
  - Exit code: 0
  - Result: Pass.
- Browser verification script using Playwright Chromium
  - Initial failures: missing browser binary, ambiguous link locator, mobile header overflow, theme hydration errors.
  - Final exit code: 0
  - Result: Pass.
- `npm run dev`
  - Started successfully at `http://localhost:3000`.

## Browser Checks Actually Performed

Final Playwright check covered 360x780, 768x900 and 1440x1000:

- `/he` has `lang="he"` and `dir="rtl"`: passed.
- `/en` has `lang="en"` and `dir="ltr"`: passed.
- Theme toggle changes theme and persists after reload: passed.
- Mobile/tablet drawer opens, Escape closes it, and navigation link works: passed.
- Desktop navigation link works: passed.
- `/en/account` shows closed private route: passed.
- `/en/login` shows unavailable authentication behavior after submit: passed.
- Browser console errors: none in final run.
- Horizontal overflow: none in final run.

## Legal / Privacy / Accessibility Notes

- Owner action: confirm real MIRO business identity, contact details, service areas and any claims before launch.
- Owner/legal action: review privacy, terms and accessibility pages; current text is draft development copy.
- Developer action for Phase 2: avoid collecting real personal data until Supabase auth, RLS, retention and privacy notices are implemented.
- Accessibility action: add axe checks and manual keyboard/screen-reader pass before launch.

## Next Task

Phase 2 should implement real authentication and permissions:

1. Add Supabase migrations for `profiles`, `user_roles`, RLS policies and audit basics.
2. Add server/browser Supabase clients.
3. Implement signup, login, logout, confirmation, recovery and reset flows.
4. Enforce customer, worker and CEO route authorization on the server.
5. Test direct access as visitor, customer A, customer B, worker and CEO.
6. Keep public pages working when credentials are missing in development.
