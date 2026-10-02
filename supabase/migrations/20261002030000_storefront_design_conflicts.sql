-- Application version conflicts must not use serialization_failure (40001):
-- hosted PostgREST retries that engine error instead of returning the conflict.
begin;
create or replace function public.update_storefront_design(p_value jsonb, p_revision timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare current_revision timestamptz; next_revision timestamptz;
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode = '42501';
  end if;
  select updated_at into current_revision from public.business_settings where key = 'storefront_design' for update;
  if not found then raise exception 'Store design migration required' using errcode = '22023'; end if;
  if current_revision is distinct from p_revision then
    raise exception 'Design changed concurrently' using errcode = 'PT409';
  end if;
  perform public.set_business_setting('storefront_design', p_value);
  select updated_at into next_revision from public.business_settings where key = 'storefront_design';
  return next_revision;
end;
$$;
revoke all on function public.update_storefront_design(jsonb,timestamptz) from public;
grant execute on function public.update_storefront_design(jsonb,timestamptz) to authenticated;
commit;
