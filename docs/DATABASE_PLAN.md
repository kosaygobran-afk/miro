# Database implementation

Phase 2 migrations are in `supabase/migrations`. The linked project includes catalog, profiles, user_roles, service_requests, audit_events and the pre-existing commerce tables. Generated definitions are in `src/lib/supabase/database.types.ts`.

`user_roles` is the authority for customer/worker/admin/CEO permissions. Profile role metadata is not trusted for authorization. Customers may update only full_name and phone. Account management and worker request updates run audited, transactional SQL functions. Public catalog reads include active products only; checkout writes remain unavailable.

CEO operations require a recent password AMR claim. `add_ceo` promotes an existing active verified account. `delete_own_ceo_account` accepts no user identifier, preserves at least one active CEO and serializes with other role operations. CEO peers cannot be demoted or suspended through management.

Database tests in `supabase/tests` use rolled-back fixtures and must run only against an isolated database. Production migration changes must first pass this staging validation. Never commit connection metadata, passwords or service keys.
