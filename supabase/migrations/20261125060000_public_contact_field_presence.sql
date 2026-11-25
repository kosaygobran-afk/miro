begin;

create or replace function public.get_public_contact_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with configuration as (
    select coalesce(
      (select bs.value from public.business_settings bs where bs.key = 'public_contact'),
      '{}'::jsonb
    ) as value
  )
  select jsonb_build_object(
    'phone', value->'phone',
    'whatsapp', value->'whatsapp',
    'email', value->'email',
    'address_he', value->'address_he',
    'address_en', value->'address_en',
    'hours_he', value->'hours_he',
    'hours_en', value->'hours_en',
    'configured_fields', (
      select coalesce(jsonb_agg(field order by field), '[]'::jsonb)
      from unnest(array['phone', 'whatsapp', 'email']) as allowed(field)
      where value ? field
    )
  )
  from configuration;
$$;

comment on function public.get_public_contact_config() is
  'Public. Returns whitelisted storefront contacts and marks saved action fields, including explicit clears.';

commit;
