-- CEO-only self-service with fresh password authentication in the signed JWT.
create or replace function public.require_recent_ceo_password()
returns void language plpgsql security definer set search_path = '' as $$
declare claims jsonb;
begin
  if public.active_app_role() is distinct from 'ceo' then raise exception 'CEO required' using errcode = '42501'; end if;
  claims := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  if not exists (select 1 from jsonb_array_elements(coalesce(claims->'amr','[]'::jsonb)) a
    where a->>'method' = 'password' and (a->>'timestamp')::numeric >= extract(epoch from now()) - 120) then
    raise exception 'Verify your password again' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_recent_ceo_password() from public;

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
  update public.user_roles set role = 'ceo' where user_id = target;
  if not found then raise exception 'Account role missing' using errcode = '22023'; end if;
  update public.profiles set role = 'admin' where id = target;
  insert into public.audit_events(action,user_id,details) values ('ceo_added',auth.uid(),jsonb_build_object('target_user_id',target));
end;
$$;
revoke all on function public.add_ceo(text) from public;
grant execute on function public.add_ceo(text) to authenticated;

create or replace function public.delete_own_ceo_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(20260921);
  perform public.require_recent_ceo_password();
  if (select count(*) from public.user_roles r join public.profiles p on p.id = r.user_id where r.role='ceo' and p.account_status='active') <= 1 then
    raise exception 'At least one active CEO must remain' using errcode = '42501';
  end if;
  insert into public.audit_events(action,user_id,details) values ('ceo_self_deleted',auth.uid(),jsonb_build_object('deleted_user_id',auth.uid()));
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_own_ceo_account() from public;
grant execute on function public.delete_own_ceo_account() to authenticated;
