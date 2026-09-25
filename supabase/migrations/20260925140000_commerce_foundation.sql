-- Commerce / Inventory / Analytics Foundation
-- Design decisions:
-- 1. product_variants is the canonical sellable / inventory entity. products holds catalog metadata.
-- 2. price NULL means "not published" (was 0). Applications treat NULL as "contact for price".
-- 3. out_of_stock_policy controls public visibility at application layer; DB enforces status + stock ledger.
-- 4. All stock changes go through stock_movements ledger (append-only). Direct writes to variants.stock_qty forbidden.
-- 5. Sales snapshots: unit_cost, vat_rate, discount_amount, net_amount on order_items for immutable records.
-- 6. VAT 18% seeded as management estimate; editable via CEO-only RPC. current_tax_rate() exposes active rate.
-- 7. Three theme modes (dark/medium/light) handled in frontend; DB stores business settings in business_settings.

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PRODUCTS TABLE EXTENSIONS
-- ============================================================

-- Make price nullable; 0 was never a valid published price. NULL = "price not published".
alter table public.products
  alter column price drop not null,
  alter column price drop default;

alter table public.products
  add constraint products_price_positive check (price is null or price > 0);

-- Backfill: existing 0 prices become NULL (unpublished)
update public.products set price = null where price = 0;

-- compare_at_price: allow null or positive
alter table public.products
  add constraint products_compare_at_price_positive check (compare_at_price is null or compare_at_price > 0);

-- sale_price: optional promotional price
alter table public.products
  add column if not exists sale_price numeric(12,2);

alter table public.products
  add constraint products_sale_price_positive check (sale_price is null or sale_price > 0);

-- Status replaces is_active for visibility logic (is_active kept for legacy code compatibility)
alter table public.products
  add column if not exists status text not null default 'draft'
    check (status in ('draft','active','hidden','archived'));

-- Backfill status from is_active
update public.products
set status = case when is_active then 'active' else 'draft' end
where status = 'draft';

-- New catalog columns
alter table public.products
  add column if not exists brand text,
  add column if not exists model_number text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists specifications jsonb not null default '{}'::jsonb,
  add column if not exists warranty_he text,
  add column if not exists warranty_en text,
  add column if not exists seo_title_he text,
  add column if not exists seo_title_en text,
  add column if not exists seo_description_he text,
  add column if not exists seo_description_en text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists currency text not null default 'ILS',
  add column if not exists purchase_cost numeric(12,2),
  add column if not exists recommended_price numeric(12,2),
  add column if not exists out_of_stock_policy text not null default 'inherit'
    check (out_of_stock_policy in ('inherit','keep_visible_contact','keep_visible_restock','hide_from_public')),
  add column if not exists expected_restock_date date,
  add column if not exists tracking_mode text not null default 'none'
    check (tracking_mode in ('none','serial','lot')),
  add column if not exists supplier_id uuid;

-- Constraints on new price-related columns
alter table public.products
  add constraint products_purchase_cost_nonneg check (purchase_cost is null or purchase_cost >= 0),
  add constraint products_recommended_price_positive check (recommended_price is null or recommended_price > 0);

-- Trigger to keep is_active in sync with status
create or replace function public.products_sync_is_active()
returns trigger language plpgsql as $$
begin
  new.is_active := (new.status = 'active');
  return new;
end;
$$;

drop trigger if exists products_sync_is_active_trigger on public.products;
create trigger products_sync_is_active_trigger
  before insert or update of status on public.products
  for each row execute procedure public.products_sync_is_active();

-- Rewrite public SELECT policy to use status = 'active'
drop policy if exists "Public can view active products" on public.products;
drop policy if exists "Public product catalog is readable" on public.products;
create policy "Public can view active products" on public.products
  for select using (status = 'active');

-- Ensure anon has SELECT on products (for public catalog)
grant select on public.products to anon;

-- Index for status filtering
create index if not exists idx_products_status on public.products(status);
create index if not exists idx_products_tracking_mode on public.products(tracking_mode);
create index if not exists idx_products_supplier_id on public.products(supplier_id);

-- ============================================================
-- 2. SUPPLIERS TABLE
-- ============================================================

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text,
  phone text,
  email text,
  notes text,
  default_lead_time_days integer check (default_lead_time_days is null or default_lead_time_days >= 0),
  currency text not null default 'ILS',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create trigger set_suppliers_updated_at
  before update on public.suppliers
  for each row execute procedure public.update_updated_at_column();

