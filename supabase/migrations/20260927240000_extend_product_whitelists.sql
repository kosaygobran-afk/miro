-- Ticket DB-4: extend the update_product / update_variant field whitelists.
--
-- Wave-1 (20260927210000) whitelisted only part of the real editable column
-- set. The wave-2 products API found that too narrow: legitimate catalog
-- fields were rejected with 22023 exactly like unknown keys. This migration
-- re-creates both RPCs with the whitelist extended to every editable column
-- that actually exists on public.products / public.product_variants, with the
-- same type/range validation style. Publish-invariant validation, locking,
-- and audit behavior are unchanged.
--
-- products columns NOT editable by design:
--   id, created_at, updated_at  — system timestamps/identity
--   inventory_count             — legacy pre-ledger counter
--   is_active                   — derived from status by products_sync_is_active
--   status                      — handled via the dedicated p_patch->>'status' key
-- product_variants NOT editable here: stock_qty (ledger RPCs only), product_id.

-- ============================================================
-- 1. update_product — extended whitelist
-- ============================================================

create or replace function public.update_product(
  p_id uuid,
  p_patch jsonb
) returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_result public.products;
  v_target text;
  v_previous_status text;
  v_changed text[] := '{}';
  v_key text;
  v_variant_count integer;
  v_supplier uuid;
  v_restock date;
  v_whitelist constant text[] := array[
    'name_he','name_en','slug','category_id','brand','model_number',
    'short_description_he','short_description_en','description_he','description_en',
    'tags','warranty_he','warranty_en','sort_order','out_of_stock_policy',
    'is_featured','seo_title_he','seo_title_en','seo_description_he',
    'seo_description_en','price','compare_at_price','sale_price','purchase_cost',
    'image_url','specifications','metadata','currency','recommended_price',
    'expected_restock_date','tracking_mode','supplier_id'
  ];
  v_not_null constant text[] := array[
    'name_he','name_en','slug','sort_order','out_of_stock_policy','is_featured','tags',
    'specifications','metadata','currency','tracking_mode'
  ];
  v_numeric constant text[] := array[
    'price','compare_at_price','sale_price','purchase_cost','recommended_price'
  ];
