# Website themes and the shared glass setting

## Three personal color modes — 2026-11-28

The storefront, customer accounts, CEO/admin workspaces and their menus and dialogs use the same palette. The active `data-theme` on the document root selects the colors in `src/app/globals.css`. Components inherit the values in both appearance versions, including when they render through a portal. Medium and Light both use a light native color scheme for browser controls.

| Role | Light | Medium | Dark |
| --- | --- | --- | --- |
| Page | `#f8f7f3` | `#d4d3d0` | `#0b0b0b` |
| Panel | `#ffffff` | `#efeeeb` | `#171717` |
| Raised panel | `#ffffff` | `#fbfaf8` | `#252525` |
| Main text | `#262520` | `#242322` | `#f6f5ef` |
| Supporting text | `#504e47` | `#474641` | `#d0cec7` |
| Primary action | `#efbf37` | `#e8ba3d` | `#edc451` |
| Gold text | `#705109` | `#634906` | `#f1d37a` |

Use `--miro-on-gold` for text on gold controls, `--miro-accent` for gold text on structural surfaces, and `--miro-focus` for keyboard focus. Keep semantic fills and labels paired. Sales-channel badges and charts retain distinguishable series. Cards use a small downward shadow. Floating windows and menus use a deeper shadow with a visible edge. The Version 1 backup retains its historical colors as a record. Restoring that version selects its layout and animation settings within the current palette.

An active CEO or admin can set the optional Version 2 Dark finish at `/en/admin/settings#settings-glass` or `/he/admin/settings#settings-glass`. Choose **Enhanced glass**, then **Save and apply for everyone**. Turning it off reveals the solid Dark palette. After a confirmed save, the current window updates and other visitors receive the change on refresh or their next visit.

The browser stores the theme choice in `miro-theme` as soon as the user
selects it. The nonce-bearing bootstrap applies the preference on document
loads. A layout effect restores it before paint when English and Hebrew
layouts switch in the same document.

## Design contract

The 2026-11-19 owner follow-up gives the CEO and admin topbar the management page’s opaque background in every theme. The management account popover still follows the optional glass setting.

- Every enhancement requires `data-appearance-version="2"`, `data-glass="on"` and `data-theme="dark"`.
  Version 1 uses the solid palette. Appearance versions retain their own geometry.
- The shared palette applies independently of the glass setting. Workers use the customer account UI. Role-specific selectors in `deep-glass.css` target the finish on particular surfaces.
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
  `deep-glass.css` is immediately before it and owns the optional finish.

For a local cross-role check, run `THEME_REVIEW=1 python3 scripts/verify-commerce-integration.py`. The fixture uses synthetic identities to exercise the public site, customer account, CEO shell and account menu. Set `COMMERCE_OUTPUT_DIR` to save screenshots. For a production build use `COMMERCE_PRODUCTION=1` as well. The Playwright theme and glass suites cover appearance versions, keyboard focus, layout and the reduced-transparency and forced-colors fallbacks.

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
| `src/styles/deep-glass.css`                                    | Gated glass finish, nested reflections, all-side hover/focus and OS fallbacks |
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
