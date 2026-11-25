begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('00000000-0000-0000-0000-000000002951','settings-patch-ceo@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000002952','settings-patch-admin@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000002953','settings-patch-blocked@example.invalid',now(),'{}');
update public.user_roles set role='ceo' where user_id in (
  '00000000-0000-0000-0000-000000002951','00000000-0000-0000-0000-000000002953'
);
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000002952';
update public.profiles set account_status='active' where id in (
  '00000000-0000-0000-0000-000000002951','00000000-0000-0000-0000-000000002952'
);
update public.profiles set account_status='blocked' where id='00000000-0000-0000-0000-000000002953';

insert into public.business_settings(key,value) values
('public_contact','{"phone":"+972500000000","address_en":"Original street"}'),
('inventory_defaults','{"low_stock_threshold":5,"out_of_stock_policy":"hide_from_public"}')
on conflict(key) do update set value=excluded.value;

set local role anon;
do $$ begin
  begin perform public.patch_business_setting('public_contact','{}');
    raise exception 'Anonymous patch allowed'; exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
do $$ declare actor text; begin
  foreach actor in array array[
    '00000000-0000-0000-0000-000000002952',
    '00000000-0000-0000-0000-000000002953'
  ] loop
    perform set_config('request.jwt.claim.sub',actor,true);
    begin perform public.patch_business_setting('public_contact','{}');
      raise exception 'Non-active CEO patch allowed'; exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002951',true);
do $$ declare value jsonb; previous_revision timestamptz; previous_catalog_version bigint; invalid_patch jsonb; begin
  select updated_at into previous_revision from public.business_settings where key='inventory_defaults';
  select version into previous_catalog_version from public.store_catalog_version where id=1;
  value := public.patch_business_setting('inventory_defaults','{"low_stock_threshold":0}');
  if value is distinct from '{"low_stock_threshold":0,"out_of_stock_policy":"hide_from_public"}'::jsonb
    or (select updated_at from public.business_settings where key='inventory_defaults') <= previous_revision then
    raise exception 'Inventory patch did not preserve omitted policy or explicit zero';
  end if;
  if (select version from public.store_catalog_version where id=1) <> previous_catalog_version + 1 then
    raise exception 'Inventory defaults patch did not notify the Store version';
  end if;
  value := public.patch_business_setting('public_contact','{"hours_he":"ראשון 09:00"}');
  if value is distinct from '{"phone":"+972500000000","address_en":"Original street","hours_he":"ראשון 09:00"}'::jsonb then
    raise exception 'Contact patch modified an omitted field';
  end if;
  value := public.patch_business_setting('public_contact','{"phone":null}');
  if value is distinct from '{"phone":null,"address_en":"Original street","hours_he":"ראשון 09:00"}'::jsonb then
    raise exception 'Contact clear did not keep explicit null and unrelated fields';
  end if;
  foreach invalid_patch in array array[
    '{"private_value":"forbidden"}'::jsonb,
    '{"phone":"not a phone"}'::jsonb,
    '{"email":1}'::jsonb,
    '{"hours_en":" "}'::jsonb
  ] loop
    begin perform public.patch_business_setting('public_contact',invalid_patch);
      raise exception 'Invalid contact patch allowed'; exception when invalid_parameter_value then null;
    end;
  end loop;
  foreach invalid_patch in array array[
    '{"out_of_stock_policy":"inherit"}'::jsonb,
    '{"low_stock_threshold":1.5}'::jsonb,
    '{"low_stock_threshold":"7"}'::jsonb,
    '{"low_stock_threshold":10001}'::jsonb
  ] loop
    begin perform public.patch_business_setting('inventory_defaults',invalid_patch);
      raise exception 'Invalid inventory patch allowed'; exception when invalid_parameter_value then null;
    end;
  end loop;
  begin perform public.patch_business_setting('commerce.identity','{}');
    raise exception 'Unrelated key patch allowed'; exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.audit_events
      where action='setting_changed' and user_id='00000000-0000-0000-0000-000000002951') <> 3 then
    raise exception 'Expected one audit event per successful settings patch';
  end if;
  if not exists (
    select 1 from public.audit_events
    where action='setting_changed' and user_id='00000000-0000-0000-0000-000000002951'
      and details->>'setting_key'='public_contact'
      and details->'new_value'=(select value from public.business_settings where key='public_contact')
  ) then raise exception 'Audit does not contain the canonical saved contact'; end if;
end $$;

rollback;
