begin;
-- Public design only. Existing finance/contact/notification settings remain private.
insert into public.business_settings(key,value) values ('storefront_design', '{"version":1,"hero":{"enabled":true,"intervalSeconds":10,"transition":"fade","transitionMs":650,"slides":[{"id":"security","title":"Security","imageUrl":"/images/store-design/hero-security.webp","enabled":true},{"id":"network","title":"Network","imageUrl":"/images/store-design/hero-network.webp","enabled":true},{"id":"access","title":"Access","imageUrl":"/images/store-design/hero-access.webp","enabled":true},{"id":"infrastructure","title":"Infrastructure","imageUrl":"/images/store-design/hero-infrastructure.webp","enabled":true},{"id":"smart","title":"Smart","imageUrl":"/images/store-design/hero-smart.webp","enabled":true}]},"brands":{"enabled":true,"durationSeconds":38,"items":[{"id":"ibm","name":"IBM","imageUrl":"/images/brands/ibm.svg","enabled":true},{"id":"tplink","name":"TP-Link","imageUrl":"/images/brands/tplink.svg","enabled":true},{"id":"ubiquiti","name":"Ubiquiti","imageUrl":"/images/brands/ubiquiti.svg","enabled":true},{"id":"hikvision","name":"Hikvision","imageUrl":"/images/brands/hikvision.svg","enabled":true},{"id":"ajax","name":"Ajax","imageUrl":"/images/brands/ajax.svg","enabled":true},{"id":"seagate","name":"Seagate","imageUrl":"/images/brands/seagate.svg","enabled":true},{"id":"western-digital","name":"Western Digital","imageUrl":"/images/brands/western-digital.svg","enabled":true},{"id":"dahua","name":"Dahua","imageUrl":"/images/brands/dahua.svg","enabled":true}]},"products":{"pixelsPerSecond":32,"hoverDelayMs":200}}'::jsonb) on conflict(key) do nothing;

create or replace function public.get_public_storefront_design()
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.business_settings where key = 'storefront_design';
$$;
revoke all on function public.get_public_storefront_design() from public;
grant execute on function public.get_public_storefront_design() to anon, authenticated, service_role;

