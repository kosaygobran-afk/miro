# Operations Plan

## Development
- Use Next.js dev server with `npm run dev`
- Environment variables stored in .env.local (not committed)
- Supabase local development via Supabase CLI (when needed)

## Deployment
- Build with `npm run build`
- Start with `npm run start`
- Deploy to Vercel or similar Node.js hosting platform
- Set environment variables in deployment platform

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