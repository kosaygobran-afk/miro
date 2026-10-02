# Operations Plan

## Development

- Use Next.js dev server with `npm run dev`
- Environment variables stored in .env.local (not committed)
- Supabase local development via Supabase CLI (when needed)

## Verification

- Install dependencies with `npm ci` for CI-style reproducibility.
- Run `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run build` before handoff.
- Run `npm run test:e2e` for production-backed Playwright smoke coverage. By default it builds and starts its own server on port 3000 and requires that port to be free. Server reuse is opt-in: set `PLAYWRIGHT_REUSE=1` (`reuseExistingServer` in playwright.config.ts) to run against an already-running server instead. On a fresh machine, install the browser cache with `npx playwright install chromium` if Playwright reports a missing executable.
- Confirm no local process is left listening on port 3000 after manual `npm run dev` or `npm run start` checks.

## Deployment

- Build with `npm run build`
- Start with `npm run start`
- Deploy to Vercel or similar Node.js hosting platform
- Set environment variables in deployment platform
- Keep `/` redirecting to `/he` unless the owner explicitly changes the Hebrew-first routing decision.
- Keep legacy `/products` URLs redirected to `/store` so old links do not break after the Store rename.

## Database

- Use Supabase managed PostgreSQL
- Migrations stored in supabase/migrations/
- Run migrations with Supabase CLI: `supabase db push`

## Backup and Restore

- Supabase provides automated backups
- Point-in-time recovery available
- Manual backup via `pg_dump` if needed

## Logs and Monitoring

- Access logs via hosting platform (Vercel, etc.)
- Error logging to be implemented
- No third-party analytics in initial phase

## Recovery Requirements

- Documented runbook for database restore
- Procedure for revoking access and recovering CEO account
- Rollback plan for application releases

## Website release 0.0.2

- The website release was isolated from unfinished canvas/dashboard work already in the shared workspace. Do not include those uncommitted modules or their package changes in storefront commits without separately fixing and validating them.
- Run `DESIGN_BASE_URL=http://127.0.0.1:<port> node scripts/verify-design.mjs` against a production server for responsive/theme/catalog regression review. It writes local screenshots to `/tmp/miro-design-review` by default.
- If port 3000 is occupied, run smoke checks with both `PORT=<port>` and `PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port>`; the URL alone does not change the server port.
- A `next start` server can outlive its `npm` wrapper PID. Stop verification servers with `pkill -f 'next start'` (and confirm with `lsof -iTCP:<port>`) before starting a new one, or tests may silently hit a stale build.
- Sample catalog fallback works without Supabase credentials in development only. Since 2026-09-27 the fallback returns an empty catalog in production builds, so a live deployment without a healthy database shows the honest empty state instead of demo products. The live database read branch and existing authentication require a separately configured staging environment; never commit environment secrets.

## Console verification scripts

- `node scripts/verify-admin-console.mjs` runs a production-backed smoke test of the CEO/admin console. It creates a disposable confirmed admin account in the configured Supabase project via a private server key, signs in through the UI, visits every admin page in English plus the Hebrew admin shell, and asserts clean renders (no error patterns, no page/console errors, admin nav visible, RTL direction) and settings navigation. It deletes the disposable account in `finally`.
  - Requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and `SUPABASE_SECRET_KEY` in the environment or `.env.local`, Playwright's Chromium, and a running production server at `ADMIN_BASE_URL` (default `http://127.0.0.1:3105`; start it with `npm run build && npm run start -- --port 3105`).
  - Exits non-zero on any failure, including missing Supabase credentials — a silent pass is never acceptable. To skip intentionally (e.g. a machine without credentials), pass `--allow-skip`, which prints a skip notice and exits 0.
