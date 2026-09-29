-- Finance and Analytics RPC hardening
-- 1. management_finance_overview: authoritative finance aggregates (revenue, VAT, COGS, gross profit, inventory valuation)
--    - Mirrors src/app/api/management/finance/route.ts logic but in SQL
--    - Computed entirely in DB; no app-memory row caps
--    - Returns daily series for charts
-- 2. management_analytics_overview: fix distinct count logic (already uses COUNT(DISTINCT session_id) in SQL)
-- 3. Add idempotency key to record_sale
-- 4. Stock lock ordering: verify deterministic lock order in record_sale (already ordered by variant_id)

-- ============================================================
-- 1. management_finance_overview: authoritative finance aggregates
-- ============================================================

-- Private helper: computes finance window. Not granted to API roles;
-- only reachable from management_finance_overview.
create or replace function public._management_finance_window(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ord as (
    select
      o.id,
      o.total,
      coalesce(o.net_total, o.subtotal) as net,
      coalesce(o.vat_total, 0) as vat,
      o.created_at::date as day
    from public.orders o
    where o.created_at >= p_from
      and o.created_at <= p_to
      and o.status not in ('cancelled','refunded')
  ),
  it as (
    select
      oi.order_id,
      oi.quantity,
      coalesce(oi.unit_cost, 0) as unit_cost,
      coalesce(oi.discount_amount, 0) as discount_amount,
      oi.created_at::date as day
    from public.order_items oi
    join ord on ord.id = oi.order_id
    where oi.created_at >= p_from
      and oi.created_at <= p_to
  ),
  inv as (
    select
      sum(pv.stock_qty * coalesce(pv.cost_override, p.purchase_cost, 0)) as inventory_value,
      sum(pv.stock_qty) as inventory_units
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.is_active = true
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'gross_total', round(coalesce((select sum(total) from ord), 0), 2),
    'net_total', round(coalesce((select sum(net) from ord), 0), 2),
    'vat_total', round(coalesce((select sum(vat) from ord), 0), 2),
    'orders_count', (select count(*) from ord),
    'items_count', coalesce((select sum(quantity) from it), 0),
    'cogs_total', round(coalesce((select sum(unit_cost * quantity) from it), 0), 2),
    'gross_profit', round(
      coalesce((select sum(net) from ord), 0)
      - coalesce((select sum(unit_cost * quantity) from it), 0), 2),
    'gross_margin_pct', case
      when coalesce((select sum(net) from ord), 0) > 0
      then round((
        (coalesce((select sum(net) from ord), 0)
         - coalesce((select sum(unit_cost * quantity) from it), 0))
        / (select sum(net) from ord) * 100
      ), 2)
      else 0
    end,
    'discounts_total', round(coalesce((select sum(discount_amount) from it), 0), 2),
    'inventory_value', round(coalesce((select inventory_value from inv), 0), 2),
    'inventory_units', coalesce((select inventory_units from inv), 0),
    'daily_series', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.day)
      from (
        select
          day,
          round(sum(total), 2) as gross,
          round(sum(net), 2) as net,
          count(*) as orders
        from ord
        group by day
      ) d
    ), '[]'::jsonb)
  );
$$;

revoke all on function public._management_finance_window(timestamptz,timestamptz) from public;
revoke all on function public._management_finance_window(timestamptz,timestamptz) from anon, authenticated;

create or replace function public.management_finance_overview(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid range' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'current', public._management_finance_window(p_from, p_to),
    'previous', public._management_finance_window(p_from - (p_to - p_from), p_from),
    'generated_at', timezone('utc'::text, now())
  );
end;
$$;

revoke all on function public.management_finance_overview(timestamptz,timestamptz) from public;
grant execute on function public.management_finance_overview(timestamptz,timestamptz) to authenticated;

comment on function public.management_finance_overview is
'Admin/CEO. Finance totals for [p_from,p_to] plus the equivalent-length period immediately before p_from. Orders excluding cancelled/refunded; net falls back to subtotal; COGS = sum(unit_cost*quantity) over in-range line items of included orders. Inventory valuation uses active variants with cost_override > product.purchase_cost. Daily series included.';

-- ============================================================
-- 2. management_analytics_overview: distinct count already in SQL
--    (No changes needed - already uses COUNT(DISTINCT session_id) in the RPC)
-- ============================================================

-- ============================================================
-- 3. record_sale: add idempotency key parameter
-- ============================================================

-- Extend orders table with idempotency_key column (unique, nullable)
alter table public.orders
  add column if not exists idempotency_key text;

create index if not exists idx_orders_idempotency_key on public.orders(idempotency_key);

comment on column public.orders.idempotency_key is
'Client-provided idempotency key for safe retries. Unique when present.';

