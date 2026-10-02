# Customer storefront design — 2026-10-02

The public storefront supports MIRO's dark/medium/light themes. Version 2 adds calmer charcoal/gold and warm bright palettes, framed icons, consistent component geometry and phone layouts. Version 1 restores the original presentation. The customer layers keep their own palette, separate from the management console.

## Animation controls and appearance restoration

Open `/he/admin/settings#settings-animation` or `/en/admin/settings#settings-animation`. An active CEO can save; Admin can read. The master switch, 13 effect switches and enhanced-appearance switch have bilingual notes. Timing inputs control presentation durations, and styles choose radial/fade theme changes, lift/fade page reveals and easing. Defaults are enabled; reduced-motion preferences take priority. Existing Store Design controls still set rail speeds, hover intent and background intervals, with the global switches deciding whether those decorative effects run.

Version 1 is a protected snapshot of the public theme tokens and motion configuration before the expanded design pass. Prepare the restore in a draft, review it, then Save. A restore does not overwrite visitor theme choice, products, inventory, uploaded design entries, enquiries or orders. Re-enabling enhanced appearance keeps the other motion selections. Version 2 styles remain scoped so future refinements preserve this backup path.

Implementation, timing bounds, security and final checks are in `docs/ANIMATION_SYSTEM.md`. A save updates this window and other same-origin tabs; other devices receive the saved configuration when reloaded. This adds no visitor tracking or outbound messages.

## Operating the design studio

Open `/he/admin/store-design` or `/en/admin/store-design` as an active CEO. Admin can view the same page, but cannot change or upload its design.

1. Backgrounds: name, replace/upload, show/hide, add, remove or reorder slides. At least one background must remain enabled. Default rotation is ten seconds; the allowed interval is 5–60 seconds, with fade/slide/zoom/none and a 150–1500 ms transition. Up to 20 backgrounds.
2. Brands: edit names, replace/upload marks, reorder, show/hide or remove entries. Up to 24 company slots; default loop duration is 38 seconds, adjustable to 15–120 seconds. All marks fit the same modest slot dimensions.
3. Products: adjust moving-rail speed (15–60 pixels/second) and 3D hover intent (120–600 ms, default 200 ms). Product selection, ordering, promotional badges and promotions remain in the existing Store Merchandising page linked from the studio.
4. Publish design: saves the complete validated draft with its current revision. Concurrent changes return 409: use Discard changes to clear the local draft, then Reload before saving again. An uploaded file is prepared before publication; uploading alone does not change the customer's design.

All writes require active CEO authorization, a same-origin request and the existing private server configuration. Settings publication is audited atomically inside `update_storefront_design`. Admin read access uses its protected API; anonymous reads use only `get_public_storefront_design`. There is no public access to private settings, costs or staff data. Existing catalog version signals drive Realtime refresh, with polling/focus fallback.

Uploads accept PNG/JPEG/WebP/AVIF/sanitized SVG up to 5 MB. Content signatures must agree with the extension. Unsafe SVG scripts, event handlers and external references are rejected. Failed audit persistence removes the new upload. Images are publicly served from the owned `product-media` bucket. Removing a design entry does not delete its storage object, because an image may be reused; operations can review unused assets separately. Prefer owned uploads to third-party image URLs, which can disclose a visitor's network request to that host.

## Catalog and asset provenance

