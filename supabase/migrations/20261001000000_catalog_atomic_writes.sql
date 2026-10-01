-- Catalog writes and audit events succeed or fail in the same transaction.
-- Existing stock is documented as an unattributed opening snapshot; it is
-- never represented as a movement made by a fictional employee.

create table if not exists public.stock_opening_balances (
  variant_id uuid primary key references public.product_variants(id) on delete restrict,
  quantity integer not null,
  source text not null default 'legacy_import' check (source = 'legacy_import'),
  captured_at timestamptz not null default now()
);

insert into public.stock_opening_balances (variant_id, quantity)
select v.id, v.stock_qty
from public.product_variants v
where not exists (
  select 1 from public.stock_movements m where m.variant_id = v.id
)
on conflict (variant_id) do nothing;

alter table public.stock_opening_balances enable row level security;
drop policy if exists "Management reads opening balances" on public.stock_opening_balances;
create policy "Management reads opening balances" on public.stock_opening_balances
  for select to authenticated
  using (public.active_app_role() in ('admin', 'ceo'));
grant select on public.stock_opening_balances to authenticated;
grant all on public.stock_opening_balances to service_role;

create or replace function public.create_catalog_product(
  p_slug text,
  p_name_he text,
  p_name_en text,
  p_category_id uuid default null
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
  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id
  ) then
    raise exception 'Category not found' using errcode = '22023';
  end if;

  insert into public.products (slug, name_he, name_en, category_id, status)
  values (p_slug, trim(p_name_he), trim(p_name_en), p_category_id, 'draft')
  returning * into v_product;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('product_created', auth.uid(),
    jsonb_build_object('product_id', v_product.id, 'slug', v_product.slug,
                       'status', v_product.status),
    'product', v_product.id);
  return v_product;
end;
$$;
revoke all on function public.create_catalog_product(text,text,text,uuid) from public;
grant execute on function public.create_catalog_product(text,text,text,uuid) to authenticated;

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
    coalesce((p_data->>'low_stock_threshold')::integer, 0),
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
revoke all on function public.create_catalog_variant(jsonb) from public;
grant execute on function public.create_catalog_variant(jsonb) to authenticated;

-- Removal retains the row and its movement history. update_variant already
-- writes the actor audit event and triggers product unpublishing atomically.
comment on function public.create_catalog_variant(jsonb) is
  'Creates a variant, updates the default flag and records the actor atomically. Stock starts at zero and changes only through the ledger.';

-- RLS restricts rows, not columns. The public catalog must not expose cost,
-- supplier terms, legacy counters or internal metadata through PostgREST.
revoke select on public.products from anon, authenticated;
grant select (
  id, slug, category_id, name_he, name_en, short_description_he,
  short_description_en, description_he, description_en, price,
  compare_at_price, sale_price, image_url, is_active, is_featured,
  brand, model_number, tags, specifications, warranty_he, warranty_en,
  seo_title_he, seo_title_en, seo_description_he, seo_description_en,
  sort_order, currency, out_of_stock_policy, expected_restock_date,
  tracking_mode, status, created_at, updated_at
) on public.products to anon, authenticated;

revoke select on public.product_variants from anon, authenticated;
grant select (
  id, product_id, sku, barcode, color_he, color_en, color_hex,
  price_override, is_default, is_active, stock_qty, low_stock_threshold,
  created_at, updated_at
) on public.product_variants to anon, authenticated;
