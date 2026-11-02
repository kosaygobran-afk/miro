# Document previews and printable templates

Updated 2026-11-02 after the owner’s premium-layout follow-up. These are draft
templates, not approval for official issuance.

## Try a document

Open `/he/admin/documents` or `/en/admin/documents` as an active CEO/admin.
The **Test document templates** card works independently of orders, saved
business identity and document-list loading. Choose a document type, Hebrew or
English, A4 or 80 mm paper, and **Current business details** or **Fictional
business**, then select **Test draft preview (new tab)** or **Download sample
PDF**. The responsive four-selector grid uses the existing management controls.
The default UI source is current business; the API retains fictional source as
its default for older preview links. All eight renderer types are available: quote, proforma,
transaction invoice, tax invoice, receipt, invoice receipt, credit note and
correction. This broader rendering list does not grant permission to create or
issue those types.

Both modes use the same premium template. Fictional mode uses conspicuously
fictional businesses/customers and example identifiers. Current-business mode
reads the latest authorized saved identity on every opening; its customer,
items, payments and amounts remain fictional and its note identifies them as
such. Neither mode has an official number, signature or allocation number. Viewing them does not create records, reserve numbers, collect payment,
upload artifacts, or enqueue issuance. The GET endpoint uses the existing
`viewCommerce` authorization/rate-limit contract, strict closed query validation
and private/no-store responses. Unsupported business/numbering query fields are
rejected. Current-business mode uses only whitelisted printable fields from the
authorized `commerce_read(settings)` projection, with no settings cache or
writes. Missing/invalid identity returns a localized private 409 review page;
it never silently substitutes invented business facts. Exempt/unknown entities
cannot preview a tax invoice using that real identity. Exempt demo amounts have
zero synthetic VAT. Fictional mode remains available for all eight templates.
Valid saved 300-character streets print completely; 301-character inputs remain
invalid. No text is truncated to make the layout fit.

For an existing saved draft, select its row under **Returned documents**. Its
snapshot details now show localized fields and Israel-local date/time. A4 and
80 mm preview/download links appear in that draft's details. The old links were
accidentally nested in the reports-only branch, so documents could not display
them. Saved previews read the saved snapshot, not current settings or catalog.
Issued/non-draft documents cannot be regenerated through these routes.

The HTML tab supports the browser's Print command. For predictable physical
output use the generated PDF at 100% scale, the matching paper size, and no
browser headers/footers. Native HTML print pagination and margins can differ
from the canonical PDF because browsers and printer drivers control printing.

## Template and direction contract

- `src/lib/commerce/documents/paper-artwork.ts` owns the fixed SVG logo, icon and
  paper-rule geometry. HTML renders SVG paths; PDFKit paints the canonical brand
  and icon paths directly as vectors. No screenshot, remote logo, text-shaped
  logo, rasterized page, or new image-processing dependency is used. The full
  canonical MIRO mark/subtitle never mirrors with page direction. Legal business
  identity remains independently managed.
- The masthead places a prominent business name/profile at the reading edge
  (English left / Hebrew right), with the full logo opposite. On 80 mm the logo
  centers above the profile. Every value sits under its label on the same
  reading-edge anchor, including prices. Text direction is separate from
  alignment: LTR phones/emails/IDs are not forced to the right on English paper.
  Fixed fractional HTML columns account for their gaps; PDF and HTML share
  measured row bands so long names grow vertically and neighboring fields
  receive matching space. Numeric table headings/amounts use the same right
  anchor. Repeated business contacts occupy a measured footer reserve; the
  template version is now `miro-draft-3`.
- `paper-styles.ts` owns paper typography/spacing separately from application
  themes. Variable names, addresses, references, dates, units, discounts, amounts
  and notes remain escaped HTML text or embedded-font PDF text. Hebrew and English
  share a template with mirrored reading columns. HTML isolates machine values
  with `bdi dir="ltr"` and natural text with `dir="auto"`. PDF uses the installed
  bidi-js embedding levels, same-level shaping runs and mirrored punctuation;
  fontkit shapes Hebrew exactly once. Long-word wrapping preserves grapheme
  clusters. ActualText spans retain logical Hebrew text for selection/extraction;
  this does not claim PDF/UA conformance. The semantic HTML companion remains
  available for accessible reading.
