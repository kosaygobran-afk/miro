-- CEO console fixes:
-- 1) add_ceo now sets profiles.role = 'ceo' (it previously wrote 'admin') and rejects
--    targets that already hold the ceo role instead of logging a fake ceo_added event.
-- 2) One-time repair aligns profiles.role with user_roles for existing CEOs.
-- 3) delete_user_account removes the auth.users row in the same transaction so account
--    deletion is atomic; the API route no longer calls auth.admin.deleteUser separately.

create or replace function public.add_ceo(account_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  perform pg_advisory_xact_lock(20260921);
  perform public.require_recent_ceo_password();
  select u.id into target from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(account_email)) and u.email_confirmed_at is not null and p.account_status = 'active';
  if target is null then raise exception 'An active, verified account is required' using errcode = '22023'; end if;
  if target = auth.uid() then raise exception 'Already CEO' using errcode = '22023'; end if;
  if exists (select 1 from public.user_roles where user_id = target and role = 'ceo') then
    raise exception 'Already CEO' using errcode = '22023';
  end if;
  update public.user_roles set role = 'ceo' where user_id = target;
  if not found then raise exception 'Account role missing' using errcode = '22023'; end if;
  update public.profiles set role = 'ceo' where id = target;
  insert into public.audit_events(action,user_id,details) values ('ceo_added',auth.uid(),jsonb_build_object('target_user_id',target));
end;
$$;
revoke all on function public.add_ceo(text) from public;
grant execute on function public.add_ceo(text) to authenticated;

update public.profiles p set role = 'ceo'
from public.user_roles r
where r.user_id = p.id and r.role = 'ceo' and p.role is distinct from 'ceo';

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
  delete from auth.users where id = target;
end;
$$;
revoke all on function public.delete_user_account(uuid) from public;
grant execute on function public.delete_user_account(uuid) to authenticated;