begin
  -- Authorization: admin/ceo only
  if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch must be a JSON object' using errcode = '22023';
  end if;

  -- Reject unknown keys instead of silently discarding them (the exact bug
  -- this RPC exists to fix), and validate value shapes.
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key <> 'status' and not (v_key = any(v_whitelist)) then
      raise exception 'Field is not editable via update_product: %', v_key
        using errcode = '22023';
    end if;
    if jsonb_typeof(p_patch->v_key) = 'null' and v_key = any(v_not_null) then
      raise exception 'Field must not be null: %', v_key using errcode = '22023';
    end if;
    if v_key = any(v_numeric)
       and jsonb_typeof(p_patch->v_key) not in ('number','null') then
      raise exception 'Field must be a number or null: %', v_key
        using errcode = '22023';
    end if;
  end loop;

  if p_patch ? 'tags'
     and jsonb_typeof(p_patch->'tags') not in ('array','null') then
    raise exception 'Field must be an array or null: tags' using errcode = '22023';
  end if;
  if p_patch ? 'is_featured'
     and jsonb_typeof(p_patch->'is_featured') <> 'boolean' then
    raise exception 'Field must be a boolean: is_featured' using errcode = '22023';
  end if;
  if p_patch ? 'sort_order'
     and jsonb_typeof(p_patch->'sort_order') <> 'number' then
    raise exception 'Field must be a number: sort_order' using errcode = '22023';
  end if;
  if p_patch ? 'out_of_stock_policy'
     and coalesce(p_patch->>'out_of_stock_policy', 'inherit') not in
       ('inherit','keep_visible_contact','keep_visible_restock','hide_from_public') then
    raise exception 'Invalid out_of_stock_policy' using errcode = '22023';
  end if;

  -- Extended-field validation (jsonb null on these was already rejected by
  -- v_not_null above, so non-null present keys are checked for shape here).
  if p_patch ? 'specifications'
     and jsonb_typeof(p_patch->'specifications') <> 'object' then
    raise exception 'Field must be a JSON object: specifications' using errcode = '22023';
  end if;
  if p_patch ? 'metadata'
     and jsonb_typeof(p_patch->'metadata') <> 'object' then
    raise exception 'Field must be a JSON object: metadata' using errcode = '22023';
  end if;
  if p_patch ? 'currency'
     and (jsonb_typeof(p_patch->'currency') <> 'string'
          or (p_patch->>'currency') !~ '^[A-Z]{3}$') then
    raise exception 'Currency must be a 3-letter ISO code (e.g. ILS)' using errcode = '22023';
  end if;
  if p_patch ? 'tracking_mode'
     and coalesce(p_patch->>'tracking_mode', 'none') not in ('none','serial','lot') then
    raise exception 'Invalid tracking_mode' using errcode = '22023';
  end if;

  if p_patch ? 'expected_restock_date' then
    if jsonb_typeof(p_patch->'expected_restock_date') not in ('string','null') then
      raise exception 'Field must be a date string or null: expected_restock_date'
        using errcode = '22023';
    end if;
    if jsonb_typeof(p_patch->'expected_restock_date') = 'string' then
      begin
        v_restock := (p_patch->>'expected_restock_date')::date;
      exception when others then
        raise exception 'Invalid date: expected_restock_date (use YYYY-MM-DD)'
          using errcode = '22023';
      end;
    end if;
  end if;

  if p_patch ? 'supplier_id' then
    if jsonb_typeof(p_patch->'supplier_id') not in ('string','null') then
      raise exception 'Field must be a uuid string or null: supplier_id'
        using errcode = '22023';
    end if;
    if jsonb_typeof(p_patch->'supplier_id') = 'string' then
      begin
        v_supplier := (p_patch->>'supplier_id')::uuid;
      exception when others then
        raise exception 'Invalid uuid: supplier_id' using errcode = '22023';
      end;
      if not exists (select 1 from public.suppliers s where s.id = v_supplier) then
        raise exception 'Supplier not found' using errcode = '22023';
      end if;
    end if;
  end if;

  v_target := p_patch->>'status';
  if v_target is not null
     and v_target not in ('draft','active','hidden','archived') then
    raise exception 'Invalid target status' using errcode = '22023';
  end if;

  -- Serialize with publish_product / unpublish_product (same lock key)
  perform pg_advisory_xact_lock(hashtext(p_id::text));

  select * into v_product
  from public.products
  where id = p_id
  for update;

  if not found then
    raise exception 'Product not found' using errcode = '22023';
  end if;

  v_previous_status := v_product.status;

  -- Apply every whitelisted content field in one statement. The
  -- products_guard_active_integrity trigger fires here when the product is
  -- (and stays) active, so an active product can never be saved incomplete.
  update public.products set
    name_he               = case when p_patch ? 'name_he' then p_patch->>'name_he' else name_he end,
    name_en               = case when p_patch ? 'name_en' then p_patch->>'name_en' else name_en end,
    slug                  = case when p_patch ? 'slug' then p_patch->>'slug' else slug end,
    category_id           = case when p_patch ? 'category_id' then (p_patch->>'category_id')::uuid else category_id end,
    brand                 = case when p_patch ? 'brand' then p_patch->>'brand' else brand end,
    model_number          = case when p_patch ? 'model_number' then p_patch->>'model_number' else model_number end,
    short_description_he  = case when p_patch ? 'short_description_he' then p_patch->>'short_description_he' else short_description_he end,
    short_description_en  = case when p_patch ? 'short_description_en' then p_patch->>'short_description_en' else short_description_en end,
    description_he        = case when p_patch ? 'description_he' then p_patch->>'description_he' else description_he end,
    description_en        = case when p_patch ? 'description_en' then p_patch->>'description_en' else description_en end,
    tags                  = case when p_patch ? 'tags' then
                              case jsonb_typeof(p_patch->'tags')
                                when 'array' then coalesce(
                                  (select array_agg(v) from jsonb_array_elements_text(p_patch->'tags') as v),
                                  '{}'::text[])
                                else '{}'::text[]
                              end
                            else tags end,
    warranty_he           = case when p_patch ? 'warranty_he' then p_patch->>'warranty_he' else warranty_he end,
    warranty_en           = case when p_patch ? 'warranty_en' then p_patch->>'warranty_en' else warranty_en end,
    sort_order            = case when p_patch ? 'sort_order' then (p_patch->>'sort_order')::integer else sort_order end,
    out_of_stock_policy   = case when p_patch ? 'out_of_stock_policy' then p_patch->>'out_of_stock_policy' else out_of_stock_policy end,
    is_featured           = case when p_patch ? 'is_featured' then (p_patch->>'is_featured')::boolean else is_featured end,
    seo_title_he          = case when p_patch ? 'seo_title_he' then p_patch->>'seo_title_he' else seo_title_he end,
    seo_title_en          = case when p_patch ? 'seo_title_en' then p_patch->>'seo_title_en' else seo_title_en end,
    seo_description_he    = case when p_patch ? 'seo_description_he' then p_patch->>'seo_description_he' else seo_description_he end,
    seo_description_en    = case when p_patch ? 'seo_description_en' then p_patch->>'seo_description_en' else seo_description_en end,
    price                 = case when p_patch ? 'price' then (p_patch->>'price')::numeric(12,2) else price end,
    compare_at_price      = case when p_patch ? 'compare_at_price' then (p_patch->>'compare_at_price')::numeric(12,2) else compare_at_price end,
    sale_price            = case when p_patch ? 'sale_price' then (p_patch->>'sale_price')::numeric(12,2) else sale_price end,
    purchase_cost         = case when p_patch ? 'purchase_cost' then (p_patch->>'purchase_cost')::numeric(12,2) else purchase_cost end,
    image_url             = case when p_patch ? 'image_url' then p_patch->>'image_url' else image_url end,
    specifications        = case when p_patch ? 'specifications' then p_patch->'specifications' else specifications end,
    metadata              = case when p_patch ? 'metadata' then p_patch->'metadata' else metadata end,
    currency              = case when p_patch ? 'currency' then p_patch->>'currency' else currency end,
    recommended_price     = case when p_patch ? 'recommended_price' then (p_patch->>'recommended_price')::numeric(12,2) else recommended_price end,
    expected_restock_date = case when p_patch ? 'expected_restock_date' then (p_patch->>'expected_restock_date')::date else expected_restock_date end,
    tracking_mode         = case when p_patch ? 'tracking_mode' then p_patch->>'tracking_mode' else tracking_mode end,
    supplier_id           = case when p_patch ? 'supplier_id' then (p_patch->>'supplier_id')::uuid else supplier_id end,
    updated_at            = timezone('utc'::text, now())
  where id = p_id;

  select coalesce(array_agg(k), '{}') into v_changed
  from jsonb_object_keys(p_patch) k
  where k = any(v_whitelist);

  -- Status transition, only when a target was supplied and differs.
  if v_target is not null and v_target is distinct from v_previous_status then
    if v_target = 'active' then
      -- Validate the FINAL patched state with publish_product's exact rules.
      select * into v_product from public.products where id = p_id;

      if v_product.name_he is null or v_product.name_he = '' then
        raise exception 'Missing Hebrew name' using errcode = '22023';
      end if;
      if v_product.name_en is null or v_product.name_en = '' then
        raise exception 'Missing English name' using errcode = '22023';
      end if;
      if v_product.category_id is null then
        raise exception 'Missing category' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.categories c
        where c.id = v_product.category_id and c.is_active = true
      ) then
        raise exception 'Category is not active' using errcode = '22023';
      end if;

      select count(*) into v_variant_count
      from public.product_variants
      where product_id = p_id
        and is_active = true
        and length(sku) > 0
        and barcode is not null
        and length(barcode) > 0;

      if v_variant_count = 0 then
        raise exception 'Product must have at least one active variant with SKU and barcode'
          using errcode = '22023';
      end if;
    end if;

    update public.products
    set status = v_target,
        updated_at = timezone('utc'::text, now())
    where id = p_id;

    v_changed := v_changed || array['status']::text[];
  end if;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('product_updated', auth.uid(),
    jsonb_build_object(
      'product_id', p_id,
      'previous_status', v_previous_status,
      'target_status', coalesce(v_target, v_previous_status),
      'changed_fields', to_jsonb(v_changed)
    ),
    'product', p_id
  );

  select * into v_result from public.products where id = p_id;
  return v_result;