alter table public.suppliers enable row level security;

-- Admin/CEO can read suppliers
drop policy if exists "Management reads suppliers" on public.suppliers;
create policy "Management reads suppliers" on public.suppliers
  for select to authenticated
  using (public.active_app_role() in ('admin','ceo'));

-- No direct writes for authenticated; service_role manages via API
grant select on public.suppliers to authenticated;
grant all on public.suppliers to service_role;

-- Add FK from products to suppliers (after suppliers exists)
alter table public.products
  add constraint products_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id) on delete set null
  not valid;

alter table public.products validate constraint products_supplier_id_fkey;

-- ============================================================
-- 3. PRODUCT_VARIANTS TABLE (canonical sellable / inventory entity)
-- ============================================================

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null,
  barcode text,
  color_he text,
  color_en text,
  color_hex text,
  price_override numeric(12,2),
  cost_override numeric(12,2),
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_sku text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  stock_qty integer not null default 0,
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  reorder_point integer,
  reorder_qty integer check (reorder_qty is null or reorder_qty > 0),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint product_variants_sku_unique unique (sku),
  constraint product_variants_barcode_unique unique (barcode),
  constraint product_variants_sku_nonempty check (length(sku) > 0),
  constraint product_variants_barcode_nonempty check (barcode is null or length(barcode) > 0),
  constraint product_variants_price_override_positive check (price_override is null or price_override > 0),
  constraint product_variants_cost_override_nonneg check (cost_override is null or cost_override >= 0),
  constraint product_variants_color_hex_format check (color_hex is null or color_hex ~ '^#[0-9a-fA-F]{6}$')
);

-- stock_qty can go negative for correction types (manual_adjustment, stocktake_correction, etc.)
-- Enforced by record_stock_movement RPC, not by table constraint.

-- Only one default variant per product
create unique index if not exists product_variants_default_uniq
  on public.product_variants(product_id) where is_default;

-- Updated_at trigger
create trigger set_product_variants_updated_at
  before update on public.product_variants
  for each row execute procedure public.update_updated_at_column();

-- Indexes
create index if not exists idx_product_variants_product_id on public.product_variants(product_id);
create index if not exists idx_product_variants_is_active on public.product_variants(is_active);
create index if not exists idx_product_variants_supplier_id on public.product_variants(supplier_id);
create index if not exists idx_product_variants_stock_qty on public.product_variants(stock_qty);

-- Backfill: create a default variant for each existing product
insert into public.product_variants (product_id, sku, barcode, is_default, is_active, stock_qty)
select
  p.id,
  'SKU-' || upper(substr(p.id::text, 1, 8)),
  'BC-' || upper(substr(p.id::text, 1, 8)) || '-D',
  true,
  true,
  p.inventory_count
from public.products p
on conflict (sku) do nothing;

-- RLS: public can read variants of active products where variant is active
alter table public.product_variants enable row level security;

drop policy if exists "Public can view active variants" on public.product_variants;
create policy "Public can view active variants" on public.product_variants
  for select using (
    is_active = true
    and exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
      and p.status = 'active'
    )
  );

-- No direct writes for authenticated; service_role / RPC only
grant select on public.product_variants to anon, authenticated;
grant all on public.product_variants to service_role;

-- ============================================================
-- 4. STOCK_MOVEMENTS LEDGER (append-only)
-- ============================================================

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  delta integer not null check (delta <> 0),
  previous_qty integer not null,
  resulting_qty integer not null,
  type text not null
    check (type in (
      'purchase_receipt','sale','customer_return','supplier_return',
      'manual_adjustment','damage','loss','stocktake_correction',
      'transfer_in','transfer_out','reservation','reservation_release'
    )),
  reference text,
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_stock_movements_variant_created
  on public.stock_movements(variant_id, created_at);
create index if not exists idx_stock_movements_type_created
  on public.stock_movements(type, created_at);

alter table public.stock_movements enable row level security;

-- Admin/CEO only can read stock movements
drop policy if exists "Management reads stock movements" on public.stock_movements;
create policy "Management reads stock movements" on public.stock_movements
  for select to authenticated
  using (public.active_app_role() in ('admin','ceo'));

-- No direct inserts/updates/deletes for authenticated; RPC only
grant select on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;

-- ============================================================
-- 5. RPC FUNCTIONS FOR STOCK & SALES
-- ============================================================

