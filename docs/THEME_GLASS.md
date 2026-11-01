# Dark-mode refinement and shared glass setting — 2026-10-29

MIRO Dark keeps its black/yellow identity with a balanced range of near-black surfaces,
warm gold highlights and a lighter glass treatment. The enhancement defaults **on**
and applies **only to Dark mode**. Medium and Light retain their exact previous
appearance. Only an active CEO or admin can change the single shared switch at `/en/admin/settings#settings-glass`
or `/he/admin/settings#settings-glass`. Choose **Enhanced glass**, then **Save and
apply for everyone**. Off restores the theme colors and surface paints from the
local checkpoint before this enhancement; the management setting stays available.

The shared switch controls the Dark-mode enhancement for everyone. There is no
visitor switch or browser-local glass preference. Older `miro-glass`
localStorage values have no effect. The selected dark/medium/light theme remains a
personal choice. A shared-setting save takes effect in the saving window after
server confirmation; other visitors receive it after refreshing or on their next
visit. Pages already open elsewhere are not pushed or polled.

## Design contract

- Every enhancement requires `data-appearance-version="2"`, `data-glass="on"` and `data-theme="dark"`.
  Version 1 retains its existing appearance. No enhancement changes header sizes,
  card widths, control radii, product fitting, text layout or motion settings.
- Public, customer and worker Dark use true neutral black/gray surfaces, warm gold, restrained sage-mint and bright supporting text. Medium and Light have no enhancement palette, glass, nested-sheen or hover overrides. Public palette rules exclude CEO/admin shells and management surfaces except the explicitly marked worker page; the console's existing Dark and semantic status colors remain authoritative.
- Selected public headers, category/account/mobile menus, non-compact service
  cards, consultation/bundle panels and department/brand bands receive glass.
  Chrome uses a 94% surface fill, menus a quieter 98% fill, 12px blur, 112%
  saturation, restrained sheen and short soft shadows. This supersedes the first
  draft's 22px blur and deeper shadows following owner visual feedback.
- Nested icon tiles, tag plates, menu numbers, theme frames and catalog action
  bands get a subtle reflection over their existing fill. Management cards,
  section headers, toolbars and nested icon tiles receive the same lighter
  reflection. Do not add a new backdrop-filter to each nested tile or filter text.
- Public product, rail, service and department cards highlight all four borders
  on hover or keyboard focus, with an inset gold ring that stays inside native
  scrolling rails. Preserve fixed footer actions, image clipping, selected-state
  colors and preview gesture behavior. Verify footer hover against the highly
  specific baseline card selectors; source order alone is insufficient.
- Product media, prices, inputs, primary actions, status badges and financial data
  retain solid backgrounds. Semantic tones must not be replaced by a glass fill.
- Unsupported backdrop filters use opaque fills. OS reduced transparency and
  forced colors remove enhanced transparency/blur; forced colors uses system
  canvas colors. Existing reduced-motion behavior remains authoritative.
- `public-refinement.css` stays the last locale-layout CSS import.
  `deep-glass.css` is immediately before it. Baseline theme files remain intact so
  off is executable restoration rather than an approximate alternate palette.

The owner’s subsequent color-harmony refinement on 2026-10-29 supersedes the
initial neon-yellow palette. The 2026-10-31 follow-up removes the residual blue
channel bias from structural surfaces. Public/customer/worker Dark uses page `#050505`, panel `#0c0c0c`,
inset `#171717` and hover `#242424`, with off-white `#f5f5f2` main text and
`#c4c4c4` supporting text. Warm gold `#e8c55b` fills primary actions, `#f2d67e`
is their hover color, and dark ink `#17140b` labels both. Pale gold `#f3d989`
is the reading/focus accent; sage-mint `#9bcdbd` remains secondary. Structural
borders use `#444444`; interactive outlines use the stronger `#858585`.

Public shadow tokens now use short neutral downward shadows (4px/14px at rest,
8px/24px elevated), with a restrained top highlight. Primary controls no longer
inherit the older saturated yellow glow. Gold hover/focus rings still highlight
all four card edges. Public glass edge tint and nested sheen are quieter; the
12px blur and management paints are unchanged. These are paint-only overrides
inside the existing three-way gate; off, Version 1 and Medium/Light remain exact.

## Worker and storefront surface completion — 2026-10-31

The worker section keeps `data-management-surface="true"` for its existing
geometry and adds `data-worker-surface="true"` solely to opt into the enhanced
black palette. The exception is limited to `deep-glass.css`; authorization and
other public/management guards do not change. A real `.mgmt-shell-root` still
excludes the enhancement, even when a worker marker is also present.