end;
$$;

revoke all on function public.update_product(uuid,jsonb) from public;
grant execute on function public.update_product(uuid,jsonb) to authenticated;

comment on function public.update_product is
'Transactional product edit. Admin/CEO only. Applies all whitelisted fields from the patch, rejects unknown keys (never silently discards), optionally transitions status (publish rules validated against the FINAL patched state), writes one audit row. Returns the updated row. Whitelist covers every editable products column (content, SEO, pricing, specifications/metadata, currency, restock, tracking, supplier); inventory_count/is_active/status are not user-editable fields.';

-- ============================================================
-- 2. update_variant — add reorder_point / reorder_qty
-- ============================================================
-- stock_qty is NOT editable here (ledger RPCs only); an unknown key —
-- including stock_qty — is rejected with 22023 instead of being ignored.
-- These are the last remaining editable variant columns; everything else on
-- product_variants was already whitelisted in 20260927210000.

create or replace function public.update_variant(
  p_id uuid,
  p_patch jsonb
) returns public.product_variants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant record;
  v_result public.product_variants;
  v_changed text[] := '{}';
  v_key text;
  v_whitelist constant text[] := array[
    'sku','barcode','color_he','color_en','color_hex',
    'price_override','cost_override','supplier_id','supplier_sku',
    'is_active','is_default','low_stock_threshold',
    'reorder_point','reorder_qty'
  ];
  v_numeric constant text[] := array[
    'price_override','cost_override','low_stock_threshold',
    'reorder_point','reorder_qty'
  ];
