-- set_default_variant: atomically make one variant the default for its product.
-- Replaces the read-modify-write pattern in the variants API which had a race window.

create or replace function public.set_default_variant(p_variant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_product uuid;
begin
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select product_id into v_product
  from public.product_variants
  where id = p_variant
  for update;

  if not found then
    raise exception 'Variant not found' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_product::text));

  update public.product_variants
  set is_default = false, updated_at = timezone('utc'::text, now())
  where product_id = v_product and is_default;

  update public.product_variants
  set is_default = true, updated_at = timezone('utc'::text, now())
  where id = p_variant;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('variant_set_default', auth.uid(),
    jsonb_build_object('variant_id', p_variant, 'product_id', v_product),
    'product_variant', p_variant);
end;
$$;

revoke all on function public.set_default_variant(uuid) from public;
grant execute on function public.set_default_variant(uuid) to authenticated;
