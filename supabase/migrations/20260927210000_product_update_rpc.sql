-- Ticket DB-1: transactional product update RPC, write-RPCs for prices /
-- variants / images / categories, and the sell-price contract.
--
-- 1. public.update_product(p_id, p_patch) — fixes the launch-blocking
--    edit-save bug (API PATCH discarded every field after publish/unpublish).
--    One security-definer call: row lock, whitelisted field application,
--    optional status transition validated against the FINAL patched state
--    (same rules as publish_product), one audit row, full row returned.
--    Active products that stay active are additionally protected by the
--    existing products_guard_active_integrity trigger (same transaction).
-- 2. Transactional write RPCs replacing two-step service-client writes:
--    upsert_product_price, update_variant, upsert_product_image_meta,
--    manage_category (create/update/deactivate/reactivate). Category
--    deactivation keeps the categories_guard_deactivation cascade firing.
--    categories.parent_id already exists (20260925140000, self-FK
--    ON DELETE SET NULL); a BEFORE trigger now makes parent cycles
--    (A->B->C->A) impossible for RPC and direct writes alike.
-- 3. Price contract backstop: products.compare_at_price must exceed
--    sale_price when both are set. products.price, products.sale_price,
--    product_prices.price and product_variants.price_override already carry
--    "> 0 when not null" checks (20260925140000 / 20260927100000); costs
--    (purchase_cost, cost_override) may be 0. The new constraint is added
--    NOT VALID and validated only when existing rows are clean.

-- ============================================================
-- 1. update_product
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
  v_whitelist constant text[] := array[
    'name_he','name_en','slug','category_id','brand','model_number',
    'short_description_he','short_description_en','description_he','description_en',
    'tags','warranty_he','warranty_en','sort_order','out_of_stock_policy',
    'is_featured','seo_title_he','seo_title_en','seo_description_he',
    'seo_description_en','price','compare_at_price','sale_price','purchase_cost'
  ];
  v_not_null constant text[] := array[
    'name_he','name_en','slug','sort_order','out_of_stock_policy','is_featured','tags'
  ];
  v_numeric constant text[] := array[
    'price','compare_at_price','sale_price','purchase_cost'
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
'Transactional product edit. Admin/CEO only. Applies all whitelisted fields from the patch, rejects unknown keys (never silently discards), optionally transitions status (publish rules validated against the FINAL patched state), writes one audit row. Returns the updated row.';

-- ============================================================
-- 2a. upsert_product_price: one-row role price write
-- ============================================================

create or replace function public.upsert_product_price(
  p_product_id uuid,
  p_role text,
  p_price numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('customer','worker','admin','ceo') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_product_id::text || ':' || p_role));

  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product not found' using errcode = '22023';
  end if;

  if p_price is null then
    -- NULL means "not published for this role" (product_prices convention).
    delete from public.product_prices
    where product_id = p_product_id and role = p_role;

    insert into public.audit_events (action, user_id, details, entity_type, entity_id)
    values ('product_price_removed', auth.uid(),
      jsonb_build_object('product_id', p_product_id, 'role', p_role),
      'product', p_product_id
    );
    return;
  end if;

  if p_price <= 0 then
    raise exception 'Price must be positive' using errcode = '22023';
  end if;

  insert into public.product_prices (product_id, role, price)
  values (p_product_id, p_role, p_price)
  on conflict (product_id, role) do update set price = excluded.price;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('product_price_set', auth.uid(),
    jsonb_build_object('product_id', p_product_id, 'role', p_role, 'price', p_price),
    'product', p_product_id
  );
end;
$$;

revoke all on function public.upsert_product_price(uuid,text,numeric) from public;
grant execute on function public.upsert_product_price(uuid,text,numeric) to authenticated;

comment on function public.upsert_product_price is
'Set/replace one role price for a product (NULL price deletes the row = not published). Admin/CEO only. Atomic with audit.';

