-- Fix record_pos_sale RPC: idempotency logic and return contract
-- This migration replaces the broken idempotency logic and establishes
-- a consistent JSONB return contract matching the API expectations.

-- Drop the existing function
drop function if exists public.record_pos_sale(jsonb, jsonb, jsonb, text);

create function public.record_pos_sale(
  p_customer jsonb,
  p_items jsonb,
  p_payments jsonb,
  p_idempotency_key text default null
) returns jsonb
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
  v_payment jsonb;
  v_payments_total numeric(12,2) := 0;
  v_payment_methods text[] := '{}';
  v_installments integer[] := '{}';
  v_existing_order_id uuid;
begin
  -- Capture caller before any SECURITY DEFINER context shifts
  v_caller_user_id := auth.uid();

  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- ---------- Idempotency: check for existing order first ----------
  if p_idempotency_key is not null and length(p_idempotency_key) > 0 then
    select id into v_existing_order_id
    from public.orders
    where idempotency_key = p_idempotency_key
    limit 1;

    if v_existing_order_id is not null then
      -- Return existing order info as JSONB (same structure as successful creation)
      return (
        select jsonb_build_object(
          'order_id', id,
          'order_number', order_number,
          'total_gross', total,
          'net_total', net_total,
          'vat_total', vat_total,
          'source', source,
          'status', status
        )
        from public.orders
        where id = v_existing_order_id
      );
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
    v_order_number, 'paid', 'ILS',
    v_customer_name, v_customer_email, v_customer_phone,
    v_customer_id, v_caller_user_id, 'pos', 0, 0, 0, 0, 0, null,
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

    -- Validate and extract variant_id
    if v_item ? 'variant_id' and jsonb_typeof(v_item->'variant_id') = 'string' then
      begin
        v_variant_id := (v_item->>'variant_id')::uuid;
      exception when others then
        raise exception 'Invalid variant_id' using errcode = '22023';
      end;
    else
      raise exception 'Missing or invalid variant_id' using errcode = '22023';
    end if;

    -- Validate and extract quantity
    if v_item ? 'quantity' and jsonb_typeof(v_item->'quantity') = 'number' then
      begin
        v_quantity := (v_item->>'quantity')::numeric;
      exception when others then
        raise exception 'Invalid quantity' using errcode = '22023';
      end;
    else
      raise exception 'Missing or invalid quantity' using errcode = '22023';
    end if;

    -- Validate and extract unit_price
    if v_item ? 'unit_price' and jsonb_typeof(v_item->'unit_price') = 'number' then
      begin
        v_unit_price := (v_item->>'unit_price')::numeric(12,2);
      exception when others then
        raise exception 'Invalid unit_price' using errcode = '22023';
      end;
    else
      raise exception 'Missing or invalid unit_price' using errcode = '22023';
    end if;

    -- Validate and extract discount_per_unit
    if v_item ? 'discount_per_unit' and jsonb_typeof(v_item->'discount_per_unit') = 'number' then
      begin
        v_discount_per_unit := (v_item->>'discount_per_unit')::numeric(12,2);
      exception when others then
        raise exception 'Invalid discount_per_unit' using errcode = '22023';
      end;
    else
      v_discount_per_unit := 0; -- default to 0 if not provided
    end if;

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
        'Sale via POS API',
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

  -- ---------- Validate payments ----------
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'POS sale must include at least one payment' using errcode = '22023';
  end if;

  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    if jsonb_typeof(v_payment) <> 'object' then
      raise exception 'Invalid payment object' using errcode = '22023';
    end if;

    -- Validate payment method
    if jsonb_typeof(v_payment->'method') is distinct from 'string' then
      raise exception 'Payment requires method' using errcode = '22023';
    end if;

    declare
      v_method text := lower((v_payment->>'method')::text);
      v_amount numeric := (v_payment->>'amount')::numeric;
      v_installments_val integer := coalesce((v_payment->>'installments')::integer, 1);
      v_external_ref text := nullif(btrim(coalesce(v_payment->>'external_reference', '')), '');
    begin
      -- Validate method
      if v_method not in ('cash','credit_card','bank_transfer','bit','check','other') then
        raise exception 'Invalid payment method' using errcode = '22023';
      end if;

      -- Validate amount
      if v_amount is null or v_amount = 'NaN'::numeric or v_amount <= 0 then
        raise exception 'Payment amount must be positive' using errcode = '22023';
      end if;
      -- Check for sub-agorot precision (more than 2 decimal places)
      if round(v_amount, 2) <> v_amount then
        raise exception 'Payment amount must not have sub-agorot precision' using errcode = '22023';
      end if;

      -- Validate installments
      if v_installments_val < 1 then
        raise exception 'Installments must be >= 1' using errcode = '22023';
      end if;
      -- For cash, force installments = 1
      if v_method = 'cash' and v_installments_val <> 1 then
        raise exception 'Cash payments must have exactly 1 installment' using errcode = '22023';
      end if;
      -- Installments cap: max 36 for credit_card/bit/check
      if v_method in ('credit_card', 'bit', 'check') and v_installments_val > 36 then
        raise exception 'Installments cannot exceed 36 for this payment method' using errcode = '22023';
      end if;

      -- Validate external reference length
      if v_external_ref is not null and char_length(v_external_ref) > 120 then
        raise exception 'External reference too long' using errcode = '22023';
      end if;

      -- Accumulate for validation
      v_payments_total := v_payments_total + v_amount;
      v_payment_methods := v_payment_methods || v_method;
      v_installments := v_installments || v_installments_val;

      -- Insert payment record
      insert into public.order_payments (
        order_id, payment_method, amount, currency, installments,
        payment_status, external_reference, recorded_by, paid_at
      ) values (
        v_order_id, v_method, v_amount, 'ILS', v_installments_val,
        'paid', v_external_ref, v_caller_user_id, timezone('utc'::text, now())
      );
    end;
  end loop;

  -- Validate payment total matches order total
  if round(v_payments_total, 2) <> round(v_total_gross, 2) then
    raise exception 'Payment total does not match order total' using errcode = '22023';
  end if;

  -- ---------- Audit ----------
  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('pos_sale_recorded', auth.uid(),
    jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'sales_channel', 'pos',
      'recorded_by', v_caller_user_id,
      'customer_id', v_customer_id,
      'items_count', jsonb_array_length(p_items),
      'units_count', (
        select coalesce(sum((x.value->>'quantity')::numeric), 0)
        from jsonb_array_elements(p_items) as x(value)
        where (x.value->>'quantity')::numeric > 0
      ),
      'subtotal_net', v_subtotal_net,
      'vat_total', v_vat_total,
      'total_gross', v_total_gross,
      'payment_total', v_payments_total,
      'payment_methods', v_payment_methods,
      'installments', v_installments,
      'idempotency_key', p_idempotency_key
    ),
    'sale_order', v_order_id
  );

  -- Return the created order info as JSONB (canonical contract)
  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_gross', v_total_gross,
    'net_total', v_subtotal_net,
    'vat_total', v_vat_total,
    'source', 'pos',
    'status', 'paid'
  );
end;
$$;

revoke all on function public.record_pos_sale(jsonb,jsonb,jsonb,text) from public;
grant execute on function public.record_pos_sale(jsonb,jsonb,jsonb,text) to authenticated;

comment on function public.record_pos_sale is
'Atomic POS sale: order+items+payments, stock deduction, cost/VAT snapshots, audit. Admin/CEO only. p_customer: {name (required), email?, phone?, customer_id? of an ACTIVE account}. orders.user_id = customer, orders.recorded_by = auth.uid(), orders.source = ''pos''. Items: {variant_id, quantity, unit_price, discount_per_unit?}. Legacy key "discount" rejected; line discount = qty*discount_per_unit. p_payments: array of {{method, amount, installments?, external_reference?}}. Method in (cash,credit_card,bank_transfer,bit,check,other); amount > 0 with max 2 decimals; installments >= 1 (cash forces installments=1); external_reference <= 120 chars. Sum of payment amounts must equal order total exactly. p_idempotency_key: optional client key for safe retries; returns existing order_id on duplicate. Returns JSONB: {order_id, order_number, total_gross, net_total, vat_total, source, status}.';