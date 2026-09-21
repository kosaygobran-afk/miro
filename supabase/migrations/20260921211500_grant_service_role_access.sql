-- Allow trusted server-side service-role operations on Phase 2 tables.
-- RLS remains enabled; this grant is not exposed to browser clients.

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.user_roles to service_role;
grant select, insert, update, delete on public.service_requests to service_role;
grant select, insert, update, delete on public.audit_events to service_role;
