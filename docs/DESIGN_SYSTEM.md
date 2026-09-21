# Design System

## Premium storefront system — 2026-09-21

These rules supersede earlier sizing and placeholder notes below.

- Active shared styles load in order: `src/app/globals.css`, `src/styles/premium.css`, `src/styles/experience.css`, `src/styles/storefront.css`. The last three separate shared brand/navigation, public editorial pages and catalog-specific presentation. Unrelated canvas styles remain unchanged.
- Shared outer frame: 112rem maximum, 2rem desktop / 1rem phone gutters. Store and marketing pages use this full frame; reading panels stay around 58rem, and paragraph measures remain narrow inside wider sections.
- Preserve Hebrew RTL and English LTR. Prefer logical spacing/positioning, mirrored directional arrows and localized accessible control names. All content stays available at 320px and in short landscape viewports.
- Dark uses neutral charcoal (#090b0d background), light uses clean cool white (#f7f8fa), medium uses a distinct soft gray (#e4e7ea). Primary yellow is #ffca28 with dark text; gold text uses its own contrast-aware token.
- Shared header uses a geometric MIRO brand, five main destinations, a button-operated category disclosure and direct dark/medium/light controls. The mobile menu and category disclosure support Escape/focus return. Search submits to localized Store and preserves its query.
- Keep public content server-rendered; client islands are for navigation, theme, search/filter/sort and forms. Avoid extra runtime libraries, perpetual animation and hover-only features. Respect reduced-motion preference.
- Use the existing local security studio image for premium photographic heroes; original SVG hardware illustrations are category concepts, not exact manufacturer product photography. Keep illustration/sample content disclosed. Do not add fabricated reviews, partner endorsements, customer counts, guaranteed support hours or delivery times.
- Shared public sections live in `src/components/public/experience-sections.tsx`. Edit bilingual content at its source arrays; this structure is ready for later approved content integration, not an implemented CMS.
- Catalog actions are product inquiries, not a working checkout. Keep the contact preview honest about submission availability. Real commerce and lead delivery remain separate engineering work.
- Run production smoke tests and `DESIGN_BASE_URL=http://127.0.0.1:<port> node scripts/verify-design.mjs`. The browser script exercises both locales, all three themes, five viewport widths, keyboard/menu/theme behavior, reduced motion and representative axe checks.

## Tokens

Runtime source of truth: `src/app/globals.css`. Legacy files in `src/styles` are not the active palette.

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