create or replace function public.update_storefront_design(p_value jsonb, p_revision timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare current_revision timestamptz; next_revision timestamptz;
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode = '42501';
  end if;
  select updated_at into current_revision from public.business_settings where key = 'storefront_design' for update;
  if not found then raise exception 'Store design migration required' using errcode = '22023'; end if;
  if current_revision is distinct from p_revision then raise exception 'Design changed concurrently' using errcode = '40001'; end if;
  perform public.set_business_setting('storefront_design', p_value);
  select updated_at into next_revision from public.business_settings where key = 'storefront_design';
  return next_revision;
end;
$$;
revoke all on function public.update_storefront_design(jsonb,timestamptz) from public;
grant execute on function public.update_storefront_design(jsonb,timestamptz) to authenticated;

create or replace function public.validate_storefront_design()
returns trigger language plpgsql set search_path = '' as $$
declare entry jsonb; entries jsonb; enabled_count integer;
begin
  if new.key <> 'storefront_design' then return new; end if;
  if jsonb_typeof(new.value) is distinct from 'object' or (new.value - array['version','hero','brands','products']) <> '{}'::jsonb
     or new.value->>'version' is distinct from '1'
     or jsonb_typeof(new.value->'hero') is distinct from 'object'
     or jsonb_typeof(new.value->'brands') is distinct from 'object'
     or jsonb_typeof(new.value->'products') is distinct from 'object'
     or ((new.value->'hero') - array['enabled','intervalSeconds','transition','transitionMs','slides']) <> '{}'::jsonb
     or ((new.value->'brands') - array['enabled','durationSeconds','items']) <> '{}'::jsonb
     or ((new.value->'products') - array['pixelsPerSecond','hoverDelayMs']) <> '{}'::jsonb
  then raise exception 'Invalid public design fields' using errcode = '22023'; end if;
  if jsonb_typeof(new.value#>'{hero,enabled}') is distinct from 'boolean'
     or jsonb_typeof(new.value#>'{brands,enabled}') is distinct from 'boolean'
     or coalesce(new.value#>>'{hero,transition}','') not in ('fade','slide','zoom','none')
     or not coalesce((new.value#>>'{hero,intervalSeconds}') ~ '^[0-9]+$',false)
     or not coalesce((new.value#>>'{hero,transitionMs}') ~ '^[0-9]+$',false)
     or not coalesce((new.value#>>'{brands,durationSeconds}') ~ '^[0-9]+$',false)
     or not coalesce((new.value#>>'{products,pixelsPerSecond}') ~ '^[0-9]+$',false)
     or not coalesce((new.value#>>'{products,hoverDelayMs}') ~ '^[0-9]+$',false)
  then raise exception 'Invalid design options' using errcode = '22023'; end if;
  if (new.value#>>'{hero,intervalSeconds}')::numeric not between 5 and 60
     or (new.value#>>'{hero,transitionMs}')::numeric not between 150 and 1500
     or (new.value#>>'{brands,durationSeconds}')::numeric not between 15 and 120
     or (new.value#>>'{products,pixelsPerSecond}')::numeric not between 15 and 60
     or (new.value#>>'{products,hoverDelayMs}')::numeric not between 120 and 600
     or jsonb_typeof(new.value#>'{hero,slides}') is distinct from 'array'
     or jsonb_typeof(new.value#>'{brands,items}') is distinct from 'array'
  then raise exception 'Invalid design limits' using errcode = '22023'; end if;
  if jsonb_array_length(new.value#>'{hero,slides}') not between 1 and 20
     or jsonb_array_length(new.value#>'{brands,items}') > 24
  then raise exception 'Invalid design collection size' using errcode = '22023'; end if;
  foreach entries in array array[new.value#>'{hero,slides}', new.value#>'{brands,items}'] loop
    if (select count(*) from jsonb_array_elements(entries)) <> (select count(distinct x->>'id') from jsonb_array_elements(entries) x) then raise exception 'Duplicate design IDs' using errcode='22023'; end if;
    for entry in select * from jsonb_array_elements(entries) loop
      if jsonb_typeof(entry) is distinct from 'object' or (entry - array['id','name','title','imageUrl','enabled']) <> '{}'::jsonb
         or coalesce(length(entry->>'id'),0) not between 1 and 80
         or coalesce(length(coalesce(entry->>'name',entry->>'title')),0) not between 1 and 100
         or jsonb_typeof(entry->'enabled') is distinct from 'boolean'
         or coalesce(length(entry->>'imageUrl'),0) not between 1 and 2048
         or not coalesce((entry->>'imageUrl') ~ '^(/images/[a-zA-Z0-9/_.,-]+|https://[^/@[:space:]]+(/[^[:space:]]*)?)$',false)
      then raise exception 'Invalid design asset' using errcode = '22023'; end if;
    end loop;
  end loop;
  select count(*) into enabled_count from jsonb_array_elements(new.value#>'{hero,slides}') x where x->>'enabled'='true';
  if enabled_count = 0 then raise exception 'Keep a background enabled' using errcode='22023'; end if;
  return new;
end;
$$;
revoke all on function public.validate_storefront_design() from public;
create trigger validate_storefront_design before insert or update on public.business_settings for each row execute function public.validate_storefront_design();
create or replace function public.signal_storefront_design_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'DELETE' and old.key = 'storefront_design') or (tg_op <> 'DELETE' and new.key = 'storefront_design') then
    update public.store_catalog_version set version = version + 1, updated_at = clock_timestamp() where id = 1;
  end if;
  return null;
end;
$$;
revoke all on function public.signal_storefront_design_change() from public;
create trigger storefront_design_change_signal after insert or update or delete on public.business_settings for each row execute function public.signal_storefront_design_change();
commit;
