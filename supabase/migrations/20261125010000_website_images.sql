begin;

-- An empty seed uses the website's bundled design. A saved design with an
-- empty gallery is intentional and must not fall back to bundled images.
insert into public.business_settings(key, value)
values ('website_images', '{}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_public_website_images()
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.business_settings where key = 'website_images';
$$;
revoke all on function public.get_public_website_images() from public;
grant execute on function public.get_public_website_images() to anon, authenticated, service_role;

create or replace function public.website_image_url_is_valid(p_url text)
returns boolean language sql immutable set search_path = '' as $$
  select length(p_url) between 1 and 2048
    and p_url !~ '[[:cntrl:]]'
    and position(chr(92) in p_url) = 0
    and (
      (p_url ~ '^/(images|website-photos)/[A-Za-z0-9_.,/-]+$'
        and p_url !~ '/[.]{1,2}(/|$)'
        and p_url !~ '/$'
        and p_url !~ '//')
      or p_url ~* '^https://([a-z0-9][a-z0-9._-]*|[[][0-9a-f:.]+[]])(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    );
$$;
revoke all on function public.website_image_url_is_valid(text) from public, anon, authenticated;

create or replace function public.website_image_number_in_range(
  p_number jsonb, p_min numeric, p_max numeric, p_whole boolean
) returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_number) = 'number' then
    p_number::numeric between p_min and p_max
    and (not p_whole or trunc(p_number::numeric) = p_number::numeric)
  else false end;
$$;
revoke all on function public.website_image_number_in_range(jsonb,numeric,numeric,boolean)
  from public, anon, authenticated;

create or replace function public.update_website_images(p_value jsonb, p_revision timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  current_revision timestamptz;
  next_revision timestamptz;
  gallery jsonb;
  image jsonb;
  image_override record;
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'Active CEO required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_value) is distinct from 'object'
    or octet_length(p_value::text) > 700000
    or (p_value - array['galleries','overrides']) <> '{}'::jsonb
    or jsonb_typeof(p_value->'galleries') is distinct from 'object'
    or jsonb_typeof(p_value->'overrides') is distinct from 'object'
    or ((p_value->'galleries') - array['home','services','serviceDetails']) <> '{}'::jsonb
    or not (p_value->'galleries' ?& array['home','services','serviceDetails'])
  then
    raise exception 'Invalid website image design' using errcode = '22023';
  end if;

  for gallery in select value from jsonb_each(p_value->'galleries') loop
    if jsonb_typeof(gallery) is distinct from 'object'
      or (gallery - array['images','animation','effect','autoplay','interval','radius','border']) <> '{}'::jsonb
      or not (gallery ?& array['images','animation','effect','autoplay','interval','radius','border'])
      or jsonb_typeof(gallery->'images') is distinct from 'array'
      or coalesce(gallery->>'animation', '') not in ('flip-up','swipe-left','fade','none')
      or coalesce(gallery->>'effect', '') not in ('natural','warm','mono')
      or jsonb_typeof(gallery->'autoplay') is distinct from 'boolean'
      or not public.website_image_number_in_range(gallery->'interval',5,30,true)
      or not public.website_image_number_in_range(gallery->'radius',0,32,true)
      or not public.website_image_number_in_range(gallery->'border',0,6,true)
    then
      raise exception 'Invalid website image gallery' using errcode = '22023';
    end if;
    if jsonb_array_length(gallery->'images') > 24 then
      raise exception 'Too many gallery images' using errcode = '22023';
    end if;

    for image in select value from jsonb_array_elements(gallery->'images') loop
      if jsonb_typeof(image) is distinct from 'object'
        or (image - array['url','altHe','altEn','fit','x','y','zoom']) <> '{}'::jsonb
        or not (image ?& array['url','altHe','altEn','fit','x','y','zoom'])
        or jsonb_typeof(image->'url') is distinct from 'string'
        or not public.website_image_url_is_valid(image->>'url')
        or jsonb_typeof(image->'altHe') is distinct from 'string'
        or jsonb_typeof(image->'altEn') is distinct from 'string'
        or length(image->>'altHe') not between 1 and 180
        or length(image->>'altEn') not between 1 and 180
        or image->>'altHe' !~ '[^[:space:]]'
        or image->>'altEn' !~ '[^[:space:]]'
        or coalesce(image->>'fit', '') not in ('cover','contain')
        or not public.website_image_number_in_range(image->'x',0,100,true)
        or not public.website_image_number_in_range(image->'y',0,100,true)
        or not public.website_image_number_in_range(image->'zoom',1,2,false)
      then
        raise exception 'Invalid website image' using errcode = '22023';
      end if;
    end loop;
  end loop;

  if (select count(*) from jsonb_object_keys(p_value->'overrides')) > 120 then
    raise exception 'Too many website image overrides' using errcode = '22023';
  end if;
  for image_override in select key, value from jsonb_each(p_value->'overrides') loop
    if length(image_override.key) > 100
      or image_override.key !~ '^(home-hero|service-[a-z0-9]+(-[a-z0-9]+)*)$'
      or jsonb_typeof(image_override.value) is distinct from 'string'
      or (image_override.value #>> '{}' <> '' and not public.website_image_url_is_valid(image_override.value #>> '{}'))
    then
      raise exception 'Invalid website image override' using errcode = '22023';
    end if;
  end loop;

  select updated_at into current_revision
  from public.business_settings where key = 'website_images' for update;
  if not found then
    raise exception 'Website image settings migration required' using errcode = 'PT503';
  end if;
  if current_revision is distinct from p_revision then
    raise exception 'Website image settings changed concurrently' using errcode = 'PT409';
  end if;

  next_revision := greatest(clock_timestamp(), current_revision + interval '1 microsecond');
  update public.business_settings
  set value = p_value, updated_by = auth.uid(), updated_at = next_revision
  where key = 'website_images';

  insert into public.audit_events(action, user_id, details, entity_type, entity_id)
  values ('setting_changed', auth.uid(), jsonb_build_object(
    'setting_key', 'website_images',
    'previous_revision', current_revision,
    'revision', next_revision,
    'home_images', jsonb_array_length(p_value#>'{galleries,home,images}'),
    'services_images', jsonb_array_length(p_value#>'{galleries,services,images}'),
    'service_details_images', jsonb_array_length(p_value#>'{galleries,serviceDetails,images}')
  ), 'business_setting', null);
  return next_revision;
end;
$$;
revoke all on function public.update_website_images(jsonb,timestamptz) from public, anon;
grant execute on function public.update_website_images(jsonb,timestamptz) to authenticated;

-- Match the prior generic setter, with the new key reserved for its writer.
create or replace function public.set_business_setting(p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode='42501';
  end if;
  if p_key in ('animation_settings','appearance_version_1_backup','glass_settings','website_images') then
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
revoke all on function public.set_business_setting(text,jsonb) from public, anon;
grant execute on function public.set_business_setting(text,jsonb) to authenticated;

commit;
