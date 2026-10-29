-- Global presentation only. Explicit owner scope: active CEO AND admin may save.
-- No anonymous table grants, catalog/financial mutations, or animation changes.
begin;

insert into public.business_settings(key,value)
values('glass_settings','{"enabled":true}'::jsonb)
on conflict(key) do nothing;

create or replace function public.validate_glass_settings()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.key <> 'glass_settings' then return new; end if;
  if jsonb_typeof(new.value) is distinct from 'object'
     or (new.value - array['enabled']) <> '{}'::jsonb
     or jsonb_typeof(new.value->'enabled') is distinct from 'boolean'
  then raise exception 'Glass settings require only a boolean enabled field' using errcode='22023'; end if;
  return new;
end;
$$;
revoke all on function public.validate_glass_settings() from public,anon,authenticated;
create trigger validate_glass_settings before insert or update on public.business_settings
for each row execute function public.validate_glass_settings();

create or replace function public.get_public_glass_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('enabled',value->'enabled','revision',updated_at)
  from public.business_settings where key='glass_settings';
$$;
revoke all on function public.get_public_glass_settings() from public;
grant execute on function public.get_public_glass_settings() to anon,authenticated,service_role;

create or replace function public.update_glass_settings(p_value jsonb,p_revision timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  actor_role text := public.active_app_role();
  current_revision timestamptz;
  previous_value jsonb;
  next_revision timestamptz;
begin
  if actor_role is null or actor_role not in ('ceo','admin') then
    raise exception 'Active CEO or admin required' using errcode='42501';
  end if;
  select updated_at,value into current_revision,previous_value
  from public.business_settings where key='glass_settings' for update;
  if not found then raise exception 'Glass settings migration required' using errcode='22023'; end if;
  if current_revision is distinct from p_revision then
    raise exception 'Glass settings changed concurrently' using errcode='PT409';
  end if;
  next_revision := greatest(clock_timestamp(),current_revision + interval '1 microsecond');
  update public.business_settings
  set value=p_value,updated_by=auth.uid(),updated_at=next_revision
  where key='glass_settings';
  insert into public.audit_events(action,user_id,details,entity_type,entity_id)
  values('setting_changed',auth.uid(),jsonb_build_object(
    'setting_key','glass_settings','previous_value',previous_value,'new_value',p_value,
    'previous_revision',current_revision,'revision',next_revision
  ),'business_setting',null);
  return next_revision;
end;
$$;
revoke all on function public.update_glass_settings(jsonb,timestamptz) from public,anon;
grant execute on function public.update_glass_settings(jsonb,timestamptz) to authenticated;

-- Preserve every existing generic-setter restriction; only add glass to its
-- dedicated-controls guard so it cannot bypass optimistic concurrency/audit.
create or replace function public.set_business_setting(p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode='42501';
  end if;
  if p_key in ('animation_settings','appearance_version_1_backup','glass_settings') then
    raise exception 'Use dedicated appearance settings controls' using errcode='22023';
  end if;
  if p_key like 'commerce.%' or p_key like 'fiscal.%' or p_key like 'payment.%' then
    raise exception 'Protected setting key' using errcode='42501';
  end if;
  insert into public.business_settings(key,value,updated_by) values(p_key,p_value,auth.uid())
  on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_events(action,user_id,details,entity_type,entity_id)
  values('setting_changed',auth.uid(),jsonb_build_object('setting_key',p_key,'new_value',p_value),'business_setting',null);
end;
$$;
revoke all on function public.set_business_setting(text,jsonb) from public,anon;
grant execute on function public.set_business_setting(text,jsonb) to authenticated;

comment on function public.get_public_glass_settings() is 'Public projection of global glass enabled flag and revision only; business settings stay private.';
comment on function public.update_glass_settings(jsonb,timestamptz) is 'Active CEO or admin only, strict boolean contract, revision PT409, atomic audit. No effect on animation or other settings permissions.';
commit;