-- record_stock_movement: core ledger entry with validation
create or replace function public.record_stock_movement(
  p_variant_id uuid,
  p_delta integer,
  p_type text,
  p_reference text default null,
  p_note text default null,
  p_unit_cost numeric default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_current_qty integer;
  v_new_qty integer;
  v_movement_id uuid;
  v_allowed_negative_types text[] := array[
    'manual_adjustment','stocktake_correction','damage','loss',
    'reservation_release','customer_return'
  ];
  v_type_allows_negative boolean;
begin
  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Validate type
  if p_type not in (
    'purchase_receipt','sale','customer_return','supplier_return',
    'manual_adjustment','damage','loss','stocktake_correction',
    'transfer_in','transfer_out','reservation','reservation_release'
  ) then
    raise exception 'Invalid movement type' using errcode = '22023';
  end if;

  -- Prevent zero delta (check constraint also catches this)
  if p_delta = 0 then
    raise exception 'Delta must not be zero' using errcode = '22023';
  end if;

  -- Serialize per variant
  perform pg_advisory_xact_lock(hashtext(p_variant_id::text));

  -- Lock variant row and get current stock
  select stock_qty into v_current_qty
  from public.product_variants
  where id = p_variant_id
  for update;

  if not found then
    raise exception 'Variant not found' using errcode = '22023';
  end if;

  v_new_qty := v_current_qty + p_delta;

  -- Types that may NOT go negative (sale, damage, loss, supplier_return, transfer_out, reservation, stocktake_correction with negative delta)
  v_type_allows_negative := p_type = any(v_allowed_negative_types);

  -- For stocktake_correction: it's in allowed_negative, but if delta is negative we allow it
  -- Actually stocktake_correction is in allowed list, so negative is fine

  if not v_type_allows_negative and v_new_qty < 0 then
    raise exception 'Insufficient stock' using errcode = '22023';
  end if;

  -- Update variant stock
  update public.product_variants
  set stock_qty = v_new_qty, updated_at = timezone('utc'::text, now())
  where id = p_variant_id;

  -- Insert movement record
  insert into public.stock_movements (
    variant_id, delta, previous_qty, resulting_qty, type, reference, unit_cost, note, actor_id
  ) values (
    p_variant_id, p_delta, v_current_qty, v_new_qty, p_type, p_reference, p_unit_cost, p_note, auth.uid()
  ) returning id into v_movement_id;

  -- Audit event
  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('stock_movement', auth.uid(),
    jsonb_build_object(
      'variant_id', p_variant_id,
      'delta', p_delta,
      'type', p_type,
      'previous_qty', v_current_qty,
      'resulting_qty', v_new_qty,
      'reference', p_reference
    ),
    'product_variant', p_variant_id
  );

  return v_movement_id;
end;
$$;

revoke all on function public.record_stock_movement(uuid,integer,text,text,text,numeric) from public;
grant execute on function public.record_stock_movement(uuid,integer,text,text,text,numeric) to authenticated;

-- adjust_stock: stocktake correction by counted quantity
create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_counted integer,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_qty integer;
  v_delta integer;
begin
  -- Authorization: admin/ceo only
  if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select stock_qty into v_current_qty
  from public.product_variants
  where id = p_variant_id;

  if not found then
    raise exception 'Variant not found' using errcode = '22023';
  end if;

  v_delta := p_counted - v_current_qty;

  if v_delta = 0 then
    raise exception 'No change' using errcode = '22023';
  end if;

  -- Delegate to record_stock_movement
  return public.record_stock_movement(
    p_variant_id,
    v_delta,
    'stocktake_correction',
    null,
    p_reason,
    null
  );
end;
$$;

revoke all on function public.adjust_stock(uuid,integer,text) from public;
grant execute on function public.adjust_stock(uuid,integer,text) to authenticated;

-- Extend orders table with VAT and snapshot columns
alter table public.orders
  add column if not exists vat_total numeric(12,2),
  add column if not exists net_total numeric(12,2),
  add column if not exists source text not null default 'management'
    check (source in ('management','storefront','import'));

-- Extend order_items with variant_id and snapshot columns
alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists sku_snapshot text,
  add column if not exists product_name_he text,
  add column if not exists product_name_en text,
  add column if not exists unit_cost numeric(12,2),
  add column if not exists vat_rate numeric(5,2),
  add column if not exists vat_amount numeric(12,2),
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists net_amount numeric(12,2);

-- Order number sequence
create sequence if not exists public.order_number_seq;

-- record_sale: atomic sale with stock deduction, order creation, snapshots, VAT
create or replace function public.record_sale(
  p_customer jsonb,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_discount numeric(12,2);
  v_variant record;
  v_product record;
  v_vat_rate numeric(5,2);
  v_gross numeric(12,2);
  v_net numeric(12,2);
  v_vat_amount numeric(12,2);
  v_unit_cost numeric(12,2);
  v_subtotal_net numeric(12,2) := 0;
  v_vat_total numeric(12,2) := 0;
  v_total_gross numeric(12,2) := 0;
  v_item_net numeric(12,2);
  v_item_vat numeric(12,2);
  v_item_gross numeric(12,2);
  v_caller_user_id uuid;
begin
  -- Capture caller's user_id immediately (before any SECURITY DEFINER context shifts)
  v_caller_user_id := auth.uid();

  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Get current VAT rate
  select rate into v_vat_rate
  from public.tax_rates
  where is_active = true
    and valid_from <= current_date
    and (valid_until is null or valid_until >= current_date)
  order by valid_from desc
  limit 1;

  if v_vat_rate is null then
    v_vat_rate := 0;
  end if;

  -- Generate order number
  v_order_number := 'MIRO-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0');

  -- Insert order header (will fill totals after processing items)
  insert into public.orders (
    order_number, status, currency, customer_name, customer_email, customer_phone,
    user_id, source, subtotal, vat_total, total, net_total, shipping_cost, notes,
    created_at, updated_at
  ) values (
    v_order_number, 'completed', 'ILS',
    p_customer->>'name', p_customer->>'email', p_customer->>'phone',
    v_caller_user_id, 'management', 0, 0, 0, 0, 0, null,
    timezone('utc'::text, now()), timezone('utc'::text, now())
  ) returning id into v_order_id;

  -- Process each item (lock variants in deterministic order to avoid deadlocks)
  for v_item in select * from jsonb_array_elements(p_items) order by (value->>'variant_id')::uuid
  loop
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric(12,2);
    v_discount := coalesce((v_item->>'discount')::numeric(12,2), 0);

    if v_quantity <= 0 then
      raise exception 'Quantity must be positive' using errcode = '22023';
    end if;
    if v_unit_price <= 0 then
      raise exception 'Unit price must be positive' using errcode = '22023';
    end if;
    if v_discount < 0 then
      raise exception 'Discount cannot be negative' using errcode = '22023';
    end if;

    -- Lock variant and parent product
    select * into v_variant
    from public.product_variants
    where id = v_variant_id
    for update;

    if not found then
      raise exception 'Variant not found' using errcode = '22023';
    end if;

    select tracking_mode, purchase_cost, name_he, name_en, status
    into v_product
    from public.products
    where id = v_variant.product_id;

    if v_product.status <> 'active' then
      raise exception 'Product not active' using errcode = '22023';
    end if;

    if not v_variant.is_active then
      raise exception 'Variant not active' using errcode = '22023';
    end if;

    -- Check stock for tracked products (any tracking_mode != 'none' means stock-tracked)
    if v_product.tracking_mode <> 'none' then
      if v_variant.stock_qty < v_quantity then
        raise exception 'Insufficient stock' using errcode = '22023';
      end if;
    end if;

    -- Calculate line totals (prices include VAT per business_settings default)
    v_gross := v_quantity * v_unit_price - v_discount;
    v_net := round(v_gross / (1 + v_vat_rate / 100), 2);
    v_vat_amount := v_gross - v_net;

    -- Unit cost snapshot: variant.cost_override > product.purchase_cost
    v_unit_cost := coalesce(v_variant.cost_override, v_product.purchase_cost, 0);

    -- Insert order item with snapshots
    insert into public.order_items (
      order_id, product_id, variant_id, quantity, unit_price, total_price,
      sku_snapshot, product_name_he, product_name_en,
      unit_cost, vat_rate, vat_amount, discount_amount, net_amount
    ) values (
      v_order_id, v_variant.product_id, v_variant_id, v_quantity, v_unit_price, v_gross,
      v_variant.sku, v_product.name_he, v_product.name_en,
      v_unit_cost, v_vat_rate, v_vat_amount, v_discount, v_net
    );

    -- Record stock movement (sale = negative delta)
    if v_product.tracking_mode <> 'none' then
      perform public.record_stock_movement(
        v_variant_id,
        -v_quantity,
        'sale',
        v_order_number,
        'Sale via management API',
        v_unit_cost
      );
    end if;

    v_subtotal_net := v_subtotal_net + v_net;
    v_vat_total := v_vat_total + v_vat_amount;
    v_total_gross := v_total_gross + v_gross;
  end loop;

  -- Update order with calculated totals
  update public.orders
  set subtotal = v_subtotal_net,
      vat_total = v_vat_total,
      total = v_total_gross,
      net_total = v_subtotal_net,
      updated_at = timezone('utc'::text, now())
  where id = v_order_id;

  -- Audit
  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('sale_recorded', auth.uid(),
    jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'items_count', jsonb_array_length(p_items),
      'subtotal_net', v_subtotal_net,
      'vat_total', v_vat_total,
      'total_gross', v_total_gross
    ),
    'sale_order', v_order_id
  );

  return v_order_id;
