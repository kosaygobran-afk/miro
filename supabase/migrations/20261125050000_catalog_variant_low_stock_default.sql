-- Resolve the saved inventory default at creation time. Existing variants
-- retain the threshold stored on their row, including an explicit zero.
create function public.catalog_variant_low_stock_default()
returns integer
language sql stable set search_path = ''
as $$
  select coalesce((
    select case when threshold between 0 and 10000 and trunc(threshold) = threshold
      then threshold::integer end
    from (
      select case when jsonb_typeof(value->'low_stock_threshold') = 'number'
        then (value->>'low_stock_threshold')::numeric end as threshold
      from public.business_settings where key = 'inventory_defaults'
    ) as settings
  ), 3);
$$;
revoke all on function public.catalog_variant_low_stock_default() from public, anon, authenticated;
grant execute on function public.catalog_variant_low_stock_default() to service_role;

alter table public.product_variants alter column low_stock_threshold
  set default public.catalog_variant_low_stock_default();

-- Preserve catalog creation and its atomic audits. Only omission uses the
-- business default, while the established explicit values keep their meaning.
create or replace function public.create_catalog_variant(p_data jsonb)
returns public.product_variants
language plpgsql security definer set search_path = ''
as $$
declare
  v_variant public.product_variants;
  v_product_id uuid;
  v_key text;
  v_allowed constant text[] := array[
    'product_id','sku','barcode','color_he','color_en','color_hex',
    'price_override','cost_override','supplier_id','supplier_sku',
    'is_default','is_active','low_stock_threshold','reorder_point','reorder_qty'
  ];
begin
  if public.active_app_role() is null or public.active_app_role() not in ('admin', 'ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Invalid variant details' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_data) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'Invalid variant field: %', v_key using errcode = '22023';
    end if;
  end loop;
  v_product_id := (p_data->>'product_id')::uuid;
  if v_product_id is null or nullif(trim(p_data->>'sku'), '') is null then
    raise exception 'Product and SKU required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_product_id::text));
  perform 1 from public.products where id = v_product_id for update;
  if not found then
    raise exception 'Product not found' using errcode = '22023';
  end if;
  if coalesce((p_data->>'is_default')::boolean, false) then
    update public.product_variants set is_default = false
    where product_id = v_product_id and is_default;
  end if;

  insert into public.product_variants (
    product_id, sku, barcode, color_he, color_en, color_hex,
    price_override, cost_override, supplier_id, supplier_sku,
    is_default, is_active, low_stock_threshold, reorder_point, reorder_qty
  ) values (
    v_product_id, trim(p_data->>'sku'), p_data->>'barcode',
    p_data->>'color_he', p_data->>'color_en', p_data->>'color_hex',
    (p_data->>'price_override')::numeric,
    (p_data->>'cost_override')::numeric,
    (p_data->>'supplier_id')::uuid, p_data->>'supplier_sku',
    coalesce((p_data->>'is_default')::boolean, false),
    coalesce((p_data->>'is_active')::boolean, true),
    case when p_data ? 'low_stock_threshold'
      then coalesce((p_data->>'low_stock_threshold')::integer, 0)
      else public.catalog_variant_low_stock_default() end,
    (p_data->>'reorder_point')::integer,
    (p_data->>'reorder_qty')::integer
  ) returning * into v_variant;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('variant_created', auth.uid(),
    jsonb_build_object('variant_id', v_variant.id, 'product_id', v_product_id,
                       'sku', v_variant.sku, 'is_default', v_variant.is_default),
    'product_variant', v_variant.id);
  if v_variant.is_default then
    insert into public.audit_events (action, user_id, details, entity_type, entity_id)
    values ('variant_set_default', auth.uid(),
      jsonb_build_object('variant_id', v_variant.id, 'product_id', v_product_id),
      'product_variant', v_variant.id);
  end if;
  return v_variant;
end;
$$;
