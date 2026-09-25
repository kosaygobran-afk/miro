-- Commerce Foundation Tests
-- Run against an isolated migrated database. All fixtures are rolled back.
begin;

-- Create test users with roles
insert into auth.users(id, raw_user_meta_data) values
('00000000-0000-0000-0000-000000000100', '{"full_name":"Customer"}'),
('00000000-0000-0000-0000-000000000101', '{"full_name":"Worker"}'),
('00000000-0000-0000-0000-000000000102', '{"full_name":"Admin"}'),
('00000000-0000-0000-0000-000000000103', '{"full_name":"CEO"}');

update public.user_roles set role='worker' where user_id='00000000-0000-0000-0000-000000000101';
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000102';
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000103';

-- Create test category and product
insert into public.categories(id, slug, name_he, name_en, is_active)
values ('11111111-1111-1111-1111-111111111111', 'test-cat', 'קטגוריה', 'Category', true),
       ('66666666-6666-6666-6666-666666666666', 'inactive-cat', 'לא פעיל', 'Inactive', false);

insert into public.products(id, category_id, slug, name_he, name_en, price, status, inventory_count, tracking_mode)
values
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'product-a', 'מוצר א', 'Product A', 100.00, 'active', 10, 'none'),
('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'product-b', 'מוצר ב', 'Product B', 200.00, 'active', 5, 'serial'),
('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'product-draft', 'טיוטה', 'Draft', null, 'draft', 0, 'none'),
('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'product-archived', 'ארכיון', 'Archived', null, 'archived', 0, 'serial');

-- Create test variants for constraint testing (inserted before RLS role switch)
-- Include a default variant for product-a to test the partial unique index
insert into public.product_variants(id, product_id, sku, barcode, is_default, is_active, stock_qty)
values
('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'SKU-TEST-001', 'BC-TEST-001', false, true, 5),
('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'SKU-TEST-003', 'BC-TEST-003', false, true, 5),
('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'SKU-DEFAULT-A', 'BC-DEFAULT-A', true, true, 10),
('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'SKU-STOCK-TEST', 'BC-STOCK-TEST', false, true, 10),
('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 'SKU-SALE-TEST', 'BC-SALE-TEST', false, true, 20);

-- ============================================================
-- 1. Variant uniqueness constraints (tested before RLS role switch)
-- ============================================================
do $$ begin
  -- Duplicate SKU rejected
  begin
    insert into public.product_variants(product_id, sku, barcode, is_default, is_active, stock_qty)
    values ('22222222-2222-2222-2222-222222222222', 'SKU-TEST-001', 'BC-TEST-002', false, true, 3);
    raise exception 'Duplicate SKU allowed';
  exception when unique_violation then null;
  end;
end $$;

do $$ begin
  -- Duplicate barcode rejected
  begin
    insert into public.product_variants(product_id, sku, barcode, is_default, is_active, stock_qty)
    values ('22222222-2222-2222-2222-222222222222', 'SKU-TEST-004', 'BC-TEST-003', false, true, 3);
    raise exception 'Duplicate barcode allowed';
  exception when unique_violation then null;
  end;
end $$;

-- ============================================================
-- 2. Only one default variant per product (tested before RLS role switch)
-- ============================================================
do $$ begin
  -- Default variant already exists for product-a; insert another default should fail
  begin
    insert into public.product_variants(product_id, sku, barcode, is_default, is_active, stock_qty)
    values ('22222222-2222-2222-2222-222222222222', 'SKU-TEST-DEFAULT2', 'BC-TEST-DEFAULT2', true, true, 5);
    raise exception 'Second default variant allowed';
  exception when unique_violation then null;
  end;
end $$;

-- Set initial stock for sale test variant (before RLS role switch)
update public.product_variants set stock_qty = 20 where id = '66666666-6666-6666-6666-666666666666';

set local role authenticated;

-- ============================================================
-- 3. record_stock_movement: customer denied, admin works, negative stock prevented for sale
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000100',true); -- customer
do $$ begin
  begin
    perform public.record_stock_movement('55555555-5555-5555-5555-555555555555', 5, 'purchase_receipt', null, null, null);
    raise exception 'Customer stock movement allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true); -- admin
do $$
declare v_movement_id uuid;
begin
  -- Valid purchase_receipt (positive delta)
  v_movement_id := public.record_stock_movement('55555555-5555-5555-5555-555555555555', 10, 'purchase_receipt', 'PO-123', 'Initial stock', 50.00);
  if v_movement_id is null then raise exception 'Movement ID not returned'; end if;

  -- Verify stock increased (10 initial + 10 purchase = 20)
  if (select stock_qty from public.product_variants where id = '55555555-5555-5555-5555-555555555555') <> 20 then
    raise exception 'Stock not increased correctly';
  end if;

  -- Sale movement (negative delta) - should work with sufficient stock
  v_movement_id := public.record_stock_movement('55555555-5555-5555-5555-555555555555', -5, 'sale', 'ORD-001', 'Sale', 50.00);
  if (select stock_qty from public.product_variants where id = '55555555-5555-5555-5555-555555555555') <> 15 then
    raise exception 'Stock not decreased correctly';
  end if;

  -- Sale movement exceeding stock - should fail
  begin
    perform public.record_stock_movement('55555555-5555-5555-5555-555555555555', -20, 'sale', 'ORD-002', 'Oversell', 50.00);
    raise exception 'Oversell allowed';
  exception when sqlstate '22023' then null; end;

  -- Negative stock allowed for manual_adjustment
  v_movement_id := public.record_stock_movement('55555555-5555-5555-5555-555555555555', -20, 'manual_adjustment', null, 'Correction', null);
  if (select stock_qty from public.product_variants where id = '55555555-5555-5555-5555-555555555555') <> -5 then
    raise exception 'Manual adjustment negative not allowed';
  end if;

  -- Restore positive stock
  perform public.record_stock_movement('55555555-5555-5555-5555-555555555555', 10, 'manual_adjustment', null, 'Restore', null);
end $$;

-- ============================================================
-- 4. adjust_stock computes delta correctly
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true); -- admin
do $$
declare v_movement_id uuid; v_before integer;
begin
  v_before := (select stock_qty from public.product_variants where id = '55555555-5555-5555-5555-555555555555');

  -- Adjust to 25 (delta = 25 - current)
  v_movement_id := public.adjust_stock('55555555-5555-5555-5555-555555555555', 25, 'Cycle count');
  if v_movement_id is null then raise exception 'No movement returned'; end if;

  if (select stock_qty from public.product_variants where id = '55555555-5555-5555-5555-555555555555') <> 25 then
    raise exception 'Adjust stock failed';
  end if;

  -- No change should raise
  begin
    perform public.adjust_stock('55555555-5555-5555-5555-555555555555', 25, 'No change');
    raise exception 'No-change adjust allowed';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 5. record_sale by CEO: order + items + movements + snapshots
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',true); -- CEO
do $$
declare
  v_order_id uuid;
  v_variant_id uuid := '66666666-6666-6666-6666-666666666666';
  v_stock_before integer;
  v_stock_after integer;
  v_order record;
  v_items record;
begin
  v_stock_before := (select stock_qty from public.product_variants where id = v_variant_id);

  -- Record sale: 2 items at 100 each, no discount
  v_order_id := public.record_sale(
    '{"name": "Test Customer", "email": "test@example.com", "phone": "050-1234567"}'::jsonb,
    '[{"variant_id": "66666666-6666-6666-6666-666666666666", "quantity": 2, "unit_price": 100.00, "discount": 0}]'::jsonb
  );

  if v_order_id is null then raise exception 'Order ID not returned'; end if;

  -- Check order created with correct totals (VAT 18%)
  -- gross = 2 * 100 = 200, net = 200 / 1.18 = 169.49, vat = 30.51
  select * into v_order from public.orders where id = v_order_id;
  if v_order.status <> 'completed' then raise exception 'Order status not completed'; end if;
  if v_order.source <> 'management' then raise exception 'Order source not management'; end if;
  if abs(v_order.net_total - 169.49) > 0.01 then raise exception 'Net total mismatch'; end if;
  if abs(v_order.vat_total - 30.51) > 0.01 then raise exception 'VAT total mismatch'; end if;
  if abs(v_order.total - 200.00) > 0.01 then raise exception 'Gross total mismatch'; end if;

  -- Check order_items populated with snapshots
  select * into v_items from public.order_items where order_id = v_order_id;
  if v_items.variant_id <> v_variant_id then raise exception 'Variant ID not snapshotted'; end if;
  if v_items.sku_snapshot is null then raise exception 'SKU snapshot missing'; end if;
  if v_items.product_name_he is null then raise exception 'Product name HE missing'; end if;
  if v_items.unit_cost is null then raise exception 'Unit cost snapshot missing'; end if;
  if v_items.vat_rate is null or v_items.vat_rate <> 18.00 then raise exception 'VAT rate snapshot missing'; end if;
  if v_items.vat_amount is null then raise exception 'VAT amount missing'; end if;
  if v_items.net_amount is null then raise exception 'Net amount missing'; end if;
  if v_items.discount_amount <> 0 then raise exception 'Discount amount mismatch'; end if;

  -- Check stock decremented
  v_stock_after := (select stock_qty from public.product_variants where id = v_variant_id);
  if v_stock_after <> v_stock_before - 2 then raise exception 'Stock not decremented'; end if;

  -- Check stock_movements created
  if (select count(*) from public.stock_movements where variant_id = v_variant_id and type = 'sale' and reference = (select order_number from public.orders where id = v_order_id)) <> 1 then
    raise exception 'Stock movement not created';
  end if;

  -- Check audit event
  if not exists (select 1 from public.audit_events where action = 'sale_recorded' and entity_id = v_order_id) then
    raise exception 'Sale audit event missing';
  end if;
end $$;

-- ============================================================
-- 6. record_sale insufficient stock raises 22023
-- ============================================================
do $$ begin
  -- Reset stock to 1 using adjust_stock (CEO can call this)
  perform public.adjust_stock('66666666-6666-6666-6666-666666666666', 1, 'Test reset');

  begin
    perform public.record_sale(
      '{"name": "Test", "email": "t@t.com"}'::jsonb,
      '[{"variant_id": "66666666-6666-6666-6666-666666666666", "quantity": 5, "unit_price": 100}]'::jsonb
    );
    raise exception 'Insufficient stock sale allowed';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 7. set_tax_rate: admin denied, CEO works, second set closes first
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true); -- admin
do $$ begin
  begin
    perform public.set_tax_rate('Test VAT', 15.00, '2026-01-01');
    raise exception 'Admin tax rate change allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',true); -- CEO
do $$
declare v_rate1_id uuid; v_rate2_id uuid;
begin
  -- First rate
  v_rate1_id := public.set_tax_rate('New VAT', 17.00, '2026-01-01');
  if v_rate1_id is null then raise exception 'First rate ID not returned'; end if;

  -- Verify active
  if (select rate from public.tax_rates where id = v_rate1_id) <> 17.00 then raise exception 'First rate not set'; end if;
  if (select is_active from public.tax_rates where id = v_rate1_id) <> true then raise exception 'First rate not active'; end if;

  -- Second rate (CEO)
  v_rate2_id := public.set_tax_rate('Updated VAT', 19.00, '2026-06-01');
  if v_rate2_id is null then raise exception 'Second rate ID not returned'; end if;

  -- First should be inactive with valid_until = day before second valid_from
  if (select is_active from public.tax_rates where id = v_rate1_id) <> false then raise exception 'First rate not deactivated'; end if;
  if (select valid_until from public.tax_rates where id = v_rate1_id) <> '2026-05-31' then raise exception 'First rate valid_until wrong'; end if;

  -- Second should be active
  if (select is_active from public.tax_rates where id = v_rate2_id) <> true then raise exception 'Second rate not active'; end if;
  if (select rate from public.tax_rates where id = v_rate2_id) <> 19.00 then raise exception 'Second rate value wrong'; end if;

  -- current_tax_rate should return 19
  if public.current_tax_rate() <> 19.00 then raise exception 'current_tax_rate wrong'; end if;
end $$;

-- ============================================================
-- 8. set_business_setting: customer denied, CEO works
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000100',true); -- customer
do $$ begin
  begin
    perform public.set_business_setting('test_key', '"value"'::jsonb);
    raise exception 'Customer setting change allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',true); -- CEO
do $$ begin
  perform public.set_business_setting('test_key', '{"foo": "bar"}'::jsonb);
  if (select value from public.business_settings where key = 'test_key') <> '{"foo": "bar"}'::jsonb then
    raise exception 'Setting not saved';
  end if;

  -- Update
  perform public.set_business_setting('test_key', '{"foo": "baz"}'::jsonb);
  if (select value from public.business_settings where key = 'test_key') <> '{"foo": "baz"}'::jsonb then
    raise exception 'Setting not updated';
  end if;

  -- Audit event
  if not exists (select 1 from public.audit_events where action = 'setting_changed' and details->>'setting_key' = 'test_key') then
    raise exception 'Setting audit missing';
  end if;
end $$;

-- ============================================================
-- 9. analytics_events: anon insert allowed, anon select 0 rows, customer select denied, admin works
-- ============================================================
set local role anon;
do $$ begin
  insert into public.analytics_events(event_type, product_id, locale, session_id)
  values ('product_view', '22222222-2222-2222-2222-222222222222', 'he', 'session-123');
  -- Should succeed
end $$;

do $$ begin
  -- Anon has no SELECT grant at all (permission denied) — even stronger than RLS.
  begin
    perform 1 from public.analytics_events limit 1;
    raise exception 'Anon can read analytics';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000100',true); -- customer
do $$ begin
  -- Customer select returns 0 rows (RLS policy only allows admin/ceo)
  if (select count(*) from public.analytics_events) <> 0 then
    raise exception 'Customer can read analytics';
  end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true); -- admin
do $$ begin
  -- Admin can read
  if (select count(*) from public.analytics_events) <> 1 then
    raise exception 'Admin analytics read failed';
  end if;
end $$;

-- ============================================================
-- 10. products public select hides draft/archived
-- ============================================================
set local role anon;
do $$ begin
  -- Should only see active products (original 2 + any seeded active)
  if (select count(*) from public.products where slug in ('product-a','product-b')) <> 2 then
    raise exception 'Active products not visible';
  end if;
  if (select count(*) from public.products where slug in ('product-draft','product-archived')) <> 0 then
    raise exception 'Draft/archived products visible';
  end if;
end $$;

-- ============================================================
-- 11. stock_movements direct insert by admin denied (RPC only)
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true); -- admin
do $$ begin
  begin
    insert into public.stock_movements(variant_id, delta, previous_qty, resulting_qty, type)
    values ('22222222-2222-2222-2222-222222222222', 1, 10, 11, 'purchase_receipt');
    raise exception 'Direct stock_movements insert allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- 12. Categories is_active policy
-- ============================================================
set local role anon;
do $$ begin
  -- Inactive category should not be visible
  if (select count(*) from public.categories where slug = 'inactive-cat') <> 0 then
    raise exception 'Inactive category visible';
  end if;
end $$;

-- ============================================================
-- Cleanup
-- ============================================================
reset role;
rollback;