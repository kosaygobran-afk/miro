-- Existing categories remain external categories. Internal categories are
-- optional, belong to exactly one external category and never nest further.
-- No existing catalog, stock, prices or ownership assignments are rewritten.
alter table public.products
  add column if not exists subcategory_id uuid
    references public.categories(id) on delete restrict;

create index if not exists products_subcategory_id_idx
  on public.products(subcategory_id) where subcategory_id is not null;
create index if not exists categories_parent_id_idx
  on public.categories(parent_id) where parent_id is not null;
grant select (subcategory_id) on public.products to anon, authenticated;

comment on column public.products.category_id is
  'Required external/root category for new products. Existing unassigned draft history is retained until explicitly classified.';
comment on column public.products.subcategory_id is
  'Optional internal category whose parent_id must equal the product external category_id.';

-- Reject incompatible legacy hierarchy instead of silently moving products.
do $$ begin
  if exists (
    select 1 from public.categories child
    join public.categories parent on parent.id = child.parent_id
    where parent.parent_id is not null
  ) or exists (
    select 1 from public.products p
    join public.categories c on c.id = p.category_id
    where c.parent_id is not null
  ) then
    raise exception 'Review existing category hierarchy before installing two-level categories'
      using errcode = '22023';
  end if;
end $$;

create or replace function public.categories_guard_two_levels()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_parent public.categories;
begin
  if TG_OP = 'DELETE' then
    if exists (select 1 from public.categories where parent_id = old.id)
       or exists (select 1 from public.products where category_id = old.id or subcategory_id = old.id) then
      raise exception 'Category is in use; reassign products and internal categories before deleting it'
        using errcode = '22023';
    end if;
    return old;
  end if;

  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Category cannot be its own parent' using errcode = '22023';
    end if;
    -- Share locks serialize child creation/assignment with parent changes.
    select * into v_parent from public.categories where id = new.parent_id for share;
    if not found then
      raise exception 'Parent category not found' using errcode = '22023';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'Internal categories must belong directly to an external category'
        using errcode = '22023';
    end if;
  end if;

  if TG_OP = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    if exists (select 1 from public.categories where parent_id = old.id)
       or exists (select 1 from public.products where category_id = old.id or subcategory_id = old.id) then
      raise exception 'Category is in use; reassign products and internal categories before changing its parent'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists categories_guard_two_levels_trg on public.categories;
create trigger categories_guard_two_levels_trg
  before insert or update of parent_id or delete on public.categories
  for each row execute function public.categories_guard_two_levels();

create or replace function public.products_guard_category_hierarchy()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_root public.categories;
  v_child public.categories;
  v_assignment_changed boolean;
begin
  v_assignment_changed := TG_OP = 'INSERT';
  if TG_OP = 'UPDATE' then
    v_assignment_changed := new.category_id is distinct from old.category_id
      or new.subcategory_id is distinct from old.subcategory_id;
  end if;

  -- Legacy unclassified drafts can still receive unrelated content edits.
  if not v_assignment_changed and new.status <> 'active' then
    return new;
  end if;
  if new.category_id is null then
    raise exception 'External category is required' using errcode = '22023';
  end if;

  perform id from public.categories
    where id in (new.category_id, new.subcategory_id) order by id for share;
  select * into v_root from public.categories where id = new.category_id;
  if not found or v_root.parent_id is not null then
    raise exception 'Product category must be an external category' using errcode = '22023';
  end if;
  if new.status = 'active' and not v_root.is_active then
    raise exception 'Category is not active' using errcode = '22023';
  end if;

  if new.subcategory_id is not null then
    select * into v_child from public.categories where id = new.subcategory_id;
    if not found or v_child.parent_id is distinct from new.category_id then
      raise exception 'Internal category must belong to the selected external category'
        using errcode = '22023';
    end if;
    if new.status = 'active' and not v_child.is_active then
      raise exception 'Internal category is not active' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists products_guard_category_hierarchy_trg on public.products;
create trigger products_guard_category_hierarchy_trg
  before insert or update on public.products
  for each row execute function public.products_guard_category_hierarchy();

