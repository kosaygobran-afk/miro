# Design System

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
- Cards: 6px corners, fine borders, alternating yellow/teal service accents. Buttons: 4px corners, minimum 44px height. Page sections stay unframed.
- Hero: black photographic band in both modes, responsive image positioning, no decorative frame. Generated equipment is illustrative and labeled accordingly.
- Motion: 180-220ms interaction transitions, 700ms one-time hero entrance. Only opacity/transform entrance animation; reduced motion overrides all animation and transitions.
- Performance: self-hosted variable font, responsive next/image delivery, preloaded hero, no new runtime dependency and no perpetual animation.
- Validation: `node scripts/verify-design.mjs` against a running server; 12 size/language/theme combinations plus axe, interaction and reduced-motion checks.

## Components
- Shared accessible primitives in src/components/ui/
- Layout components in src/components/layout/
- Feature-specific components in src/features/

## Reference Images
The user supplied two MIRO reference images on 2026-09-20: a dark black/charcoal/gold version and a softer light gray/white/gold version. Phase 1 now follows that visual DNA with semantic tokens, product-style cards, strong gold CTAs, responsive service tiles and a security-technology hero treatment. The images are references only, not copied production assets.

## Visual Rules
- Professional security technology aesthetic
- Confident typography, generous spacing
- Bright yellow actions and restrained teal secondary accents
- Clear service/product cards
- Practical conversion actions
