# Shared page data loading — 2026-10-29

The retained changes remove duplicate browser session work, overlap independent
header/catalog/management reads and reduce product-list data. Live stock, role
pricing, authorization and financial data remain request-scoped. Existing dirty
glass/theme work was preserved in both comparison builds.

## Measured results

| Check                                                                           |     Baseline |    Optimized |
| ------------------------------------------------------------------------------- | -----------: | -----------: |
| Delayed session GETs during mobile-menu mount and five overlapping focus events |           12 |            1 |
| Session GETs on a later focus after completion                                  |            2 |            1 |
| Product list response, 20 existing products                                     | 66,715 bytes | 39,970 bytes |
| POS catalog API median                                                          |       875 ms |       584 ms |
| Requests API median                                                             |       790 ms |       596 ms |
| Customers API median                                                            |       898 ms |       714 ms |
| Users API median                                                                |       818 ms |       734 ms |
| Audit API median                                                                |       732 ms |       597 ms |

Protected results use three alternating samples per local production server,
the same live Supabase and a disposable active CEO. All seven API comparisons
preserved their response data; summary comparisons check the preserved fields.
The full product response remains unchanged. The disposable actor was deleted.
Only counts, statuses, elapsed times and contract outcomes are retained here;
customer payloads, names, credentials and auth cookies were not saved.

Anonymous verification covered `/en`, `/he`, contact, services, login and a live
product detail: 36 baseline plus 36 optimized navigations all returned 200 with
content available and no console/runtime errors. Aggregate page timings were
mixed, including slower catalog samples; they do **not** prove a universal
page-latency improvement. See `comparison.json` for every route. Both builds were
warmed, unthrottled Chromium at 1440×1000 with reduced motion. Initial means a
fresh browser context; reload reuses that context. Safety routing disables the
browser HTTP cache. Remote images and network idle are not awaited. These are
neither server-cold-start measurements nor device/network guarantees. Protected
browser timings were single smoke checks with other e2e work running and must
not be used for speed claims.

The catalog pipeline also passed a controlled dependency benchmark: a 100 ms
saved-products read and a 120 ms role-price read took 222–224 ms before and
121–122 ms after, with one price request throughout. This verifies removal of
the serial dependency, not real-world page latency. A product/child embedding
experiment was rejected and reverted after live warm reads were slower despite
fewer requests.

## Verification

- `npm run lint`, `npm run typecheck`, isolated `npm run build`, scoped Prettier
  and `git diff --check`: passed.
- `node --test tests/unit/*.test.mjs`: 390/394 passed. All four failures are in
  the unchanged POS accounts dashboard harness, which lacks the existing pager
  import. The same failures reproduce with HEAD-only source and tests. Engineering
  owns that separate harness repair.
- Chromium motion, store loading and overlay regressions: 37/37 passed, one
  worker, English/Hebrew, all three themes and narrow mobile menus. The previously
  documented stalled-preview-image fallback case was excluded from this data
  loading pass.
- Protected API and browser smoke checks: 18/18 passed, including cleanup.
- `BASE_URL=http://127.0.0.1:3107 OUTPUT_DIR=/tmp/miro-speed-optimized SPEED_RUNS=3 node scripts/verify-page-data-speed.mjs`:
  passed. Baseline used port 3106 and `/tmp/miro-speed-baseline`.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3107 PLAYWRIGHT_REUSE=1 npx playwright test tests/store-loading.spec.ts tests/motion.spec.ts tests/store-overlays.spec.ts --workers=1 --grep-invert 'a stalled preview image' --output=/tmp/miro-data-speed-playwright`:
  passed.

`anonymous-before.json`, `anonymous-after.json`, `comparison.json`,
`protected-reads.json` and `verification.json` contain the sanitized evidence.
Browser request counts do not include server-to-database calls.

No new visitor collection, commercial claims or financial behavior was added.
Business/legal/privacy retain content, rights and privacy launch approval;
QA retains manual bilingual screen-reader and physical-device acceptance.
Accountant/provider readiness and the monitored commerce scheduler remain
independent launch gates with their existing owners.