- `ROLE_BASE_URL=https://<deployment> node scripts/verify-role-workflows.mjs` creates disposable customer and worker accounts, checks their permitted pages and Admin/inventory API isolation, then deletes both accounts. It requires the same local `SUPABASE_SECRET_KEY`. Use an opt-in target because it temporarily writes to the connected Auth database.
- `python3 scripts/verify-bootstrap-ceo.py` is a read-only check of the bootstrap CEO state. It inspects `user_roles`/`profiles` for the `ceo` role, reports whether the bootstrap owner account holds the CEO role, and confirms the CEO SQL functions (`add_ceo`, `delete_own_ceo_account`, `manage_account`, `delete_user_account`, `require_recent_ceo_password`, `active_app_role`) exist. It requires `NEXT_PUBLIC_SUPABASE_URL` and the publishable (or anon) key plus the `supabase` Python package (`pip install supabase`); it uses only the anon key, so visibility into `auth.users` is limited and it never modifies the database. Missing credentials exit non-zero; the checks print a report of found/missing state with manual bootstrap steps when no CEO exists yet.

## Phase 2 account operations

- Password recovery regression check: `npx playwright test --config=playwright.recovery.config.ts` builds/runs port 3100 against an isolated Supabase protocol double on port 54331. It does not send email or modify real users. Run `npm run build` afterward to restore the production build using the actual local environment.
- Live recovery integration check: with `npm run dev` on port 3000 and the private service key in ignored local configuration, run `node scripts/verify-recovery.mjs`. This opt-in check creates one disposable confirmed account in the configured Supabase project, generates links without sending email, verifies both locales and both loopback hostnames including password changes/sign-in, and deletes the account in `finally`. It also checks development Strict Mode; preserve the shared initialization promise in the reset component. It does not prove inbox delivery or replace the owner's fresh-email PKCE check.
- Recovery requests (including resend) must include `/auth/callback?next=/<locale>/reset-password`. In Supabase Auth URL Configuration, allow this callback on every supported origin and retain a Site URL pointing to this app. Preserve the SDK-added `sb_flow_id` query parameter. Standard reset email templates should retain `{{ .ConfirmationURL }}`; a custom token-hash template may use `/auth/verify?token_hash={{ .TokenHash }}&type=recovery&locale=he` on the correct app origin. Avoid a bare Site URL link that discards all recovery credentials.
- PKCE email links need the browser cookies from the reset request. Missing/expired credentials now show a fresh-link action; do not bypass verification. The homepage fallback handles returned PKCE codes and legacy `#type=recovery` sessions. Verify actual inbox links with the owner after release; automated protocol tests do not validate hosted Supabase settings or SMTP delivery.
- Recovery redirects must preserve the browser's Host, and legacy implicit tokens must be imported explicitly because this SDK's browser client uses PKCE. Configuration references: [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) and [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

- Live Supabase Site URL (verified 2026-09-22): `https://miro-kosaygobran-afks-projects.vercel.app/`. `miro-one-omega.vercel.app` also has a legacy callback allowlist entry; it is not the current Site URL. Confirmation and recovery return through `/auth/callback` to a localized account/reset route.
- Local Auth redirects allow `http://localhost:3000/**` and `http://127.0.0.1:3000/**`. A bare `/auth/callback` entry does not cover the application's query-bearing recovery URL. Preserve these local entries and retest redirect acceptance if URL settings change. Old emailed links do not automatically pick up corrected redirect destinations; request fresh ones.
- Keep `127.0.0.1` in Next.js `allowedDevOrigins` alongside the automatically allowed localhost hostname; the installed Next.js version otherwise rejects that origin's development HMR connection and can leave the recovery page loading.
- Customers sign up through `/he/signup` or `/en/signup`; verify email before login. Staff use the same login. CEO/admin authorization is enforced on the server and in database functions.
- CEO security controls are in `/he/admin` and `/en/admin`. Change the temporary password after initial login. Email changes require confirmation; verify inbox delivery with the owner before launch. Add another CEO only after that person has an active, verified account. No CEO can demote/block another CEO; self-deletion requires another active CEO and recent password verification.
- No service-role key is required for the regular account, request, staff or CEO interfaces. Administrative bootstrap credentials belong only in trusted, ignored local/server configuration.
- Run `python3 scripts/verify-database.py` to create a disposable PostgreSQL instance, replay all migrations and test access rules. It needs PostgreSQL server binaries and never connects to the linked database.
- Run `npx supabase@latest db push --linked --dry-run` before a reviewed migration rollout. Validate migrations locally/staging before applying them. `npx supabase@latest db lint --linked --fail-on error` validates the linked public schema.
- `PORT=3102 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3102 npm run test:e2e` builds and tests the website with isolated preview ports. Actual inbox delivery is a separate owner check.
- Account deletion removes auth/profile and owned dependent records through foreign keys. Service/order/audit records may remain with the user link cleared; review contact fields, audit details and legally required retention before public launch. Existing Speed Insights from main remains enabled and should be covered by the privacy review.

## Enquiry endpoint (/api/enquiries)

- Public enquiry intake for the storefront contact form (`src/app/api/enquiries/route.ts`). Accepts localized POSTs with `name`, `email`, `phone`, `message`, optional `product`/`variant` context, plus a `company` honeypot field and a `startedAt` time trap.
- Responses use the `{ ok: boolean, code?, message? }` envelope: `invalid_input` (400, with field `issues`), `unavailable` (403 non-same-origin or 503 misconfiguration), `rate_limited` (429). Honeypot/time-trap bot submissions receive a fake `{ ok: true }` and write nothing.
- Rate limit: 5 POSTs per minute per client IP, enforced in memory per server instance. On multi-instance/serverless deployments this limiter is not global; add an edge-level limit (Vercel WAF / Supabase edge) if abuse appears.
- Inserts land in `service_requests` with `status='new'` (a fail-closed DB trigger re-forces that status); they surface in the admin Requests page. DB-side length caps mirror the zod limits.
- Manual verification: `curl -X POST http://127.0.0.1:3000/en/api/enquiries -H 'content-type: application/json' -H "origin: http://127.0.0.1:3000" -d '{"name":"Test","email":"t@example.com","phone":"+972500000000","message":"Hello there","startedAt":0}'` (expect `invalid_input` for the instant time trap; use a real form submission for a full happy path). Automated coverage: `npx playwright test tests/enquiry.spec.ts` (4 API-level tests run without browsers; the 2 browser tests need Playwright Chromium).
- Privacy: enquiries store personal contact details; include them and their retention in the privacy review before launch (see LEGAL_CHECKLIST_IL.md).

## Local verification without credentials

- `python3 scripts/verify-database.py` works on machines without system PostgreSQL if PATH contains user-space binaries: `npm i embedded-postgres` in a scratch dir provides `initdb/pg_ctl/postgres` under `node_modules/@embedded-postgres/<platform>/native/bin`, and `psql` can be added there by `apt-get download postgresql-client-<ver>` + `dpkg -x` (no root). Verified 2026-09-27: 20 migrations + 4 SQL test files pass on PostgreSQL 18.
- `scripts/verify-design.mjs` skips the store interaction step (with an explicit SKIP line) when the catalog is empty, which is the honest production behavior without a seeded database since the mock fallback is dev-only. For full store-interaction coverage, run it against staging/production data.

## Store design studio and reference catalog — 2026-10-02

See `docs/CUSTOMER_DESIGN.md` for controls, storage/asset provenance and outstanding owner actions.

- CEO/admin route: `/he/admin/store-design` or `/en/admin/store-design`. CEO edits/publishes; admin previews only. Existing product selection, promotions and badges stay in Store Merchandising.
- Applied migrations: `20261002010000_storefront_design.sql`, `20261002020000_public_inventory_defaults.sql` and `20261002030000_storefront_design_conflicts.sql`. Public design and inventory-default RPCs expose only their explicit public projection. Changes bump the existing catalog signal for Realtime/poll refresh.
- Use a valid official Supabase CLI binary and `db push --linked --dry-run` before live migration application. The preinstalled signed binary terminated with code 137 on this workstation; the official downloaded 2.118.0 binary worked with the existing authenticated CLI session. No OS security setting was changed.
- The old media migration can skip storage setup under a role without schema ownership. The missing `product-media` bucket was provisioned through Storage API using its documented public/image-only/5 MB settings. All 30 original catalog SVG URLs were fetched successfully after publication; 120 image rows now use durable storage URLs.
- `node scripts/seed-reference-catalog.mjs` previews the additive import; `--apply` publishes artwork then adds missing models. Existing matching models and owner media are preserved. `scripts/publish-reference-assets.mjs --apply` changes only image rows still pointing at the matching original local paths; it does not replace later owner uploads.
- `node scripts/verify-customer-design.mjs` is opt-in live QA. It creates/deletes a disposable account, uploads/removes a QA SVG, temporarily changes/restores the public design and verifies a second open storefront. Run against a local production build via `CUSTOMER_BASE_URL`; inspect its evidence file and cleanup output. It does not send messages or submit real customer requests.
- Browser regression command: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3112 PLAYWRIGHT_REUSE=1 npx playwright test tests/store-overlays.spec.ts tests/store-cart.spec.ts tests/store-merchandising.spec.ts --project=chromium --workers=2`. Menu role display uses session fixtures; actual permissions are checked separately by live QA and SQL tests.
- Source and hosted database changes do not automatically deploy frontend code. Publish the reviewed frontend through the existing release process to expose the new studio/customer UI on the production alias. Live catalog SVG URLs already work independently of that deployment.

- Live concurrency QA found that raising application revision conflicts as SQLSTATE `40001` causes hosted PostgREST retries until timeout. Added `20261002030000_storefront_design_conflicts.sql` to return `PT409` instead, with unchanged CEO authorization/row locking/audit. Use application conflict codes for revision mismatches, reserving engine serialization errors for actual transaction anomalies. References: [Supabase troubleshooting](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b), [PostgREST custom status codes](https://postgrest.org/en/v14/references/errors.html).

## Version 0.1.0 Git release and Preview configuration

- Release branch `0.1.0`, package/lock `0.1.0`, PR #7: https://github.com/kosaygobran-afk/miro/pull/7. Full reviewer scope/checks/limits are in `docs/releases/0.1.0.md` and submitted PR reviews. Merge preserves the branch history; final remote-main ancestry verification is posted on the PR.
- The first Git-connected Preview failed because the Preview environment was empty. Public `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are now configured specifically for Preview branch `0.1.0`. The private key was not copied. Public browsing can use its restricted anonymous projection; management APIs return explicit unavailable configuration when a private server key is absent.
- To diagnose Git deployment failures, inspect the Vercel check and `npx vercel inspect <deployment-id> --logs`. Adding environment variables affects subsequent deployments, so rebuild after a configuration change. Do not expose values in logs or commit a CLI environment export. Check Production rollout independently after a main merge; preserve existing Production settings.

## Animation settings and protected appearance backup — 2026-10-02

The additive migrations `20261002040000_animation_settings.sql` and `20261002050000_appearance_version_backup.sql` are applied to the linked database. Both were tested in isolated PostgreSQL; each linked dry run listed only its intended migration before application. There are now 35 migrations and ten SQL suites. Do not overwrite the protected `appearance_version_1_backup` row, even through service credentials; it is intentionally immutable.

Active CEO saves use the dedicated animation API/RPC with current revision, same-origin validation and an atomic audit. Anonymous reads use only the public presentation projection. If a new environment is missing these migrations, editing returns a reviewable unavailable error and public rendering retains safe defaults. The Version 1 restore prepares a draft and requires explicit Save; it does not roll back owner business content. Read `docs/ANIMATION_SYSTEM.md` for the full control/restore guide.

Use `REPORTING_OUTPUT_DIR` and `CONSOLE_OUTPUT_DIR` for new QA evidence so historical release records are preserved. Verification scripts use disposable authentication actors and retain private console screenshots in `/tmp`; their business saves are mocked or invalid/denied. Clean up actors in `finally`. Final device/accessibility and existing legal/privacy/catalog approval remain launch owner actions.