end;
$$;

revoke all on function public.record_sale(jsonb,jsonb) from public;
grant execute on function public.record_sale(jsonb,jsonb) to authenticated;

-- Admin/CEO can read all orders (management access)
drop policy if exists "Management reads orders" on public.orders;
create policy "Management reads orders" on public.orders
  for select to authenticated
  using (public.active_app_role() in ('admin','ceo'));

drop policy if exists "Management reads order items" on public.order_items;
create policy "Management reads order items" on public.order_items
  for select to authenticated
  using (public.active_app_role() in ('admin','ceo'));

-- Grant SELECT on orders/order_items to authenticated (required for RLS policies to apply)
grant select on public.orders, public.order_items to authenticated;

-- ============================================================
-- 6. PRODUCT_SERIAL_UNITS (for serial/lot tracking)
-- ============================================================

create table if not exists public.product_serial_units (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  serial_number text not null unique,
  lot_code text,
  state text not null default 'in_stock'
    check (state in ('in_stock','sold','returned','damaged','rma','reserved')),
  received_at timestamptz,
  sold_at timestamptz,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_reference text,
  order_id uuid references public.orders(id) on delete set null,
  warranty_until date,
  note text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create trigger set_product_serial_units_updated_at
  before update on public.product_serial_units
  for each row execute procedure public.update_updated_at_column();

create index if not exists idx_product_serial_units_variant_state
  on public.product_serial_units(variant_id, state);
create index if not exists idx_product_serial_units_order_id
  on public.product_serial_units(order_id);

alter table public.product_serial_units enable row level security;

drop policy if exists "Management reads serial units" on public.product_serial_units;
create policy "Management reads serial units" on public.product_serial_units
  for select to authenticated
  using (public.active_app_role() in ('admin','ceo'));

grant select on public.product_serial_units to authenticated;
grant all on public.product_serial_units to service_role;

-- ============================================================
-- 7. TAX_RATES TABLE & RPCs
-- ============================================================

create table if not exists public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(5,2) not null check (rate >= 0 and rate < 100),
  valid_from date not null,
  valid_until date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- Seed Israel standard VAT 18%
insert into public.tax_rates (name, rate, valid_from, is_active)
values ('מע"מ / VAT', 18.00, '2025-01-01', true)
on conflict do nothing;

alter table public.tax_rates enable row level security;

drop policy if exists "Management reads tax rates" on public.tax_rates;
create policy "Management reads tax rates" on public.tax_rates
  for select to authenticated
  using (public.active_app_role() in ('admin','ceo'));

grant select on public.tax_rates to authenticated;
grant all on public.tax_rates to service_role;

-- current_tax_rate: returns active rate (stable, security definer)
create or replace function public.current_tax_rate()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(rate, 0)
  from public.tax_rates
  where is_active = true
    and valid_from <= current_date
    and (valid_until is null or valid_until >= current_date)
  order by valid_from desc
  limit 1;
$$;

revoke all on function public.current_tax_rate() from public;
grant execute on function public.current_tax_rate() to authenticated;

-- set_tax_rate: CEO only, deactivates previous, inserts new
create or replace function public.set_tax_rate(
  p_name text,
  p_rate numeric,
  p_valid_from date
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_id uuid;
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode = '42501';
  end if;

  if p_rate < 0 or p_rate >= 100 then
    raise exception 'Invalid rate' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(2026092501);

  -- Deactivate current active rate
  update public.tax_rates
  set is_active = false,
      valid_until = p_valid_from - interval '1 day'
  where is_active = true;

  -- Insert new rate
  insert into public.tax_rates (name, rate, valid_from, is_active, created_by)
  values (p_name, p_rate, p_valid_from, true, auth.uid())
  returning id into v_new_id;

  -- Audit
  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('tax_rate_changed', auth.uid(),
    jsonb_build_object('tax_rate_id', v_new_id, 'name', p_name, 'rate', p_rate, 'valid_from', p_valid_from),
    'tax_rate', v_new_id
  );

  return v_new_id;
end;
$$;

revoke all on function public.set_tax_rate(text,numeric,date) from public;
grant execute on function public.set_tax_rate(text,numeric,date) to authenticated;

-- ============================================================
-- 8. BUSINESS_SETTINGS TABLE & RPC
-- ============================================================

create table if not exists public.business_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Seed defaults
insert into public.business_settings (key, value) values
  ('inventory_defaults', '{"low_stock_threshold": 3, "out_of_stock_policy": "keep_visible_contact"}'),
  ('finance', '{"currency": "ILS", "prices_include_vat": true}')
on conflict (key) do nothing;

alter table public.business_settings enable row level security;

drop policy if exists "Management reads business settings" on public.business_settings;
create policy "Management reads business settings" on public.business_settings
  for select to authenticated
  using (public.active_app_role() in ('admin','ceo'));

grant select on public.business_settings to authenticated;
grant all on public.business_settings to service_role;

-- set_business_setting: CEO only upsert
create or replace function public.set_business_setting(
  p_key text,
  p_value jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode = '42501';
  end if;

  insert into public.business_settings (key, value, updated_by)
  values (p_key, p_value, auth.uid())
  on conflict (key) do update
  set value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = timezone('utc'::text, now());

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('setting_changed', auth.uid(),
    jsonb_build_object('setting_key', p_key, 'new_value', p_value),
    'business_setting', null
  );
end;
$$;

revoke all on function public.set_business_setting(text,jsonb) from public;
grant execute on function public.set_business_setting(text,jsonb) to authenticated;

-- ============================================================
-- 9. AUDIT_EVENTS EXTENSIONS
-- ============================================================

alter table public.audit_events
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

create index if not exists idx_audit_events_entity
  on public.audit_events(entity_type, entity_id);
create index if not exists idx_audit_events_created_at
  on public.audit_events(created_at);

-- ============================================================
-- 10. ANALYTICS_EVENTS TABLE & VIEW
-- ============================================================

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null
    check (event_type in (
      'product_view','product_impression','product_search','search_no_result',
      'category_view','product_contact_click','product_phone_click',
      'product_whatsapp_click','product_inquiry','sale','return'
    )),
  product_id uuid references public.products(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  search_query text,
  results_count integer,
  locale text check (locale is null or locale in ('he','en')),
  session_id text check (session_id is null or length(session_id) <= 64),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_analytics_events_type_created
  on public.analytics_events(event_type, created_at);
create index if not exists idx_analytics_events_product_created
  on public.analytics_events(product_id, created_at);
create index if not exists idx_analytics_events_search
  on public.analytics_events(search_query)
  where event_type in ('product_search','search_no_result');
create index if not exists idx_analytics_events_created_at
  on public.analytics_events(created_at);

alter table public.analytics_events enable row level security;

-- INSERT allowed for anon AND authenticated (with validation)
drop policy if exists "Anyone can insert analytics events" on public.analytics_events;
create policy "Anyone can insert analytics events" on public.analytics_events
  for insert to anon, authenticated
  with check (
    event_type in (
      'product_view','product_impression','product_search','search_no_result',
      'category_view','product_contact_click','product_phone_click',
      'product_whatsapp_click','product_inquiry','sale','return'
    )
    and (search_query is null or length(search_query) <= 200)
    and (session_id is null or length(session_id) <= 64)
    and (locale is null or locale in ('he','en'))
  );

-- SELECT for admin/ceo only
drop policy if exists "Management reads analytics events" on public.analytics_events;
create policy "Management reads analytics events" on public.analytics_events
  for select to authenticated
  using (public.active_app_role() in ('admin','ceo'));

grant insert on public.analytics_events to anon, authenticated;
grant usage on sequence public.analytics_events_id_seq to anon, authenticated;
grant select on public.analytics_events to anon, authenticated;
grant all on public.analytics_events to service_role;

-- View: daily product metrics. security_invoker so base-table RLS (admin/ceo) applies to
-- authenticated readers; service_role selects directly via grant.
create or replace view public.v_product_daily_metrics
with (security_invoker = on) as
select
  date_trunc('day', created_at) as day,
  product_id,
  event_type,
  count(*) as events,
  count(distinct session_id) as unique_sessions,
  count(distinct user_id) as unique_users
from public.analytics_events
group by 1, 2, 3;

comment on view public.v_product_daily_metrics is
'Daily product analytics aggregates. RLS of analytics_events applies (admin/ceo only).';

grant select on public.v_product_daily_metrics to authenticated, service_role;

-- ============================================================
-- 11. CATEGORIES EXTENSIONS
-- ============================================================

alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete set null,
  add column if not exists image_url text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

-- Backfill is_active for existing rows
update public.categories set is_active = true where is_active is null;

create trigger set_categories_updated_at
  before update on public.categories
  for each row execute procedure public.update_updated_at_column();

create index if not exists idx_categories_parent_id on public.categories(parent_id);
create index if not exists idx_categories_is_active on public.categories(is_active);

-- Update public SELECT policy to use is_active
drop policy if exists "Public can view active catalog categories" on public.categories;
drop policy if exists "Public categories are readable" on public.categories;
create policy "Public can view active catalog categories" on public.categories
  for select using (is_active = true);

-- ============================================================
-- 12. SEQUENCES (order_number_seq already created above)
-- ============================================================

-- (order_number_seq created in section 5)

-- ============================================================
-- 13. COMMENTS & DOCUMENTATION
-- ============================================================

comment on table public.suppliers is 'Supplier master data; managed by admin/CEO via API.';
comment on table public.product_variants is 'Canonical sellable inventory unit. One default variant per product enforced by partial unique index.';
comment on table public.stock_movements is 'Append-only stock ledger. All qty changes via record_stock_movement/adjust_stock RPCs.';
comment on table public.product_serial_units is 'Individual serial/lot units for tracked products (tracking_mode = serial/lot).';
comment on table public.tax_rates is 'VAT/tax rates with validity periods. current_tax_rate() returns active rate.';
comment on table public.business_settings is 'Key-value business configuration. CEO-only writes via set_business_setting().';
comment on table public.analytics_events is 'Client-side analytics events. Insert allowed for anon+auth; read for admin/ceo.';

comment on column public.products.price is 'NULL = price not published (contact for price). Was NOT NULL DEFAULT 0.';
comment on column public.products.status is 'Primary visibility state: draft/active/hidden/archived. is_active kept in sync via trigger.';
comment on column public.products.out_of_stock_policy is 'Frontend visibility policy when stock=0. Enforced at application layer.';
comment on column public.products.tracking_mode is 'none=simple qty, serial=per-unit serial, lot=batch/lot code.';
comment on column public.product_variants.stock_qty is 'Current on-hand quantity. Modified ONLY via record_stock_movement/adjust_stock.';
comment on column public.stock_movements.delta is 'Signed quantity change. Negative for outbound, positive for inbound.';
comment on column public.orders.source is 'Origin channel: management (admin UI), storefront (public checkout), import.';
comment on column public.order_items.vat_rate is 'VAT rate snapshot at time of sale (percent, e.g. 18.00).';
comment on column public.order_items.net_amount is 'Line net amount (excl. VAT) = round(gross / (1+rate/100), 2).';
comment on function public.record_stock_movement is 'Core stock ledger entry. Requires admin/ceo. Validates type, prevents negative stock except for correction types.';
comment on function public.adjust_stock is 'Stocktake correction: sets stock to counted quantity via stocktake_correction movement.';
comment on function public.record_sale is 'Atomic sale: creates order+items, deducts stock, snapshots costs/VAT, writes audit. Admin/CEO only.';
comment on function public.current_tax_rate is 'Returns active VAT rate (stable). Used by storefront/checkout for price display.';
comment on function public.set_tax_rate is 'CEO only. Deactivates current rate, inserts new with validity. Audited.';
comment on function public.set_business_setting is 'CEO only upsert of business_settings key. Audited.';

-- Ensure anon has SELECT on products and categories for public catalog access
grant select on public.products, public.categories to anon;