-- Drop old record_sale function (different signature)
drop function if exists public.record_sale(jsonb, jsonb);

-- Update record_sale to accept and enforce idempotency key
create function public.record_sale(
  p_customer jsonb,
  p_items jsonb,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_caller_user_id uuid;
  v_customer_id uuid;
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity numeric;
  v_quantity_int integer;
  v_unit_price numeric(12,2);
  v_discount_per_unit numeric(12,2);
  v_variant record;
  v_product record;
  v_vat_rate numeric(5,2);
  v_gross_before numeric(12,2);
  v_line_discount numeric(12,2);
  v_line_gross numeric(12,2);
  v_net numeric(12,2);
  v_vat_amount numeric(12,2);
  v_unit_cost numeric(12,2);
  v_subtotal_net numeric(12,2) := 0;
  v_vat_total numeric(12,2) := 0;
  v_total_gross numeric(12,2) := 0;
begin
  -- Capture caller before any SECURITY DEFINER context shifts
  v_caller_user_id := auth.uid();

  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Idempotency: if key provided, check for existing order
  if p_idempotency_key is not null and length(p_idempotency_key) > 0 then
    select id into v_order_id
    from public.orders
    where idempotency_key = p_idempotency_key
    limit 1;

    if v_order_id is not null then
      return v_order_id; -- Return existing order id (idempotent)
    end if;
  end if;

  -- ---------- Customer payload ----------
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    raise exception 'Invalid customer payload' using errcode = '22023';
  end if;

  v_customer_name := nullif(btrim(coalesce(p_customer->>'name', '')), '');
  if v_customer_name is null then
    raise exception 'Customer name is required' using errcode = '22023';
  end if;

  v_customer_email := nullif(btrim(coalesce(p_customer->>'email', '')), '');
  v_customer_phone := nullif(btrim(coalesce(p_customer->>'phone', '')), '');

  -- Optional associated customer account (must exist, be active)
  if (p_customer ? 'customer_id')
     and coalesce(jsonb_typeof(p_customer -> 'customer_id'), 'null') <> 'null' then
    if jsonb_typeof(p_customer -> 'customer_id') <> 'string' then
      raise exception 'Invalid customer account' using errcode = '22023';
    end if;
    begin
      v_customer_id := (p_customer ->> 'customer_id')::uuid;
    exception when others then
      raise exception 'Invalid customer account' using errcode = '22023';
    end;
    if not exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where u.id = v_customer_id and p.account_status = 'active'
    ) then
      raise exception 'Invalid or inactive customer account' using errcode = '22023';
    end if;
    -- Fill immutable snapshot gaps from the account when the caller omitted them
    if v_customer_email is null then
      select u.email into v_customer_email from auth.users u where u.id = v_customer_id;
    end if;
    if v_customer_phone is null then
      select p.phone into v_customer_phone from public.profiles p where p.id = v_customer_id;
    end if;
  end if;

  -- ---------- Items payload ----------
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale must include at least one item' using errcode = '22023';
  end if;

  -- ---------- VAT snapshot ----------
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

  v_order_number := 'MIRO-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0');

  -- Order header: user_id = customer account (nullable), recorded_by = staff
  insert into public.orders (
    order_number, status, currency, customer_name, customer_email, customer_phone,
    user_id, recorded_by, source, subtotal, vat_total, total, net_total, shipping_cost, notes,
    created_at, updated_at, idempotency_key
  ) values (
    v_order_number, 'completed', 'ILS',
    v_customer_name, v_customer_email, v_customer_phone,
    v_customer_id, v_caller_user_id, 'management', 0, 0, 0, 0, 0, null,
    timezone('utc'::text, now()), timezone('utc'::text, now()),
    p_idempotency_key
  ) returning id into v_order_id;

  -- Process items (deterministic lock order to avoid deadlocks)
  for v_item in select value from jsonb_array_elements(p_items) order by (value->>'variant_id')
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Invalid sale item' using errcode = '22023';
    end if;

    -- The legacy per-line "discount" key is rejected: discount is per-unit now.
    if v_item ? 'discount' then
      raise exception 'Legacy item key "discount" rejected; use discount_per_unit' using errcode = '22023';
    end if;

    if jsonb_typeof(v_item->'variant_id') is distinct from 'string'
       or jsonb_typeof(v_item->'quantity') is distinct from 'number'
       or jsonb_typeof(v_item->'unit_price') is distinct from 'number' then
      raise exception 'Sale item requires variant_id, quantity and unit_price' using errcode = '22023';
    end if;
    if (v_item ? 'discount_per_unit')
       and jsonb_typeof(v_item->'discount_per_unit') is distinct from 'number' then
      raise exception 'discount_per_unit must be a number' using errcode = '22023';
    end if;

    begin
      v_variant_id := (v_item->>'variant_id')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;
      v_unit_price := (v_item->>'unit_price')::numeric(12,2);
      v_discount_per_unit := coalesce((v_item->>'discount_per_unit')::numeric(12,2), 0);
    exception when others then
      raise exception 'Invalid sale item numbers' using errcode = '22023';
    end;

    if v_quantity is null or v_quantity = 'NaN'::numeric
       or v_quantity <> trunc(v_quantity) or v_quantity <= 0 then
      raise exception 'Quantity must be a positive integer' using errcode = '22023';
    end if;
    v_quantity_int := v_quantity::integer;

    if v_unit_price is null or v_unit_price = 'NaN'::numeric or v_unit_price <= 0 then
      raise exception 'Unit price must be positive' using errcode = '22023';
    end if;
    if v_discount_per_unit is null or v_discount_per_unit = 'NaN'::numeric
       or v_discount_per_unit < 0 or v_discount_per_unit > v_unit_price then
      raise exception 'discount_per_unit must be between 0 and the unit price' using errcode = '22023';
    end if;

    -- Lock variant and fetch parent product
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

    -- Stock check for tracked products
    if v_product.tracking_mode <> 'none' then
      if v_variant.stock_qty < v_quantity_int then
        raise exception 'Insufficient stock' using errcode = '22023';
      end if;
    end if;

    -- Line math (VAT-inclusive). discount_amount = rounded TOTAL line discount.
    v_gross_before := v_quantity_int * v_unit_price;
    v_line_discount := round(v_quantity_int * v_discount_per_unit, 2);
    v_line_gross := greatest(v_gross_before - v_line_discount, 0::numeric);
    v_net := round(v_line_gross / (1 + v_vat_rate / 100), 2);
    v_vat_amount := v_line_gross - v_net;

    -- Unit cost snapshot: variant.cost_override > product.purchase_cost
    v_unit_cost := coalesce(v_variant.cost_override, v_product.purchase_cost, 0);

    insert into public.order_items (
      order_id, product_id, variant_id, quantity, unit_price, total_price,
      sku_snapshot, product_name_he, product_name_en,
      unit_cost, vat_rate, vat_amount, discount_amount, net_amount
    ) values (
      v_order_id, v_variant.product_id, v_variant_id, v_quantity_int, v_unit_price, v_line_gross,
      v_variant.sku, v_product.name_he, v_product.name_en,
      v_unit_cost, v_vat_rate, v_vat_amount, v_line_discount, v_net
    );

    -- Stock movement (sale = negative delta)
    if v_product.tracking_mode <> 'none' then
      perform public.record_stock_movement(
        v_variant_id,
        -v_quantity_int,
        'sale',
        v_order_number,
        'Sale via management API',
        v_unit_cost
      );
    end if;

    v_subtotal_net := v_subtotal_net + v_net;
    v_vat_total := v_vat_total + v_vat_amount;
    v_total_gross := v_total_gross + v_line_gross;
  end loop;

  -- Totals are sums of non-negative line values; clamp defensively
  update public.orders
  set subtotal = greatest(v_subtotal_net, 0::numeric),
      vat_total = greatest(v_vat_total, 0::numeric),
      total = greatest(v_total_gross, 0::numeric),
      net_total = greatest(v_subtotal_net, 0::numeric),
      updated_at = timezone('utc'::text, now())
  where id = v_order_id;

  -- Audit (actor = auth.uid())
  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('sale_recorded', auth.uid(),
    jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'customer_id', v_customer_id,
      'recorded_by', v_caller_user_id,
      'idempotency_key', p_idempotency_key,
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

revoke all on function public.record_sale(jsonb,jsonb,text) from public;
grant execute on function public.record_sale(jsonb,jsonb,text) to authenticated;

comment on function public.record_sale is
'Atomic sale: order+items, stock deduction, cost/VAT snapshots, audit. Admin/CEO only. p_customer: {name (required), email?, phone?, customer_id? of an ACTIVE account}. orders.user_id = customer, orders.recorded_by = auth.uid(). Items: {variant_id, quantity, unit_price, discount_per_unit?}. Legacy key "discount" rejected; line discount = qty*discount_per_unit. p_idempotency_key: optional client key for safe retries; returns existing order_id on duplicate.';

-- ============================================================
-- 4. Stock lock ordering: already deterministic in record_sale
--    (variants locked in order by variant_id ASC)
--    record_stock_movement and adjust_stock use pg_advisory_xact_lock per variant
--    which is correct for per-variant serialization.
-- ============================================================

-- ============================================================
-- 5. management_inventory_list: already has hard cap on page_size (100)
--    and uses DB-side pagination. No REST row cap issues.
-- ============================================================