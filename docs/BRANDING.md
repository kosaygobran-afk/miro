# MIRO Group vector identity

Owner-approved direction, 2026-10-31; subtitle and navbar refinement completed
2026-11-01.

The visible wordmark is **מירו גרופ.** in both languages, with its **י** and final
**dot** in deep yellow `#e5b526`. Letter order is fixed in vector outlines;
never mirror it with RTL scenery or substitute a browser font. Main lettering
follows the supplied bold Hebrew reference. The subtitle reads
**מערכות מיגון ותקשורת** in naturally proportioned Noto Sans Hebrew Regular
outlines, with balanced tracking. Its existing SIL Open Font License is retained
at `assets/fonts/commerce/OFL.txt`. Brand/trademark approval remains the business
owner's launch responsibility.

## Source and exports

- `src/components/brand/artwork.json` is the canonical path geometry, color,
  wording and view boxes. The subtitle uses uniform 0.078 scale and 13-unit
  tracking. The full view box has equal ink margins above/below, allowing visual
  centering instead of centering an arbitrary text line box.
- `src/components/brand/brand-artwork.tsx` renders full and compact wordmarks and
  the matching mem/yod/dot app mark. Accessible labels identify the brand in the
  interface language; painted lettering stays Hebrew. All lettering is paths;
  there are no embedded raster images, SVG text, external fonts or foreignObject.
- `src/components/brand/brand.module.css` owns logo sizing, theme-aware ink,
  no-mirror behavior and navbar centering. The logo link is flex-centered without
  an inline baseline gap. At 320px the public navbar uses the matching compact
  mark so the menu and account/cart/language/theme controls remain reachable.
- `node scripts/generate-brand-assets.mjs` deterministically exports the same
  outlines as `public/images/brand/miro-group.svg` (light ink),
  `miro-group-dark-ink.svg`, and `miro-group-hero.svg`. It also regenerates the
  matching POS SVG/192px/512px icons, `src/app/icon.svg` and multiresolution favicon.
  PNG/ICO exports are app-icon fallbacks; the logos rendered in the UI remain SVG.

Consumers include public header/footer, customer account chrome, worker
navigation, management sidebar, reporting/service diagrams, POS, payment-page
branding, and storefront campaign/watermark surfaces. Site labels and metadata
use MIRO Group / מירו גרופ. This visual brand update does not modify issued
financial documents or the independently managed legal business identity.

## Owner-approved campaign replacement

The owner selected a clean SVG banner to replace both uploaded PNG logo
campaigns. `src/lib/brand-assets.ts` maps only those two exact legacy URLs to the
new banner. Public rendering and management preview share the resolver; unrelated
uploads and saved design revisions are untouched. Duplicate resolved brand
slides collapse into one visible banner. A future owner URL replacement takes
precedence because it no longer matches either legacy URL.

The live banner renders the canonical vector component directly. Its dedicated
layout separates copy and artwork on desktop and stacks them on smaller screens,
keeping complete lettering visible in both reading directions. Ordinary image
slides retain their existing layout and animation behavior. Branding is updated
in both appearance versions and all three themes, as requested; it is independent
of the optional Dark glass setting.

## Verification

`tests/brand-identity.spec.ts` checks both locales, 320/390/768/1440px, all themes,
the two deep-yellow accents, path-only exports, visible-ink vertical centering
within one pixel, menu visibility, no horizontal overflow and scoped axe scans.
Keep existing `tests/navigation-bar.spec.ts` containment checks and the POS
manifest/icon unit checks. Use disposable identities for protected UI QA; capture
only synthetic identity/chrome in committed evidence and never submit business
forms for visual verification.
