begin;

insert into public.business_settings(key, value)
values ('website_page_copy', '{}'::jsonb)
on conflict (key) do nothing;

create function public.get_public_website_page_copy()
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.business_settings where key = 'website_page_copy';
$$;
revoke all on function public.get_public_website_page_copy() from public;
grant execute on function public.get_public_website_page_copy() to anon, authenticated, service_role;

create function public.update_website_page_copy(p_value jsonb, p_revision timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  current_revision timestamptz;
  next_revision timestamptz;
  page record;
  translation jsonb;
  field record;
  allowed_fields text[];
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'Active CEO required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_value) is distinct from 'object'
    or (p_value - array['store','home','services','about','contact']) <> '{}'::jsonb
  then
    raise exception 'Invalid website page copy' using errcode = '22023';
  end if;

  for page in select key, value from jsonb_each(p_value) loop
    if jsonb_typeof(page.value) is distinct from 'object'
      or (page.value - array['he','en']) <> '{}'::jsonb
      or not (page.value ?& array['he','en'])
    then
      raise exception 'Both languages are required' using errcode = '22023';
    end if;
    allowed_fields := array['eyebrow','title','accent','description'];
    if page.key = 'home' then
      allowed_fields := array_append(allowed_fields, 'closing');
    end if;
    for translation in select value from jsonb_each(page.value) loop
      if jsonb_typeof(translation) is distinct from 'object'
        or (translation - allowed_fields) <> '{}'::jsonb
        or not (translation ?& array['eyebrow','title','accent','description'])
      then
        raise exception 'Invalid page text fields' using errcode = '22023';
      end if;
      for field in select key, value from jsonb_each(translation) loop
        if jsonb_typeof(field.value) is distinct from 'string'
          or length(field.value #>> '{}') not between 1 and (case when field.key = 'description' then 500 else 100 end)
          or field.value #>> '{}' ~ '[\x01-\x1F\x7F]'
          or field.value #>> '{}' !~ '[^[:space:]]'
        then
          raise exception 'Invalid page text' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end loop;

  select updated_at into current_revision
  from public.business_settings where key = 'website_page_copy' for update;
  if not found then
    raise exception 'Website page copy migration required' using errcode = 'PT503';
  end if;
  if current_revision is distinct from p_revision then
    raise exception 'Website page copy changed concurrently' using errcode = 'PT409';
  end if;

  next_revision := greatest(clock_timestamp(), current_revision + interval '1 microsecond');
  update public.business_settings
  set value = p_value, updated_by = auth.uid(), updated_at = next_revision
  where key = 'website_page_copy';

  insert into public.audit_events(action, user_id, details, entity_type, entity_id)
  values ('setting_changed', auth.uid(), jsonb_build_object(
    'setting_key', 'website_page_copy',
    'previous_revision', current_revision,
    'revision', next_revision
  ), 'business_setting', null);
  return next_revision;
end;
$$;
revoke all on function public.update_website_page_copy(jsonb,timestamptz) from public, anon;
grant execute on function public.update_website_page_copy(jsonb,timestamptz) to authenticated;

create or replace function public.set_business_setting(p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode='42501';
  end if;
  if p_key in ('animation_settings','appearance_version_1_backup','glass_settings','website_images','website_page_copy') then
    raise exception 'Use dedicated website settings controls' using errcode='22023';
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
revoke all on function public.set_business_setting(text,jsonb) from public, anon;
grant execute on function public.set_business_setting(text,jsonb) to authenticated;

commit;
