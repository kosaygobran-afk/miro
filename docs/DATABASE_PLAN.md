# Database Plan

## Current Tables (Phase 0-1)

None - Supabase setup pending.

## Future Tables

- profiles: user_id, display_name, optional phone, timestamps
- user_roles: user_id (primary key), role (customer/worker/ceo)
- service_requests: id, customer_id (nullable for guest), service_id, contact info, status, timestamps
- jobs: request_id, assigned_worker_id, operational status, timestamps
- audit_events: id, action, user_id, timestamp, details

## Ownership and Indexing

- Row-level security enforces data ownership.
- Indexes on foreign keys and query predicates.
- Generated TypeScript types from real database schema.

Note: Do not migrate all speculative tables now.
