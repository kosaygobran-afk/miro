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
- Sample catalog fallback works without Supabase credentials. The live database read branch and existing authentication require a separately configured staging environment; never commit environment secrets.
