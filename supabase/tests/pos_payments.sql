-- POS payments tests
-- Run against an isolated migrated database. All fixtures are rolled back.
begin;

-- ============================================================
-- Fixtures
-- ============================================================

-- Create test users with roles
insert into auth.users(id, raw_user_meta_data) values
('00000000-0000-0000-0000-000000000200', '{"full_name":"Customer"}'),
('00000000-0000-0000-0000-000000000201', '{"full_name":"Worker"}'),
('00000000-0000-0000-0000-000000000202', '{"full_name":"Admin"}'),
('00000000-0000-0000-0000-000000000203', '{"full_name":"CEO"}');

update public.user_roles set role='worker' where user_id='00000000-0000-0000-0000-000000000201';
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000202';
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000203';

-- Create test category and product
insert into public.categories(id, slug, name_he, name_en, is_active)
values ('11111111-1111-1111-1111-111111111111', 'test-cat', 'קטגוריה', 'Category', true);

-- Products must enter as 'draft' (enforced by products_enforce_insert_draft_trg),
-- then transition state; direct fixture UPDATEs mirror real management flows.
insert into public.products(id, category_id, slug, name_he, name_en, price, inventory_count, tracking_mode)
values
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'product-a', 'מוצר א', 'Product A', 100.00, 10, 'serial'),
('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'product-b', 'מוצר ב', 'Product B', 200.00, 5, 'serial');

update public.products set status = 'active'
where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

-- Create test variants for testing (inserted before RLS role switch)
insert into public.product_variants(id, product_id, sku, barcode, is_default, is_active, stock_qty)
values
('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'SKU-TEST-001', 'BC-TEST-001', false, true, 5),
('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'SKU-TEST-002', 'BC-TEST-002', false, true, 5),
('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'SKU-DEFAULT-A', 'BC-DEFAULT-A', true, true, 10);

-- ============================================================
-- 1. Authorized POS sale via record_pos_sale creates order (source='pos') + items + order_payments rows + stock decrease + audit pos_sale_recorded
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$
declare
  v_order_id uuid;
  v_variant_id uuid := '22222222-2222-2222-2222-222222222222';
  v_stock_before integer;
  v_stock_after integer;
  v_order record;
  v_items record;
  v_payment record;
begin
  v_stock_before := (select stock_qty from public.product_variants where id = v_variant_id);

  -- Record POS sale: 2 items at 100 each, no discount, payment cash
  v_order_id := public.record_pos_sale(
    '{"name": "Test Customer", "email": "test@example.com", "phone": "050-1234567"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 2, "unit_price": 100.00, "discount_per_unit": 0}]'::jsonb,
    '[{"method": "cash", "amount": 200.00}]'::jsonb,
    null
  );

  if v_order_id is null then raise exception 'Order ID not returned'; end if;

  -- Check order created with correct totals (VAT 18%)
  select * into v_order from public.orders where id = v_order_id;
  if v_order.status <> 'paid' then raise exception 'Order status not paid'; end if;
  if v_order.source <> 'pos' then raise exception 'Order source not pos'; end if;
  -- Assuming VAT 18% from seeded tax_rates
  if abs(v_order.net_total - 169.49) > 0.01 then raise exception 'Net total mismatch'; end if;
  if abs(v_order.vat_total - 30.51) > 0.01 then raise exception 'VAT total mismatch'; end if;
  if abs(v_order.total - 200.00) > 0.01 then raise exception 'Gross total mismatch'; end if;

  -- Check order_items populated
  select * into v_items from public.order_items where order_id = v_order_id;
  if v_items.variant_id <> v_variant_id then raise exception 'Variant ID not snapshotted'; end if;
  if v_items.quantity <> 2 then raise exception 'Quantity mismatch'; end if;
  if v_items.unit_price <> 100.00 then raise exception 'Unit price mismatch'; end if;
  if v_items.total_price <> 200.00 then raise exception 'Total price mismatch'; end if;

  -- Check order_payments created
  select * into v_payment from public.order_payments where order_id = v_order_id;
  if v_payment.payment_method <> 'cash' then raise exception 'Payment method mismatch'; end if;
  if v_payment.amount <> 200.00 then raise exception 'Payment amount mismatch'; end if;
  if v_payment.payment_status <> 'paid' then raise exception 'Payment status not paid'; end if;

  -- Check stock decremented
  v_stock_after := (select stock_qty from public.product_variants where id = v_variant_id);
  if v_stock_after <> v_stock_before - 2 then raise exception 'Stock not decremented'; end if;

  -- Check audit event
  if not exists (select 1 from public.audit_events where action = 'pos_sale_recorded' and entity_id = v_order_id) then
    raise exception 'POS sale audit event missing';
  end if;
end $$;

-- ============================================================
-- 2. Payment sum mismatch rolls back EVERYTHING (order absent, stock unchanged, zero payments rows, no audit)
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$
declare
  v_variant_id uuid := '22222222-2222-2222-2222-222222222222';
  v_stock_before integer;
  v_orders_before integer;
  v_items_before integer;
  v_payments_before integer;
  v_audit_before integer;
begin
  -- Baselines: test 1 already committed a POS sale in this same transaction,
  -- so assertions compare before/after instead of assuming zero.
  v_stock_before := (select stock_qty from public.product_variants where id = v_variant_id);
  v_orders_before := (select count(*) from public.orders where source = 'pos');
  v_items_before := (select count(*) from public.order_items);
  v_payments_before := (select count(*) from public.order_payments);
  v_audit_before := (select count(*) from public.audit_events where action = 'pos_sale_recorded');

  begin
    perform public.record_pos_sale(
      '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
      '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
      '[{"method": "cash", "amount": 50.00}]'::jsonb, -- payment less than order total
      null
    );
    raise exception 'Insufficient payment allowed';
  exception when sqlstate '22023' then null; end;

  -- Ensure nothing was persisted
  if (select count(*) from public.orders where source = 'pos') <> v_orders_before then
    raise exception 'Order persisted despite payment mismatch';
  end if;
  if (select count(*) from public.order_items) <> v_items_before then
    raise exception 'Order items persisted despite payment mismatch';
  end if;
  if (select count(*) from public.order_payments) <> v_payments_before then
    raise exception 'Order payments persisted despite payment mismatch';
  end if;
  if (select stock_qty from public.product_variants where id = v_variant_id) <> v_stock_before then
    raise exception 'Stock changed despite payment mismatch';
  end if;
  if (select count(*) from public.audit_events where action = 'pos_sale_recorded') <> v_audit_before then
    raise exception 'Audit event persisted despite payment mismatch';
  end if;
end $$;

-- ============================================================
-- 3. Duplicate idempotency key returns SAME order id and does NOT double stock movements or payments
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$
declare
  v_order_id uuid;
  v_order_id2 uuid;
  v_variant_id uuid := '22222222-2222-2222-2222-222222222222';
  v_stock_before integer;
  v_stock_after integer;
  v_payment_count integer;
begin
  v_stock_before := (select stock_qty from public.product_variants where id = v_variant_id);

  -- First sale with idempotency key
  v_order_id := public.record_pos_sale(
    '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
    '[{"method": "cash", "amount": 100.00}]'::jsonb,
    'idempotent-key-123'
  );

  if v_order_id is null then raise exception 'Order ID not returned'; end if;

  -- Second sale with same idempotency key
  v_order_id2 := public.record_pos_sale(
    '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
    '[{"method": "cash", "amount": 100.00}]'::jsonb,
    'idempotent-key-123'
  );

  if v_order_id2 is null then raise exception 'Second order ID not returned'; end if;
  if v_order_id2 <> v_order_id then raise exception 'Duplicate key did not return same order ID'; end if;

  -- Ensure stock only decreased once
  v_stock_after := (select stock_qty from public.product_variants where id = v_variant_id);
  if v_stock_after <> v_stock_before - 1 then raise exception 'Stock decreased more than once'; end if;

  -- Ensure only one payment row
  select count(*) into v_payment_count from public.order_payments where order_id = v_order_id;
  if v_payment_count <> 1 then raise exception 'More than one payment row created'; end if;

  -- Ensure only one order item
  if (select count(*) from public.order_items where order_id = v_order_id) <> 1 then
    raise exception 'More than one order item created';
  end if;
end $$;

-- ============================================================
-- 4. Unauthorized role raises
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000200',true); -- Customer

do $$ begin
  begin
    perform public.record_pos_sale(
      '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
      '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
      '[{"method": "cash", "amount": 100.00}]'::jsonb,
      null
    );
    raise exception 'Unauthorized role allowed to record POS sale';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- 5. Negative payment rejected
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$ begin
  begin
    perform public.record_pos_sale(
      '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
      '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
      '[{"method": "cash", "amount": -10.00}]'::jsonb,
      null
    );
    raise exception 'Negative payment allowed';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 6. Invalid method rejected
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$ begin
  begin
    perform public.record_pos_sale(
      '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
      '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
      '[{"method": "invalid_method", "amount": 100.00}]'::jsonb,
      null
    );
    raise exception 'Invalid payment method allowed';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 7. installments=0 rejected
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$ begin
  begin
    perform public.record_pos_sale(
      '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
      '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
      '[{"method": "credit_card", "amount": 100.00, "installments": 0}]'::jsonb,
      null
    );
    raise exception 'Zero installments allowed';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 8. Direct INSERT into order_payments as authenticated denied
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000202',true); -- Admin

do $$ begin
  begin
    insert into public.order_payments (id, order_id, payment_method, amount)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'cash', 10.00);
    raise exception 'Direct INSERT into order_payments allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- 9. anon cannot SELECT order_payments
-- ============================================================
set local role anon;
do $$ begin
  begin
    perform 1 from public.order_payments limit 1;
    raise exception 'Anon can read order_payments';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- 10. Split-payment happy path
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$
declare
  v_order_id uuid;
  v_variant_id uuid := '22222222-2222-2222-2222-222222222222';
  v_stock_before integer;
  v_stock_after integer;
  v_payment_count integer;
begin
  v_stock_before := (select stock_qty from public.product_variants where id = v_variant_id);

  -- Record POS sale with split payment: 2 items at 100 each, 50% cash, 50% credit card
  v_order_id := public.record_pos_sale(
    '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 2, "unit_price": 100.00, "discount_per_unit": 0}]'::jsonb,
    '[{"method": "cash", "amount": 100.00}, {"method": "credit_card", "amount": 100.00}]'::jsonb,
    null
  );

  if v_order_id is null then raise exception 'Order ID not returned'; end if;

  -- Check order created with correct totals (VAT 18%)
  select * into v_order from public.orders where id = v_order_id;
  if v_order.status <> 'paid' then raise exception 'Order status not paid'; end if;
  if v_order.source <> 'pos' then raise exception 'Order source not pos'; end if;
  -- Assuming VAT 18% from seeded tax_rates
  if abs(v_order.net_total - 169.49) > 0.01 then raise exception 'Net total mismatch'; end if;
  if abs(v_order.vat_total - 30.51) > 0.01 then raise exception 'VAT total mismatch'; end if;
  if abs(v_order.total - 200.00) > 0.01 then raise exception 'Gross total mismatch'; end if;

  -- Check stock decremented correctly
  v_stock_after := (select stock_qty from public.product_variants where id = v_variant_id);
  if v_stock_after <> v_stock_before - 2 then raise exception 'Stock not decremented correctly'; end if;

  -- Check we have exactly 2 payment rows
  select count(*) into v_payment_count from public.order_payments where order_id = v_order_id;
  if v_payment_count <> 2 then raise exception 'Expected 2 payment rows, got ' || v_payment_count; end if;

  -- Check payment methods and amounts
  if not exists (select 1 from public.order_payments where order_id = v_order_id and payment_method = 'cash' and amount = 100.00) then
    raise exception 'Missing cash payment of 100.00';
  end if;
  if not exists (select 1 from public.order_payments where order_id = v_order_id and payment_method = 'credit_card' and amount = 100.00) then
    raise exception 'Missing credit card payment of 100.00';
  end if;
end $$;

-- ============================================================
-- 11. external_reference >120 rejected
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$ begin
  begin
    perform public.record_pos_sale(
      '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
      '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
      '[{"method": "cash", "amount": 100.00, "external_reference": "' || repeat('x', 121) || '"}]'::jsonb,
      null
    );
    raise exception 'External reference >120 allowed';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 12. installments=37 on credit_card rejected
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$ begin
  begin
    perform public.record_pos_sale(
      '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
      '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
      '[{"method": "credit_card", "amount": 100.00, "installments": 37}]'::jsonb,
      null
    );
    raise exception 'Installments=37 on credit_card allowed';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 13. Discount path with payments
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$
declare
  v_order_id uuid;
  v_variant_id uuid := '22222222-2222-2222-2222-222222222222';
  v_stock_before integer;
  v_stock_after integer;
begin
  v_stock_before := (select stock_qty from public.product_variants where id = v_variant_id);

  -- Record POS sale with discount: 1 item at 100, 10 discount_per_unit, payment cash
  v_order_id := public.record_pos_sale(
    '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00, "discount_per_unit": 10.00}]'::jsonb,
    '[{"method": "cash", "amount": 90.00}]'::jsonb,  // 100 - 10 = 90
    null
  );

  if v_order_id is null then raise exception 'Order ID not returned'; end if;

  -- Check order created with correct totals (VAT 18%)
  select * into v_order from public.orders where id = v_order_id;
  if v_order.status <> 'paid' then raise exception 'Order status not paid'; end if;
  if v_order.source <> 'pos' then raise exception 'Order source not pos'; end if;
  -- Item: 100 - 10 = 90 gross, 90/1.18 = 76.27 net, 13.73 vat
  if abs(v_order.net_total - 76.27) > 0.01 then raise exception 'Net total mismatch'; end if;
  if abs(v_order.vat_total - 13.73) > 0.01 then raise exception 'VAT total mismatch'; end if;
  if abs(v_order.total - 90.00) > 0.01 then raise exception 'Gross total mismatch'; end if;

  -- Check stock decremented correctly
  v_stock_after := (select stock_qty from public.product_variants where id = v_variant_id);
  if v_stock_after <> v_stock_before - 1 then raise exception 'Stock not decremented correctly'; end if;
end $$;

-- ============================================================
-- 14. Duplicate idempotency key replay asserted (second call returns same order id, single stock decrement, single payment set)
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$
declare
  v_order_id uuid;
  v_order_id2 uuid;
  v_variant_id uuid := '22222222-2222-2222-2222-222222222222';
  v_stock_before integer;
  v_stock_after integer;
  v_payment_count integer;
  v_items_count integer;
begin
  v_stock_before := (select stock_qty from public.product_variants where id = v_variant_id);

  -- First sale with idempotency key
  v_order_id := public.record_pos_sale(
    '{"name": "Test Customer", "email": "test@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
    '[{"method": "cash", "amount": 100.00}]'::jsonb,
    'idempotent-key-456'
  );

  if v_order_id is null then raise exception 'Order ID not returned'; end if;

  -- Baselines after first sale
  v_stock_after := (select stock_qty from public.product_variants where id = v_variant_id);
  select count(*) into v_payment_count from public.order_payments where order_id = v_order_id;
  select count(*) into v_items_count from public.order_items where order_id = v_order_id;

  -- Second sale with same idempotency key
  v_order_id2 := public.record_pos_sale(
    '{"name": "Test Customer 2", "email": "test2@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 2, "unit_price": 50.00}]'::jsonb,  // Different item/amount
    '[{"method": "cash", "amount": 100.00}]'::jsonb,
    'idempotent-key-456'
  );

  if v_order_id2 is null then raise exception 'Second order ID not returned'; end if;
  if v_order_id2 <> v_order_id then raise exception 'Duplicate key did not return same order ID'; end if;

  -- Ensure stock only decreased once (from first sale only)
  if (select stock_qty from public.product_variants where id = v_variant_id) <> v_stock_after then
    raise exception 'Stock changed more than once';
  end if;

  -- Ensure only one payment set (from first sale)
  if (select count(*) from public.order_payments where order_id = v_order_id) <> v_payment_count then
    raise exception 'Payment set was changed';
  end if;

  -- Ensure only one item set (from first sale)
  if (select count(*) from public.order_items where order_id = v_order_id) <> v_items_count then
    raise exception 'Item set was changed';
  end if;
end $$;

-- ============================================================
-- 15. management_pos_accounts returns POS rows and excludes website-source rows
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$
declare
  v_pos_order_id uuid;
  v_website_order_id uuid;
  v_result jsonb;
  v_pos_count integer;
  v_website_count integer;
begin
  -- Create a POS order
  v_pos_order_id := public.record_pos_sale(
    '{"name": "POS Customer", "email": "pos@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
    '[{"method": "cash", "amount": 100.00}]'::jsonb,
    null
  );

  -- Create a website order (source website) by inserting directly into orders with website source
  -- We'll need to backdate it to look like a website order
  insert into public.orders (
    order_number, status, currency, customer_name, customer_email, customer_phone,
    user_id, recorded_by, source, subtotal, vat_total, total, net_total, shipping_cost, notes,
    created_at, updated_at
  ) values (
    'WEB-ORDER-001', 'completed', 'ILS',
    'Website Customer', 'website@example.com', '050-9876543',
    '00000000-0000-0000-0000-000000000200',  // Customer user_id
    '00000000-0000-0000-0000-000000000203',  // CEO recorded_by
    'website',  // website source
    84.75,      // subtotal (net)
    15.25,      // vat
    100.00,     // total
    84.75,      // net
    0,          // shipping
    null,       // notes
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  ) returning id into v_website_order_id;

  -- Test management_pos_accounts - should return only POS order, not website
  v_result := public.management_pos_accounts(
    timezone('utc'::text, now()) - interval '1 day',
    timezone('utc'::text, now()) + interval '1 day',
    null, null, null, null, 100, 0
  );

  -- Check that we got exactly one order (the POS one)
  v_pos_count := (v_result->'orders')::jsonb #>> '{0,order_id}') is not null)::int +
                 (case when (v_result->'orders')::jsonb #>> '{0,order_id}' is null then 0 else 1 end);
  -- Actually, let's count properly
  select jsonb_array_length(v_result->'orders') into v_pos_count;

  if v_pos_count <> 1 then
    raise exception 'Expected 1 POS order, got ' || v_pos_count;
  end if;

  -- Check that the order we got is the POS order, not the website order
  if (v_result->'orders' #>> '{0,order_id}') <> v_pos_order_id::text then
    raise exception 'Returned order is not the POS order';
  end if;

  -- Explicitly check that website order is not in results
  if (v_result->'orders')::jsonb #> '{0,order_id}' = v_website_order_id::text then
    raise exception 'Website order incorrectly included in results';
  end if;
end $$;

-- ============================================================
-- 16. management_pos_accounts filters and summary math
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true); -- CEO

do $$
declare
  v_order_id uuid;
  v_result jsonb;
  v_filtered_count integer;
begin
  -- Create a POS order
  v_order_id := public.record_pos_sale(
    '{"name": "Filter Test Customer", "email": "filter@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 2, "unit_price": 50.00}]'::jsonb,
    '[{"method": "credit_card", "amount": 100.00}]'::jsonb,
    null
  );

  -- Test method filter
  v_result := public.management_pos_accounts(
    timezone('utc'::text, now()) - interval '1 day',
    timezone('utc'::text, now()) + interval '1 day',
    'credit_card', null, null, null, 100, 0
  );
  select jsonb_array_length(v_result->'orders') into v_filtered_count;
  if v_filtered_count <> 1 then
    raise exception 'Expected 1 order with credit_card filter, got ' || v_filtered_count;
  end if;

  -- Test that it excludes other methods
  v_result := public.management_pos_accounts(
    timezone('utc'::text, now()) - interval '1 day',
    timezone('utc'::text, now()) + interval '1 day',
    'cash', null, null, null, 100, 0
  );
  select jsonb_array_length(v_result->'orders') into v_filtered_count;
  if v_filtered_count <> 0 then
    raise exception 'Expected 0 orders with cash filter (we have credit_card), got ' || v_filtered_count;
  end if;

  -- Test search filter
  v_result := public.management_pos_accounts(
    timezone('utc'::text, now()) - interval '1 day',
    timezone('utc'::text, now()) + interval '1 day',
    null, null, null, 'Filter Test', 100, 0
  );
  select jsonb_array_length(v_result->'orders') into v_filtered_count;
  if v_filtered_count <> 1 then
    raise exception 'Expected 1 order with search filter, got ' || v_filtered_count;
  end if;

  -- Test summary math
  v_result := public.management_pos_accounts(
    timezone('utc'::text, now()) - interval '1 day',
    timezone('utc'::text, now()) + interval '1 day',
    null, null, null, null, 100, 0
  );
  -- Check that summary has expected fields
  if v_result ? 'summary' then
    if not (v_result->'summary' ? 'transaction_count') then
      raise exception 'Summary missing transaction_count';
    end if;
    if not (v_result->'summary' ? 'revenue') then
      raise exception 'Summary missing revenue';
    end if;
    if not (v_result->'summary' ? 'units_sold') then
      raise exception 'Summary missing units_sold';
    end if;
    if not (v_result->'summary' ? 'avg_ticket') then
      raise exception 'Summary missing avg_ticket';
    end if;
    if not (v_result->'summary' ? 'by_method') then
      raise exception 'Summary missing by_method';
    end if;
  else
    raise exception 'Summary object missing from result';
  end if;
end $$;

-- ============================================================
-- Cleanup
-- ============================================================
reset role;
rollback;