Product-card, moving-rail, preview and detail media backplates use neutral-token
radial gradients instead of hard-coded blue-gray studio highlights. Product
images, their fitting/clipping and semantic badges remain intact. The public
account dashboard, its forms, login/cart surfaces and worker navigation inherit
the same neutral tokens. Verify protected pages with
`node scripts/verify-dark-surfaces.mjs` (optional `BASE_URL`, `DARK_OUTPUT_DIR`):
disposable customer/worker identities, both locales, 320/1440px, all themes,
neutral Dark tokens, exact bright-theme paints and scoped identity cleanup.
The harness never submits account, request or settings forms.

## Global setting and authorization

`business_settings.glass_settings` contains only `{ "enabled": boolean }` and is
private. Anonymous server reads call `get_public_glass_settings`, which projects
only the enabled flag and revision. They use the cookie-free public Supabase client
with the established six-second transport and the public presentation cache.
Confirmed saves invalidate the glass cache tag and both locale layouts. A
last-known-good process fallback preserves a successfully read/saved choice on
upstream failure; a cold process without one uses the requested default on.

`GET/PUT /api/management/settings/glass` require an active CEO or admin. PUT also
requires same-origin access, a strict complete payload and the current revision.
`update_glass_settings` repeats active-role checks in SQL, locks the setting,
returns `PT409` for stale revisions and audits changes atomically. The generic
settings setter cannot change this key. Existing CEO-only animation and other
settings permissions are unchanged.

The UI edits a draft and applies it only after a confirmed save. Conflicts and
unknown write outcomes lock further changes until **Refresh saved value** obtains
the authoritative state. It never automatically retries uncertain saves. There is
one settings switch and no public/account-local override.

## File map

| File                                                           | Responsibility                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/styles/deep-glass.css`                                    | Gated palettes, soft glass, nested reflections, all-side hover/focus and OS fallbacks |
| `src/lib/glass-settings.ts`                                    | Strict public/protected contracts, defaults and cache tag                             |
| `src/lib/glass-settings-server.ts`                             | Limited public RPC read, bounded cache and last-known-good fallback                   |
| `src/app/[locale]/layout.tsx`                                  | Shared server-rendered root value and CSS import order                                |
| `src/app/api/management/settings/glass/route.ts`               | Authorized global GET/PUT, revision conflicts and cache invalidation                  |
| `src/components/glass-preference.tsx` and `.module.css`        | Bilingual global settings draft/save/error UI                                         |
| `src/components/management/settings-panel.tsx`                 | Settings section and index link                                                       |
| `supabase/migrations/20261029010000_global_glass_settings.sql` | Initial enabled row, public projection, protected save and generic-setter guard       |
| `tests/glass-appearance.spec.ts`                               | Public server state, contrast, hover/nesting and exact restoration                    |
| `tests/unit/glass-settings.test.mjs`                           | Executed API/contract and public-loader fallback regressions                          |
| `supabase/tests/glass_settings.sql`                            | Transactional role, privacy, revision, validation, audit and bypass checks            |
| `scripts/verify-glass-management.mjs`                          | Disposable protected-role and settings UI verification                                |

The superseded local helper was removed; footer and Workspace display drawer have
no local glass switch. Theme bootstrap restores only the personal theme and never
overrides the shared server glass value.

## Evidence and remaining owners

The starting website work was saved locally in commit `77a5746`. Actual pre-change
services captures compared with glass off produced **zero changed pixels across
12 views**: both locales, all themes and 320/1440px. Dedicated regressions compare
all rendered element styles and menu pixels with the enhancement CSS disabled.
The first local-choice draft passed 84 public tests and 24 protected combinations;
that UI was superseded by the owner's shared-setting request. The final global switch was exercised with actual admin/CEO saves and fresh
anonymous visits, restoring ON after the check. Final global-setting
commands, security checks and evidence are recorded in the latest
`docs/PROJECT_STATUS.md` entry; earlier private evidence remains historical.

Final Dark-only evidence includes **8/8 zero-pixel pre-change comparisons** for
Medium/Light, **17 glass-specific public cases plus 68 navigation/overlay/media
cases**, **36 protected checks**, **96 scoped accessibility scans** and **40 exact
protected raster comparisons**. All fixtures were removed; the shared setting is
confirmed ON. The full public run's two timing-sensitive navbar cases passed on
isolated confirmation. See the status log for the transient Supabase interruption
and the exact commands; no authorization changes were made to address transport.

No new visitor collection, outbound messaging, commercial claim or financial
behavior is introduced. **QA/owner:** manual bilingual screen-reader, zoom,
physical-device and visual approval remains. **Business/legal/privacy/accountant/
provider/deployment owners:** standing content rights, privacy, merchant/fiscal,
hosted-worker and monitored commerce-scheduler launch gates remain.