-- ============================================================
-- 2b. update_variant: transactional variant metadata update
-- ============================================================
-- stock_qty is NOT editable here (ledger RPCs only); an unknown key —
-- including stock_qty — is rejected with 22023 instead of being ignored.

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
    'is_active','is_default','low_stock_threshold'
  ];
  v_numeric constant text[] := array[
    'price_override','cost_override','low_stock_threshold'
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
'Transactional variant metadata update. Admin/CEO only. stock_qty is never editable here; unknown keys rejected. Setting is_default=true clears it on siblings. Last-sellable-variant removal auto-unpublishes the product (existing trigger).';

-- ============================================================
-- 2c. upsert_product_image_meta: alt text / order / primary
-- ============================================================
-- Primary image convention (20260927230000): the product's image with the
-- LOWEST sort_order. is_primary=true moves this image just below the current
-- minimum; is_primary is otherwise not a stored column.

create or replace function public.upsert_product_image_meta(
  p_id uuid,
  p_patch jsonb
) returns public.product_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_image record;
  v_result public.product_images;
  v_changed text[] := '{}';
  v_key text;
  v_min_order integer;
  v_whitelist constant text[] := array[
    'alt_he','alt_en','sort_order','is_primary'
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
      raise exception 'Field is not editable via upsert_product_image_meta: %', v_key
        using errcode = '22023';
    end if;
    if v_key = 'sort_order'
       and jsonb_typeof(p_patch->v_key) not in ('number','null') then
      raise exception 'Field must be a number or null: sort_order' using errcode = '22023';
    end if;
    if v_key = 'is_primary' and jsonb_typeof(p_patch->v_key) <> 'boolean' then
      raise exception 'Field must be a boolean: is_primary' using errcode = '22023';
    end if;
  end loop;

  select * into v_image
  from public.product_images
  where id = p_id
  for update;

  if not found then
    raise exception 'Image not found' using errcode = '22023';
  end if;

  update public.product_images set
    alt_he     = case when p_patch ? 'alt_he' then p_patch->>'alt_he' else alt_he end,
    alt_en     = case when p_patch ? 'alt_en' then p_patch->>'alt_en' else alt_en end,
    sort_order = case
                   when p_patch ? 'sort_order' then coalesce((p_patch->>'sort_order')::integer, 0)
                   else sort_order
                 end
  where id = p_id;

  -- Explicit primary request wins over any sort_order supplied above.
  if coalesce((p_patch->>'is_primary')::boolean, false) then
    select min(sort_order) into v_min_order
    from public.product_images
    where product_id = v_image.product_id
      and id <> p_id;

    update public.product_images
    set sort_order = coalesce(v_min_order - 1, 0)
    where id = p_id;
  end if;

  select coalesce(array_agg(k), '{}') into v_changed
  from jsonb_object_keys(p_patch) k
  where k = any(v_whitelist);

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('product_image_updated', auth.uid(),
    jsonb_build_object(
      'image_id', p_id,
      'product_id', v_image.product_id,
      'changed_fields', to_jsonb(v_changed)
    ),
    'product', v_image.product_id
  );

  select * into v_result from public.product_images where id = p_id;
  return v_result;
end;
$$;

revoke all on function public.upsert_product_image_meta(uuid,jsonb) from public;
grant execute on function public.upsert_product_image_meta(uuid,jsonb) to authenticated;

comment on function public.upsert_product_image_meta is
'Edit product image metadata (alt texts, sort_order, is_primary). Admin/CEO only. Primary = lowest sort_order per the canonical media convention; is_primary=true moves this image below the current minimum.';

-- ============================================================
-- 2d. categories: parent cycle guard + manage_category RPC
-- ============================================================

create or replace function public.categories_prevent_parent_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancestor uuid;
  v_depth integer := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  -- Walk up the ancestor chain; hitting our own id means a cycle.
  -- Depth cap protects against a pathological pre-existing chain.
  v_ancestor := new.parent_id;
  while v_ancestor is not null loop
    if v_ancestor = new.id then
      raise exception 'Category parent cycle detected' using errcode = '22023';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 100 then
      raise exception 'Category ancestry too deep (possible pre-existing cycle)'
        using errcode = '22023';
    end if;
    select parent_id into v_ancestor
    from public.categories
    where id = v_ancestor;
  end loop;

  return new;
end;
$$;

drop trigger if exists categories_prevent_parent_cycle_trg on public.categories;
create trigger categories_prevent_parent_cycle_trg
  before insert or update of parent_id on public.categories
  for each row execute function public.categories_prevent_parent_cycle();

create or replace function public.manage_category(
  p_action text,
  p_category_id uuid default null,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category record;
  v_result_id uuid;
  v_changed text[] := '{}';
  v_key text;
  v_parent uuid;
  v_whitelist constant text[] := array[
    'slug','name_he','name_en','description_he','description_en',
    'sort_order','image_url','parent_id'
  ];
begin
  if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('create','update','deactivate','reactivate') then
    raise exception 'Invalid action' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload must be a JSON object' using errcode = '22023';
  end if;

  if p_action = 'create' then
    for v_key in select jsonb_object_keys(p_payload) loop
      if not (v_key = any(v_whitelist)) then
        raise exception 'Field is not editable via manage_category: %', v_key
          using errcode = '22023';
      end if;
    end loop;

    if nullif(btrim(coalesce(p_payload->>'slug', '')), '') is null
       or nullif(btrim(coalesce(p_payload->>'name_he', '')), '') is null
       or nullif(btrim(coalesce(p_payload->>'name_en', '')), '') is null then
      raise exception 'Slug and HE/EN names are required' using errcode = '22023';
    end if;

    v_parent := nullif(p_payload->>'parent_id', '')::uuid;
    if v_parent is not null and not exists (
      select 1 from public.categories c where c.id = v_parent
    ) then
      raise exception 'Parent category not found' using errcode = '22023';
    end if;

    insert into public.categories (
      slug, name_he, name_en, description_he, description_en,
      sort_order, image_url, parent_id, is_active
    ) values (
      p_payload->>'slug',
      p_payload->>'name_he',
      p_payload->>'name_en',
      p_payload->>'description_he',
      p_payload->>'description_en',
      coalesce((p_payload->>'sort_order')::integer, 0),
      p_payload->>'image_url',
      v_parent,
      true
    ) returning id into v_result_id;

    insert into public.audit_events (action, user_id, details, entity_type, entity_id)
    values ('category_created', auth.uid(),
      jsonb_build_object(
        'category_id', v_result_id,
        'slug', p_payload->>'slug',
        'parent_id', v_parent
      ),
      'category', v_result_id
    );

    return v_result_id;
  end if;

  -- update / deactivate / reactivate need an existing, locked row
  if p_category_id is null then
    raise exception 'Category id is required' using errcode = '22023';
  end if;

  select * into v_category
  from public.categories
  where id = p_category_id
  for update;

  if not found then
    raise exception 'Category not found' using errcode = '22023';
  end if;

  if p_action = 'deactivate' then
    -- categories_guard_deactivation_trg cascades active products to hidden
    -- (one audit row per product) in this same transaction.
    update public.categories
    set is_active = false,
        updated_at = timezone('utc'::text, now())
    where id = p_category_id;

    insert into public.audit_events (action, user_id, details, entity_type, entity_id)
    values ('category_deactivated', auth.uid(),
      jsonb_build_object('category_id', p_category_id, 'slug', v_category.slug),
      'category', p_category_id
    );

    return p_category_id;
  end if;

  if p_action = 'reactivate' then
    update public.categories
    set is_active = true,
        updated_at = timezone('utc'::text, now())
    where id = p_category_id;

    insert into public.audit_events (action, user_id, details, entity_type, entity_id)
    values ('category_reactivated', auth.uid(),
      jsonb_build_object('category_id', p_category_id, 'slug', v_category.slug),
      'category', p_category_id
    );

    return p_category_id;
  end if;

  -- p_action = 'update'
  for v_key in select jsonb_object_keys(p_payload) loop
    if not (v_key = any(v_whitelist)) then
      raise exception 'Field is not editable via manage_category: %', v_key
        using errcode = '22023';
    end if;
  end loop;

  if (p_payload ? 'name_he' and nullif(btrim(coalesce(p_payload->>'name_he', '')), '') is null)
     or (p_payload ? 'name_en' and nullif(btrim(coalesce(p_payload->>'name_en', '')), '') is null)
     or (p_payload ? 'slug' and nullif(btrim(coalesce(p_payload->>'slug', '')), '') is null) then
    raise exception 'Slug and HE/EN names must not be empty' using errcode = '22023';
  end if;

  if p_payload ? 'parent_id' then
    v_parent := nullif(p_payload->>'parent_id', '')::uuid;
    if v_parent is not null and not exists (
      select 1 from public.categories c where c.id = v_parent
    ) then
      raise exception 'Parent category not found' using errcode = '22023';
    end if;
    -- Cycle check itself is enforced by categories_prevent_parent_cycle_trg.
  end if;

  update public.categories set
    slug           = case when p_payload ? 'slug' then p_payload->>'slug' else slug end,
    name_he        = case when p_payload ? 'name_he' then p_payload->>'name_he' else name_he end,
    name_en        = case when p_payload ? 'name_en' then p_payload->>'name_en' else name_en end,
    description_he = case when p_payload ? 'description_he' then p_payload->>'description_he' else description_he end,
    description_en = case when p_payload ? 'description_en' then p_payload->>'description_en' else description_en end,
    sort_order     = case when p_payload ? 'sort_order' then (p_payload->>'sort_order')::integer else sort_order end,
    image_url      = case when p_payload ? 'image_url' then p_payload->>'image_url' else image_url end,
    parent_id      = case when p_payload ? 'parent_id' then nullif(p_payload->>'parent_id', '')::uuid else parent_id end,
    updated_at     = timezone('utc'::text, now())
  where id = p_category_id;

  select coalesce(array_agg(k), '{}') into v_changed
  from jsonb_object_keys(p_payload) k
  where k = any(v_whitelist);

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('category_updated', auth.uid(),
    jsonb_build_object(
      'category_id', p_category_id,
      'slug', v_category.slug,
      'changed_fields', to_jsonb(v_changed)
    ),
    'category', p_category_id
  );

  return p_category_id;
end;
$$;

revoke all on function public.manage_category(text,uuid,jsonb) from public;
grant execute on function public.manage_category(text,uuid,jsonb) to authenticated;

comment on function public.manage_category is
'Create/update/deactivate/reactivate a category in one transaction. Admin/CEO only. Deactivation cascades active products to hidden via the existing trigger. Parent cycles are rejected by categories_prevent_parent_cycle_trg.';

-- ============================================================
-- 3. Price contract: compare_at_price must exceed sale_price
-- ============================================================
-- Already enforced elsewhere (20260925140000 / 20260927100000):
--   products.price                 NULL or > 0
--   products.compare_at_price      NULL or > 0
--   products.sale_price            NULL or > 0
--   product_prices.price           > 0 (NOT NULL)
--   product_variants.price_override NULL or > 0
--   purchase_cost / cost_override  NULL or >= 0 (costs may be 0)
-- The only missing rule is compare_at_price > sale_price. Existing rows are
-- audited first: the constraint goes in NOT VALID (still enforced for all new
-- writes) and is VALIDATEd only when no live row violates it.

do $$
declare
  v_bad bigint;
begin
  select count(*) into v_bad
  from public.products
  where compare_at_price is not null
    and sale_price is not null
    and compare_at_price <= sale_price;

  if v_bad > 0 then
    raise notice 'products_compare_at_gt_sale: % existing row(s) violate compare_at_price > sale_price; constraint added NOT VALID and left unvalidated (fix data, then validate)', v_bad;
  end if;
end $$;

alter table public.products
  drop constraint if exists products_compare_at_gt_sale;

alter table public.products
  add constraint products_compare_at_gt_sale
  check (compare_at_price is null or sale_price is null or compare_at_price > sale_price)
  not valid;

do $$
begin
  if not exists (
    select 1 from public.products
    where compare_at_price is not null
      and sale_price is not null
      and compare_at_price <= sale_price
  ) then
    alter table public.products validate constraint products_compare_at_gt_sale;
  end if;
end $$;

comment on constraint products_compare_at_gt_sale on public.products is
'Sell-price contract: when both are set, the compare-at (strikethrough) price must exceed the sale price.';