begin
  if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch must be a JSON object' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_whitelist)) then
      raise exception 'Field is not editable via update_variant: %', v_key
        using errcode = '22023';
    end if;
    if jsonb_typeof(p_patch->v_key) = 'null' and v_key in ('sku','is_active','is_default','low_stock_threshold') then
      raise exception 'Field must not be null: %', v_key using errcode = '22023';
    end if;
    if v_key = any(v_numeric)
       and jsonb_typeof(p_patch->v_key) not in ('number','null') then
      raise exception 'Field must be a number or null: %', v_key
        using errcode = '22023';
    end if;
    if v_key in ('is_active','is_default')
       and jsonb_typeof(p_patch->v_key) <> 'boolean' then
      raise exception 'Field must be a boolean: %', v_key using errcode = '22023';
    end if;
  end loop;

  -- Range rules matching the table checks (nice 22023 instead of 23514):
  -- reorder_qty > 0 when set (product_variants_reorder_qty check),
  -- reorder_point >= 0 when set (management UI contract).
  if jsonb_typeof(p_patch->'reorder_qty') = 'number'
     and (p_patch->>'reorder_qty')::numeric <= 0 then
    raise exception 'Reorder quantity must be greater than 0' using errcode = '22023';
  end if;
  if jsonb_typeof(p_patch->'reorder_point') = 'number'
     and (p_patch->>'reorder_point')::numeric < 0 then
    raise exception 'Reorder point must not be negative' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('variant:' || p_id::text));

  select * into v_variant
  from public.product_variants
  where id = p_id
  for update;

  if not found then
    raise exception 'Variant not found' using errcode = '22023';
  end if;

  -- A new default variant first clears the flag on siblings (partial unique
  -- index product_variants_default_uniq allows at most one per product).
  if coalesce((p_patch->>'is_default')::boolean, false) then
    update public.product_variants
    set is_default = false, updated_at = timezone('utc'::text, now())
    where product_id = v_variant.product_id
      and id <> p_id
      and is_default;
  end if;

  update public.product_variants set
    sku                = case when p_patch ? 'sku' then p_patch->>'sku' else sku end,
    barcode            = case when p_patch ? 'barcode' then p_patch->>'barcode' else barcode end,
    color_he           = case when p_patch ? 'color_he' then p_patch->>'color_he' else color_he end,
    color_en           = case when p_patch ? 'color_en' then p_patch->>'color_en' else color_en end,
    color_hex          = case when p_patch ? 'color_hex' then p_patch->>'color_hex' else color_hex end,
    price_override     = case when p_patch ? 'price_override' then (p_patch->>'price_override')::numeric(12,2) else price_override end,
    cost_override      = case when p_patch ? 'cost_override' then (p_patch->>'cost_override')::numeric(12,2) else cost_override end,
    supplier_id        = case when p_patch ? 'supplier_id' then (p_patch->>'supplier_id')::uuid else supplier_id end,
    supplier_sku       = case when p_patch ? 'supplier_sku' then p_patch->>'supplier_sku' else supplier_sku end,
    is_active          = case when p_patch ? 'is_active' then (p_patch->>'is_active')::boolean else is_active end,
    is_default         = case when p_patch ? 'is_default' then (p_patch->>'is_default')::boolean else is_default end,
    low_stock_threshold = case when p_patch ? 'low_stock_threshold' then (p_patch->>'low_stock_threshold')::integer else low_stock_threshold end,
    reorder_point      = case when p_patch ? 'reorder_point' then (p_patch->>'reorder_point')::integer else reorder_point end,
    reorder_qty        = case when p_patch ? 'reorder_qty' then (p_patch->>'reorder_qty')::integer else reorder_qty end,
    updated_at         = timezone('utc'::text, now())
  where id = p_id;

  select coalesce(array_agg(k), '{}') into v_changed
  from jsonb_object_keys(p_patch) k
  where k = any(v_whitelist);

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('variant_updated', auth.uid(),
    jsonb_build_object(
      'variant_id', p_id,
      'product_id', v_variant.product_id,
      'changed_fields', to_jsonb(v_changed)
    ),
    'product_variant', p_id
  );

  select * into v_result from public.product_variants where id = p_id;
  return v_result;
end;
$$;

revoke all on function public.update_variant(uuid,jsonb) from public;
grant execute on function public.update_variant(uuid,jsonb) to authenticated;

comment on function public.update_variant is
'Transactional variant metadata update. Admin/CEO only. stock_qty is never editable here; unknown keys rejected. Whitelist covers every editable variant column including reorder_point/reorder_qty. Setting is_default=true clears it on siblings. Last-sellable-variant removal auto-unpublishes the product (existing trigger).';
