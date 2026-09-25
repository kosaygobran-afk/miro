-- CEO-only user management: all role/status changes and account deletion require active CEO.
-- Replaces manage_account to remove admin write capability; adds delete_user_account.

create or replace function public.manage_account(target uuid, new_role text default null, new_status text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text; target_role text;
begin
  perform pg_advisory_xact_lock(20260924);
  actor_role := public.active_app_role();
  if actor_role is null or actor_role <> 'ceo' then raise exception 'CEO required' using errcode = '42501'; end if;
  select role into target_role from public.user_roles where user_id = target for update;
  if target_role is null then raise exception 'Unknown account' using errcode = '22023'; end if;
  if target = auth.uid() then raise exception 'Cannot target self' using errcode = '42501'; end if;
  if target_role = 'ceo' then raise exception 'CEO accounts are protected' using errcode = '42501'; end if;
  if new_role is not null and new_role not in ('customer', 'worker', 'admin') then raise exception 'Invalid role' using errcode = '22023'; end if;
  if new_status is not null and new_status not in ('active', 'suspended', 'blocked') then raise exception 'Invalid status' using errcode = '22023'; end if;
  if new_role is null and new_status is null then raise exception 'Empty change' using errcode = '22023'; end if;
  if new_role is not null then
    update public.user_roles set role = new_role where user_id = target;
    update public.profiles set role = new_role where id = target;
  end if;
  if new_status is not null then
    update public.profiles set account_status = new_status, suspended_at = case when new_status = 'active' then null else now() end where id = target;
  end if;
  insert into public.audit_events(action, user_id, details) values ('account_control', auth.uid(), jsonb_build_object('target_user_id', target, 'role', new_role, 'status', new_status));
end;
$$;
revoke all on function public.manage_account(uuid, text, text) from public;
grant execute on function public.manage_account(uuid, text, text) to authenticated;

create or replace function public.delete_user_account(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text; target_role text;
begin
  perform pg_advisory_xact_lock(20260924);
  actor_role := public.active_app_role();
  if actor_role is null or actor_role <> 'ceo' then raise exception 'CEO required' using errcode = '42501'; end if;
  select role into target_role from public.user_roles where user_id = target for update;
  if target_role is null then raise exception 'Unknown account' using errcode = '22023'; end if;
  if target = auth.uid() then raise exception 'Use self-deletion flow' using errcode = '42501'; end if;
  if target_role = 'ceo' then raise exception 'CEO accounts require self-deletion flow' using errcode = '42501'; end if;
  insert into public.audit_events(action, user_id, details) values ('account_deleted', auth.uid(), jsonb_build_object('target_user_id', target, 'deleted_role', target_role));
  delete from public.user_roles where user_id = target;
  delete from public.profiles where id = target;
end;
$$;
revoke all on function public.delete_user_account(uuid) from public;
grant execute on function public.delete_user_account(uuid) to authenticated;