- Dates/clocks use `Asia/Jerusalem`, including DST, seconds and the applicable
  UTC offset. PostgREST's microsecond timestamps normalize to canonical ISO
  milliseconds during draft translation, avoiding rejection by the snapshot
  validator. Collection time uses the saved `paid_at`/`collected_at` value.
- PDF panels/rows/totals use measured wrapped heights. Long descriptions/notes
  continue across pages without dropping text, crossing the footer reserve or
  duplicating row amounts. Each PDF page has a draft warning, full logo, draft
  ID and local date/time; continuation pages also identify themselves. Footers
  isolate page numbers. 80 mm items use stacked labeled values for readable
  units, discounts, net, VAT and gross.
- Financial values remain the immutable input amounts; rendering does not
  recompute tax, discounts or commerce prices. Zero discounts stay explicit.
  Number-series permissions, readiness checks and immutable issued artifacts
  remain unchanged. Preview artifact keys include `PAPER_TEMPLATE_VERSION`, so
  a prior draft rendering cannot silently substitute for this template revision.

## Free tools and operating costs

Retain the existing [PDFKit (MIT)](https://github.com/foliojs/pdfkit/blob/master/LICENSE),
[SVG path API](https://pdfkit.org/docs/vector.html), bidi-js (MIT) and bundled
Noto Sans Hebrew (SIL OFL) stack. These tools have no per-document software or
subscription fee; this feature adds no package, hosted rendering API, webhook,
account or paid service. Existing application hosting/compute still applies.
Unicode isolation follows the [W3C bidi guidance](https://www.w3.org/International/questions/qa-bidi-unicode-controls).
Keep the installed license files. A paid invoice SaaS is not needed for preview
layout; fiscal signing/allocation/provider readiness remains its separate gate.

## Regressions

```sh
node --test tests/unit/*.test.mjs
COMMERCE_PDF_OUTPUT_DIR=/tmp/miro-document-layout-qa node --test tests/unit/commerce-documents.test.mjs tests/unit/document-preview-api.test.mjs
python3 scripts/verify-document-pdf-layout.py /tmp/miro-document-layout-qa
DOCUMENT_PREVIEW_REVIEW=1 COMMERCE_PRODUCTION=1 COMMERCE_RENDERER_FIXTURE_DIR=/tmp/miro-document-layout-qa COMMERCE_OUTPUT_DIR=/tmp/miro-document-production-qa python3 scripts/verify-commerce-integration.py
python3 scripts/verify-document-pdf-layout.py /tmp/miro-document-production-qa
npm run lint
npm run typecheck
npm run build
```

The production harness migrates a disposable PostgreSQL instance, uses synthetic
actors/a saved draft and a local Supabase HTTP fixture, then tests the actual
optimized Next routes and real workspace. It never loads repository env files
or contacts linked Supabase. It checks all 32 type/language/paper combinations
as HTML, generated PDF and native browser print, plus authorization, new-tab
interaction, saved-draft links, no record/number mutations, both management
locales, phone/desktop containment, all themes and scoped preview axe scans.
The PDF geometry checker uses free Poppler and checks the actual configured
point/mm margins, real printed contact/numeric anchors, text collisions, dynamic
footer clearance and complete long-name/contact/financial end markers. The
maximum fixtures include 300-character addresses, 254-character unbroken emails,
200-character names and large immutable amounts. Browser geometry checks actual
painted non-whitespace runs, containment and shared neighboring row heights.
The production test saves two disposable business-profile revisions, verifies
the next business preview uses the update, and proves a previously saved draft
is byte-for-byte unchanged. No owner profile is changed.
Review final PNGs as well; geometry checks cannot judge glyph readability.

The integration runner now uses the default Turbopack and a relative `.next-ci`
directory to follow installed Next.js 16.4 conventions. Temporary apps live under
ignored `test-results`, with no env files, and are removed in `finally`. Generated
QA apps/reports are excluded from ESLint/TypeScript; real test sources are not.
Do not switch the harness back to absolute macOS `/var` build paths or force the
legacy Webpack CSS-module parser. Owner development servers are preserved.

Business/accountant must approve legal identity, document wording, fiscal
requirements and official print examples before live issuance. QA/owner retains
manual Hebrew/English screen-reader, physical-printer/device and PDF acceptance.
No customer-data export or new external processor is introduced by previews.
