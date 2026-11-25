begin;

create or replace function public.patch_business_setting(p_key text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  initial_value jsonb := '{}'::jsonb;
  saved_value jsonb;
  field record;
  field_text text;
  threshold numeric;
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode = '42501';
  end if;
  if p_key is null or p_key not in ('inventory_defaults', 'public_contact')
     or jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'Invalid settings patch' using errcode = '22023';
  end if;

  if p_key = 'inventory_defaults' then
    initial_value := '{"low_stock_threshold":3,"out_of_stock_policy":"keep_visible_contact"}'::jsonb;
    if p_patch - array['low_stock_threshold', 'out_of_stock_policy'] <> '{}'::jsonb then
      raise exception 'Invalid inventory field' using errcode = '22023';
    end if;
    if p_patch ? 'low_stock_threshold' then
      if jsonb_typeof(p_patch->'low_stock_threshold') <> 'number' then
        raise exception 'Invalid stock threshold' using errcode = '22023';
      end if;
      threshold := (p_patch->>'low_stock_threshold')::numeric;
      if threshold <> trunc(threshold) or threshold not between 0 and 10000 then
        raise exception 'Invalid stock threshold' using errcode = '22023';
      end if;
    end if;
    if p_patch ? 'out_of_stock_policy' and (
      jsonb_typeof(p_patch->'out_of_stock_policy') <> 'string'
      or p_patch->>'out_of_stock_policy' not in (
        'keep_visible_contact', 'keep_visible_restock', 'hide_from_public'
      )
    ) then
      raise exception 'Invalid out-of-stock policy' using errcode = '22023';
    end if;
  else
    for field in select key, value from jsonb_each(p_patch) loop
      if field.key not in ('phone', 'whatsapp', 'email', 'address_he', 'address_en', 'hours_he', 'hours_en') then
        raise exception 'Invalid public contact field' using errcode = '22023';
      end if;
      if jsonb_typeof(field.value) = 'null' then
        continue;
      end if;
      if jsonb_typeof(field.value) <> 'string' then
        raise exception 'Invalid public contact value' using errcode = '22023';
      end if;
      field_text := field.value #>> '{}';
      if (case
        when field.key = 'phone' then field_text !~ '^[+]?[0-9]{6,15}$'
        when field.key = 'whatsapp' then field_text !~ '^[0-9]{7,15}$'
        when field.key = 'email' then length(field_text) > 254
          or field_text !~ '^(?![.])(?!.*[.][.])[A-Za-z0-9_''+.-]*[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*[.])+[A-Za-z]{2,}$'
        when field.key in ('address_he', 'address_en') then length(field_text) > 300 or field_text !~ '[^[:space:]]'
        else length(field_text) > 200 or field_text !~ '[^[:space:]]'
      end) then
        raise exception 'Invalid public contact value' using errcode = '22023';
      end if;
    end loop;
  end if;

  -- The conflicting row is locked by the upsert. Merge into its current
  -- value so simultaneous saves of distinct fields both survive.
  insert into public.business_settings as settings (key, value, updated_by)
  values (p_key, initial_value || p_patch, auth.uid())
  on conflict (key) do update set
    value = (case when jsonb_typeof(settings.value) = 'object'
      then settings.value else initial_value end) || p_patch,
    updated_by = excluded.updated_by,
    updated_at = greatest(clock_timestamp(), settings.updated_at + interval '1 microsecond')
  returning settings.value into saved_value;

  insert into public.audit_events(action, user_id, details, entity_type, entity_id)
  values ('setting_changed', auth.uid(), jsonb_build_object(
    'setting_key', p_key, 'new_value', saved_value
  ), 'business_setting', null);

  return saved_value;
end;
$$;
revoke all on function public.patch_business_setting(text,jsonb) from public, anon;
grant execute on function public.patch_business_setting(text,jsonb) to authenticated;

commit;