-- Preserve the existing truthful auto-unpublish behavior for either level.
create or replace function public.categories_guard_deactivation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.is_active and not new.is_active then
    insert into public.audit_events (action, user_id, details, entity_type, entity_id)
    select 'product_auto_unpublished', auth.uid(),
      jsonb_build_object('product_id', p.id, 'category_id', new.id,
                        'reason', 'category_deactivated'), 'product', p.id
    from public.products p
    where (p.category_id = new.id or p.subcategory_id = new.id) and p.status = 'active';

    update public.products
    set status = 'hidden', updated_at = timezone('utc'::text, now())
    where (category_id = new.id or subcategory_id = new.id) and status = 'active';
  end if;
  return new;
end;
$$;

-- Replace the four-argument RPC with a compatible optional fifth argument.
-- Omitting an external category now fails at every write entry point.
drop function public.create_catalog_product(text,text,text,uuid);
create function public.create_catalog_product(
  p_slug text,
  p_name_he text,
  p_name_en text,
  p_category_id uuid default null,
  p_subcategory_id uuid default null
) returns public.products
language plpgsql security definer set search_path = ''
as $$
declare v_product public.products;
begin
  if public.active_app_role() is null or public.active_app_role() not in ('admin', 'ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or length(p_slug) > 100
     or nullif(trim(p_name_he), '') is null
     or nullif(trim(p_name_en), '') is null
     or length(p_name_he) > 255 or length(p_name_en) > 255 then
    raise exception 'Invalid product details' using errcode = '22023';
  end if;
  if p_category_id is null then
    raise exception 'External category is required' using errcode = '22023';
  end if;

  insert into public.products (slug, name_he, name_en, category_id, subcategory_id, status)
  values (p_slug, trim(p_name_he), trim(p_name_en), p_category_id, p_subcategory_id, 'draft')
  returning * into v_product;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('product_created', auth.uid(),
    jsonb_build_object('product_id', v_product.id, 'slug', v_product.slug,
                      'category_id', v_product.category_id,
                      'subcategory_id', v_product.subcategory_id, 'status', v_product.status),
    'product', v_product.id);
  return v_product;
end;
$$;
revoke all on function public.create_catalog_product(text,text,text,uuid,uuid) from public;
grant execute on function public.create_catalog_product(text,text,text,uuid,uuid) to authenticated;

-- Keep the existing transactional edit whitelist, publish checks and audit.
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
    'name_he','name_en','slug','category_id','subcategory_id','brand','model_number',
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

  -- A root change resets the optional child unless the caller explicitly
  -- supplies its replacement. The final pair is validated by the DB trigger.
  if p_patch ? 'category_id'
     and (p_patch->>'category_id')::uuid is distinct from v_product.category_id
     and not (p_patch ? 'subcategory_id') then
    p_patch := p_patch || jsonb_build_object('subcategory_id', null);
  end if;
  if p_patch ? 'category_id' and p_patch->>'category_id' is null then
    raise exception 'External category is required' using errcode = '22023';
  end if;

  -- Apply every whitelisted content field in one statement. The
  -- products_guard_active_integrity trigger fires here when the product is
  -- (and stays) active, so an active product can never be saved incomplete.
  update public.products set
    name_he               = case when p_patch ? 'name_he' then p_patch->>'name_he' else name_he end,
    name_en               = case when p_patch ? 'name_en' then p_patch->>'name_en' else name_en end,
    slug                  = case when p_patch ? 'slug' then p_patch->>'slug' else slug end,
    category_id           = case when p_patch ? 'category_id' then (p_patch->>'category_id')::uuid else category_id end,
    subcategory_id        = case when p_patch ? 'subcategory_id' then (p_patch->>'subcategory_id')::uuid else subcategory_id end,
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
'Transactional product edit. Admin/CEO only. Applies all whitelisted fields from the patch, rejects unknown keys (never silently discards), optionally transitions status (publish rules validated against the FINAL patched state), writes one audit row. Returns the updated row. Whitelist covers every editable products column (content, SEO, pricing, specifications/metadata, currency, restock, tracking, supplier, optional internal category); inventory_count/is_active/status are not user-editable fields.';