- `data/reference-catalog.json`: 40 manufacturer-referenced models, five per category, with source URLs, bilingual descriptions, specifications and verification date. The eight active categories cover cameras, alarms, access/intercom, recorders, routers/Wi-Fi, switches, cables and installation accessories. Existing products were preserved; the live catalog has 45 active entries after this import.
- New models have unpublished prices, zero confirmed stock, a contact-based stock policy and internal non-GTIN `MIRO-REF-*` reference barcodes. They are browsable quote references, not a claim that MIRO stocks or is an authorized reseller of every model. Business/inventory owners must approve pricing, availability and actual supplier barcodes before receipts/sales.
- `public/images/catalog/`: 30 original category/device SVG illustrations, three views for each visual kind. The 120 new product-image rows use their durable public storage URLs. Illustrations are labeled in cards, previews and detail pages; they are not manufacturer photographs or exact model renders.
- `public/images/store-design/`: five original generated decorative studio backgrounds, optimized WebP. `generation-notes.json` records the builtin `image_gen` tool mode, exact prompts and original generated-image paths; the PNG originals were preserved outside the repository. No real manufacturer's product identity is claimed by these generic backgrounds.
- `public/images/brands/`: initial IBM, TP-Link, Ubiquiti, Hikvision, Ajax, Seagate, Western Digital and Dahua identifiers. IBM vector came from Simple Icons v9; TP-Link/Ubiquiti/Seagate/Western Digital from Simple Icons v13 via jsDelivr. Hikvision/Ajax/Dahua are local plain word identifiers, not a claim to reproduce an officially licensed logo. Simple Icons artwork is distributed under [CC0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md), but manufacturer marks still require business/legal review and must not imply partnerships.

The additive seed script previews unless `--apply` is supplied and preserves matching model/slug entries. It publishes original artwork before adding references. Asset publication changes only rows still pointing at matching original local paths; later owner uploads are retained. The missing hosted storage bucket was provisioned through Storage API with the image-only 5 MB settings already documented by the historical media migration.

## Navigation, motion and accessibility

The hamburger panel is a document-positioned glass portal, floating below the header above the store imagery. Its natural height uses the document scrollbar; it has no separate scrolling container and does not change the sticky header's height. Account popups use their own portal and stay within 16px viewport gutters. Glass backgrounds use a deep 96% theme surface with blur; menu text does not fade through the imagery while opening. Account arrows/Home/End navigate items; Escape restores focus and closes a nested account menu before the outer navigation.

Product preview content can scroll within its bounded 3D dialog when necessary. That is distinct from the navigation panel: all gallery controls and product details must remain accessible in a short viewport. Product rails pause while a preview is open and remain paused as the pointer enters the portal. Hero rotation and company rails have pause controls; reduced motion disables automatic movement. Long product titles move only when measured overflow exists, pause on hover/focus and wrap fully under reduced motion. Editable text remains static.

## Verification and remaining work

Automated checks include lint/typecheck/build, all local migration/access tests, cart/merchandising regression tests, overlay hit-testing in both locales and all themes at desktop/320/390px widths, and opt-in live CEO/admin/public design integration. Final command results and evidence are recorded in `docs/PROJECT_STATUS.md` and `docs/customer-design-evidence-2026-10-02/`.

| Item                                                       | Status / owner action                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| CEO design publication, admin read-only, public projection | Verified: CEO publication/open-store refresh, admin denial and prompt stale-save 409; 19 live checks passed.                                |
| Background/brand uploads and original catalog SVG hosting  | Implemented; owned public storage configured.                                                                                               |
| Reference models, prices, stock, supplier barcodes, marks  | Business/inventory/legal owner approval required.                                                                                           |
| Cart and checkout request                                  | Existing database-backed enquiry intake; no online payment or stock reservation.                                                            |
| Outbound email/webhooks/notification delivery              | Integration owner must specify endpoint/provider/delivery contract and implement it; a toggle alone does not deliver messages.              |
| Privacy and accessibility approval                         | Legal approves contact retention/claims; QA completes manual bilingual screen-reader, zoom and device review.                               |
| Public VAT display                                         | Existing frontend rate is fixed at 18%; engineering must connect future scheduled CEO tax changes before using a different rate.            |
| Public frontend release                                    | Source/build prepared locally; release through the established deployment workflow. Database migrations and catalog media are already live. |

No outbound messages were sent as part of this work. Test accounts, uploaded QA files and temporary public design edits are removed/restored by the live verification script.
