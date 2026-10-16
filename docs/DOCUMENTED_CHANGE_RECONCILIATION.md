# Documented change reconciliation — 2026-10-16

The owner reported missing work after synchronization. Auditing all fetched branches,
local worktrees and recoverable commits confirmed that the October 15–16 handoff
notes were committed without several corresponding source changes. Earlier claimed
Windows QA results are historical reports, not verification of this checkout.
This checklist tracks reconstruction and current evidence; no missing item is
considered delivered just because it appears in the old log.

| ID  | Documented behavior                                                          | Source audit                                                  | Current status                                                                                           |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| D01 | Preview arrows vertically centered, image/counter/controls in separate cells | Older bottom-positioned controls                              | Implemented; complete widget matrix passed in Chromium, desktop/iPhone WebKit                            |
| D02 | Thumbnail scrollbar clearance, RTL/client bounds and resize recovery         | No reserved picker gutter; outer bounds used                  | Implemented; same matrix includes open-preview resize and selected-thumbnail bounds                      |
| D03 | Preview Close row with hover/focus clearance, compact fallback retained      | Close overlaps gallery                                        | Implemented; actual Close clicks and compact source-footer checks passed                                 |
| D04 | Navigation progress aligned with actual header bottom and announcement       | Only header height used                                       | Implemented; 24 cases per engine passed with three themes, scroll, resize and announcement changes       |
| D05 | Equal public/management navbar heights and responsive Tools/display panel    | Old wrapping management toolbar                               | Implemented; 88 protected checks each in Chromium/WebKit, disposable actor cleanup                       |
| D06 | Public/account/staff current-area context and appropriate destination links  | Redundant storefront link, highlighted management destination | Implemented; role fixtures, overlay/focus checks and protected real-auth context passed                  |
| D07 | Consistent navbar icon/control spacing on narrow phones                      | Earlier control geometry                                      | Implemented; eight widths, both locales/three themes passed; 360px crowding corrected                    |
| D08 | Category icon/label/directional Enter arrow in reserved grid cells           | Earlier card arrow layout                                     | Implemented; containment, long labels, hover and Version 1 restoration passed                            |
| D09 | Missing navbar/progress/widget regression coverage                           | Documented files/expanded cases absent                        | Added suites and protected harness; current evidence below                                               |
| D10 | Native bridge bounded transient retries and Windows starter                  | Older non-retrying bridge, starter absent                     | Source implemented; 20/20 regressions; Windows install and Ultra live completion remain external actions |
| D11 | Handoff accuracy and preserved histories                                     | Merge markers and unsupported claims in status log            | Conflict markers removed; both dated records retained                                                    |
| D12 | Image processing runtime/contract and truthful saved outcomes                | Broken initial implementation                                 | Completed in `d74702f`; production worker remains a deployment action                                    |
| D13 | Project Supabase CLI 2.121.0 dependency/lockfile                             | Still 2.118.0 despite Windows handoff                         | Updated to documented 2.121.0; local executable verified; no linked migration or global CLI changes      |

Current verification (macOS, production build over temporary local HTTPS):

- `npm run lint`, `npm run typecheck`, `npm run build` (146 routes), scoped Prettier and `git diff --check` passed. `node --test tests/unit/*.test.mjs`: **244/244**. `npx supabase --version`: **2.121.0**, matching the [official release](https://github.com/supabase/cli/releases/tag/v2.121.0).
- The broad Chromium/desktop-WebKit/iPhone-WebKit run passed **390** cases with **50 intentional profile/pointer skips**, and one WebKit footer test reached the next iteration before the preceding streamed detail page mounted. Added actual detail/route-marker readiness after its URL assertion; that focused rerun passed. The full section suite then passed **26/26 applicable cases** with **25 intentional profile/pointer skips**, including the corrected footer case. Appearance switching passed **6/6** across those engines, preserving original Version 1 arrows and compact account chevron. No Firefox pass: its installed runtime fails before application startup with a profile-folder error.
- `scripts/verify-management-navbar.mjs`: **88 checks per engine** in Chromium and WebKit, including real disposable CEO/admin login, both locales, seven widths, themes, equal navbar heights, nested-overlay Escape/focus, resize continuity and axe. All actors removed. Synthetic catalog reads and blocked speculative prefetch isolate the UI; selected-page authorization stays real. Actual widget and phone-toolbar screenshots reviewed outside Git.
- The existing `localhost:3000` development server also passed the 390px English widget check through all themes; `/en` returned HTTP 200. It remains running. Review-only listeners/TLS files and credential-bearing candidate CLI configurations were cleaned up.
- Native bridge regressions cover capped identical-model retries, success/error/stream handling, client-owned budget, Retry-After and cancellation. Candidate configs lived in private temporary directories and did not replace global runtime/configuration. Kimi doctor passed; Kimi/GPT-OSS executed read tools and returned the exact random fixture. OpenCode/GPT-OSS read successfully but included extra final text, failing strict equality. Kimi/Ultra did not complete after more than seven minutes and was cancelled; OpenCode/Ultra hit the 180-second probe deadline. No model substitution or Ultra success is claimed. Windows PowerShell/Startup execution is unavailable here. Engineering owns these remaining native runtime/provider checks.
- The dependency install exposed five existing high-severity development-tool audit entries from the ESLint/fast-glob/micromatch/braces chain. Production-only audit reports **zero**. npm's proposed fix downgrades Next ESLint to 14.2.35; it was not applied to this Next 16 project. Engineering owns a compatible upstream tooling update; the Supabase-only lockfile diff introduces no unrelated dependency upgrade.

Scope excludes reinstating stale POS work over the verified newer implementation,
merging old optional telemetry branches, activating payments/fiscal issuance, or
claiming installation on the unavailable Windows machine. Native model identity,
private credentials and existing provider choices must be preserved. Existing
business/legal media/identity, privacy hosting/retention, manual accessibility and
provider/accountant launch owners remain responsible for their recorded approvals.
