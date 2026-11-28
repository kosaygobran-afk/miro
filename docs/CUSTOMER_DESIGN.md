# Customer storefront design — 2026-10-02

The storefront and management console share Light, Medium and Dark. Both appearance versions use the palette in `src/app/globals.css`. Version 2 adds its own component geometry and phone layouts. The current colors and their usage are in [Themes and glass](THEME_GLASS.md).

2026-10-20 owner direction: visitor/customer icon controls now share the management interface's bordered rounded-rectangle geometry, replacing the earlier circular controls. The public palette remains charcoal/gold across all three themes. The final `public-refinement.css` layer owns frame radii/borders, footer action gaps, customer-form label gaps and contact validation spacing; the payment module uses the same public theme tokens. Detailed scope and verification live in `docs/DESIGN_SYSTEM.md` and `docs/PROJECT_STATUS.md`.

2026-10-17 product presentation: Version 2 detail pages now balance equal-width/equal-height desktop image and information panels, with ordered price/availability, variant and purchase sections. Phones stack panels and contact alternatives at comfortable control sizes. Cards share clearer readable category/title/price hierarchy and aligned footer controls. `product-detail-refinement.css` owns detail-only refinements; `product-card-sections.css` retains the card anatomy/gesture contract. Version 1 layout remains restorable. Missing descriptions produce no empty full-description band, and unnamed variant colors fall back to the actual SKU. No catalog prices, availability or commerce settings are changed by this presentation work. Latest dimensions/verification are in `docs/DESIGN_SYSTEM.md` and `docs/PROJECT_STATUS.md`.

Popup sizing clarification: smaller unified dimensions apply only to product preview windows. Static card widths remain responsive as before. Version 2 previews are capped at 416×560px and adapt to available viewport/source-footer space; long content scrolls in their existing details region. As of 2026-11-06, Version 2 cards/rails show a copyable SKU in the right half of a joined band above price, with honest stock in the left half; barcode stays in previews/product details. The previous below-summary code section is removed to shorten cards. The same-day owner follow-up moves the compact price panel below product details, with amount left/context right, inline savings text and four joined icon action cells with gold hover/focus. Full identifiers remain bold, labeled fields in previews/product details, and Version 1 retains its existing layout. Internal reference codes are labeled as such, and missing barcode values are omitted. No barcode is fabricated or certified as a supplier GTIN.

## Preview checkout and wishlist

Guests can use the Cart and Wishlist without an account. Guest selections stay in
browser storage. After sign-in, the active account receives the wishlist union and
the cart merges by variant and optional-offer configuration. Duplicate cart
configurations keep the higher quantity. A failed transfer leaves guest selections
in place for retry. When the account read is unavailable, both lists stay usable
in browser storage. A successful retry imports those selections. The Cart and
Wishlist are available from storefront navigation,
with Wishlist also linked from the Cart and customer account.

Both guest and signed-in checkout collect name, email and phone. Delivery also
requires street and city, with optional postal code. Pickup asks MIRO to confirm
the pickup location and time. Signed-in checkout prefills account contact details
and stores the request under the customer’s history. The storefront revalidates
prices and availability, then a service-only database function records the
request and its audit entry together. An unchanged submission can be retried
from the same checkout form and returns its original reference. The cart clears
once a recorded reference comes back. Staff can review the method, address and
verified cart in the protected request drawer. Preview checkout sends a request
for MIRO to confirm before payment or stock reservation. Contact details stay
out of shopping browser storage.

Roll out checkout in two steps. Apply the additive writer migration
`20261122020000_checkout_request_customer.sql` before deployment. The published
storefront can continue using its original checkout writer during this step.
After the new deployment reaches the service-only writer, apply
`20261122030000_close_legacy_checkout_writes.sql`. The new deployment needs its
private Supabase server key. Leave historical account links as recorded unless
there is independent evidence of ownership.

## Animation controls and appearance restoration

Open `/he/admin/settings#settings-animation` or `/en/admin/settings#settings-animation`. An active CEO can save; Admin can read. The master switch, 13 effect switches and enhanced-appearance switch have bilingual notes. Timing inputs control presentation durations, and styles choose radial/fade theme changes, lift/fade page reveals and easing. Defaults are enabled; reduced-motion preferences take priority. Existing Store Design controls still set rail speeds, hover intent and background intervals, with the global switches deciding whether those decorative effects run.

Version 1 is a protected snapshot of the public theme tokens and motion configuration before the expanded design pass. Prepare the restore in a draft, review it, then Save. A restore does not overwrite visitor theme choice, products, inventory, uploaded design entries, enquiries or orders. Re-enabling enhanced appearance keeps the other motion selections. Version 2 styles remain scoped so future refinements preserve this backup path.

Implementation, timing bounds, security and final checks are in `docs/ANIMATION_SYSTEM.md`. A save updates this window and other same-origin tabs; other devices receive the saved configuration when reloaded. This adds no visitor tracking or outbound messages.

## Operating the design studio

Open **Settings → Website images** at `/he/admin/settings/website-images` or `/en/admin/settings/website-images`. An active CEO can edit and publish. An active admin can review the published Home and Services galleries and image placements, as well as Store design. Older Store design links open the Store design section of this page.

