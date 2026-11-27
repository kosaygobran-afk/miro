-- Workers are shoppers with role-specific catalog pricing, not request staff.
-- Preserve historic assignments; only managers may see or change requests.
-- The old implementation remains private so its installed audit/validation
-- behavior stays intact, including deployments with additional hardening.
begin;

alter policy "Authenticated read access" on public.service_requests
  using (
    customer_id = (select auth.uid())
    or (select public.active_app_role()) in ('admin', 'ceo')
  );

alter function public.update_service_request(uuid,text,uuid)
  rename to update_service_request_management_core;
revoke all on function public.update_service_request_management_core(uuid,text,uuid)
  from public, anon, authenticated, service_role;

create function public.update_service_request(target uuid, new_status text, worker uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare current_assignee uuid;
begin
  if coalesce(public.active_app_role(), '') not in ('admin', 'ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select assigned_to into current_assignee
    from public.service_requests where id = target for update;
  if not found then raise exception 'Unknown request' using errcode = '22023'; end if;
  -- Existing worker assignments can be retained for historical continuity or
  -- replaced/cleared by management, but no new worker assignment is allowed.
  if worker is not null and worker is distinct from current_assignee
     and not exists (
       select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
       where r.user_id = worker and r.role in ('admin', 'ceo') and p.account_status = 'active'
     ) then
    raise exception 'Invalid assignee' using errcode = '22023';
  end if;
  perform public.update_service_request_management_core(target, new_status, worker);
end;
$$;
revoke all on function public.update_service_request(uuid,text,uuid) from public, anon, service_role;
grant execute on function public.update_service_request(uuid,text,uuid) to authenticated;
comment on function public.update_service_request(uuid,text,uuid) is
  'Admin/CEO request handling only; new assignees must be active admin/CEO accounts. Existing assignments are preserved until management changes them.';

-- Expand only the verified checkout writer's existing role predicate. Abort on
-- schema drift rather than replacing an installed implementation wholesale.
do $$
declare
  definition text;
  old_predicate constant text := 'p.account_status = ''active'' and r.role = ''customer''';
  new_predicate constant text := 'p.account_status = ''active'' and r.role in (''customer'', ''worker'')';
begin
  select pg_get_functiondef('public.record_checkout_request(uuid,text,uuid,jsonb,text)'::regprocedure) into definition;
  if position(old_predicate in definition) = 0
    or length(definition) - length(replace(definition, old_predicate, '')) <> length(old_predicate) then
    raise exception 'Checkout writer baseline differs; review before applying worker access';
  end if;
  execute replace(definition, old_predicate, new_predicate);
end $$;

commit;
