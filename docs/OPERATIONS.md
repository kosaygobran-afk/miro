# Operations Plan

## Development

- Use Next.js dev server with `npm run dev`
- Environment variables stored in .env.local (not committed)
- Supabase local development via Supabase CLI (when needed)

## Verification

- Install dependencies with `npm ci` for CI-style reproducibility.
- Run `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run build` before handoff.
- Run `npm run test:e2e` for production-backed Playwright smoke coverage. It intentionally refuses to reuse an existing local server, so port 3000 must be free. On a fresh machine, install the browser cache with `npx playwright install chromium` if Playwright reports a missing executable.
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
- Sample catalog fallback works without Supabase credentials. The live database read branch and existing authentication require a separately configured staging environment; never commit environment secrets.

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