### Home and Services images

- **Home · MIRO on site** sits before the installation process. **Services · Security systems** follows the expertise list. **Services · Network installation** follows the process steps. Every gallery uses a 4:5 frame. The supplied photos start in Full image mode at 100% zoom so the frame preserves the whole prepared photo. Use Fill frame and the horizontal and vertical focal points when a crop works better. Fit, border width and corner radius are independent of the source file.
- Choose the placement, then add a still image by upload or HTTPS URL, enter its Hebrew and English alt text, and arrange the images. Select upward flip, right-to-left swipe, fade or instant with an optional color treatment. Test the current draft in Preview. Turn off automatic rotation for navigation by buttons and touch swipe only. The preview respects the device’s reduced-motion preference. Public automatic rotation and transitions also follow the global decorative motion setting.
- The individual image placements include the photo in the Home Security & communications section above the footer and images for published service detail pages. The service slot follows the service ID if its URL slug changes. Hide removes the image from the page. Restore default returns to the existing photo or service record. Keep service content and catalog imagery in their established editors.
- Publish saves a revision-checked draft and updates public reads. Leaving a gallery empty hides the gallery section. Removing an image removes its placement. Uploaded files get public URLs when prepared, so only upload media cleared for public use. Use owned uploads where possible. Third-party URL images make a browser request to their host.
- Apply `20261125010000_website_images.sql` before enabling writes in a new environment. The linked database received it on 2026-11-25. Gallery uploads accept still JPEG, PNG, WebP and AVIF up to 4 MiB and 16 megapixels. Files are re-encoded as WebP with orientation normalized and embedded metadata removed. The new design is independently revisioned and audited with `update_website_images`. The limited public projection reads only website-image data. Before the migration or first save, the bundled design provides the initial galleries. A failed published-settings read with no cached value suppresses the galleries.

### Store design

1. **Home collection backgrounds** controls the MIRO Group Collection hero beneath the Home navbar. Name, replace, upload, show, hide, add, remove or reorder its slides. At least one background must remain enabled. Default rotation is ten seconds. The allowed interval is 5–60 seconds, with fade, slide, zoom or instant transitions and durations of 150–1500 ms. Up to 20 backgrounds are supported.
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

Category pages support two levels: a collapsed main-category bar and highlighted subcategory links beside search. Main navigation remains main-category-only. Management supports optional child assignment and inline creation; a main category is mandatory for new products. Operating steps, URLs, database invariants and safe QA instructions are in `docs/CATALOG_CATEGORIES.md`.

The hamburger panel is a document-positioned glass portal, floating below the header above the store imagery. Its natural height uses the document scrollbar; it has no separate scrolling container and does not change the sticky header's height. Account popups use their own portal and stay within 16px viewport gutters. Glass backgrounds use a deep 96% theme surface with blur; menu text does not fade through the imagery while opening. Account arrows/Home/End navigate items; Escape restores focus and closes a nested account menu before the outer navigation.

Product preview content can scroll within its bounded 3D dialog when necessary. That is distinct from the navigation panel: all gallery controls and product details must remain accessible in a short viewport. Product rails pause while a preview is open and remain paused as the pointer enters the portal. Hero rotation and company rails have pause controls; reduced motion disables automatic movement. Long product titles move only when measured overflow exists, pause on hover/focus and wrap fully under reduced motion. Editable text remains static.

## Verification and remaining work

Automated checks include lint/typecheck/build, all local migration/access tests, cart/merchandising regression tests, overlay hit-testing in both locales and all themes at desktop/320/390px widths, and opt-in live CEO/admin/public design integration. Final command results and evidence are recorded in `docs/PROJECT_STATUS.md` and `docs/customer-design-evidence-2026-10-02/`.

| Item                                                       | Status / owner action                                                                                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CEO design publication, admin read-only, public projection | Verified: CEO publication/open-store refresh, admin denial and prompt stale-save 409; 19 live checks passed.                                                |
| Background/brand uploads and original catalog SVG hosting  | Implemented; owned public storage configured.                                                                                                               |
| Reference models, prices, stock, supplier barcodes, marks  | Business/inventory/legal owner approval required.                                                                                                           |
| Cart and checkout request                                  | Existing database-backed enquiry intake; no online payment or stock reservation.                                                                            |
| Outbound email/webhooks/notification delivery              | Integration owner must specify endpoint/provider/delivery contract and implement it; a toggle alone does not deliver messages.                              |
| Privacy and accessibility approval                         | Legal approves contact retention/claims; QA completes manual bilingual screen-reader, zoom and device review.                                               |
| Public VAT display                                         | Existing net labels use the effective CEO tax rate for the current date in Israel. Apply `20261125070000_public_storefront_vat_rate.sql` before deployment. |
| Public frontend release                                    | Source/build prepared locally; release through the established deployment workflow. Database migrations and catalog media are already live.                 |

No outbound messages were sent as part of this work. Test accounts, uploaded QA files and temporary public design edits are removed/restored by the live verification script.
