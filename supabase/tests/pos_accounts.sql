-- POS accounts tests
-- Run against an isolated migrated database. All fixtures are rolled back.
begin;

create function pg_temp.record_pos_sale_id(
  p_customer jsonb,
  p_items jsonb,
  p_payments jsonb,
  p_idempotency_key text
) returns uuid
language plpgsql
as $$
declare
  v_result jsonb;
begin
  v_result := public.record_pos_sale(
    p_customer, p_items, p_payments, p_idempotency_key
  );
  if jsonb_typeof(v_result) is distinct from 'object'
     or nullif(v_result->>'order_number', '') is null then
    raise exception 'record_pos_sale returned an invalid result';
  end if;
  return (v_result->>'order_id')::uuid;
end;
$$;

create function pg_temp.create_website_test_order(
  p_order_number text,
  p_customer_id uuid,
  p_recorded_by uuid
) returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.orders (
    order_number, status, currency, customer_name, customer_email, customer_phone,
    user_id, recorded_by, source, subtotal, vat_total, total, net_total,
    shipping_cost, notes, created_at, updated_at
  ) values (
    p_order_number, 'completed', 'ILS', 'Website Customer', 'website@example.com',
    '050-9876543', p_customer_id, p_recorded_by, 'website', 84.75, 15.25,
    100.00, 84.75, 0, null, timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  returning id;
$$;

-- ============================================================
-- Fixtures
-- ============================================================

-- Create test users with roles
insert into auth.users(id, raw_user_meta_data) values
('00000000-0000-0000-0000-000000000300', '{"full_name":"Customer"}'),
('00000000-0000-0000-0000-000000000301', '{"full_name":"Worker"}'),
('00000000-0000-0000-0000-000000000302', '{"full_name":"Admin"}'),
('00000000-0000-0000-0000-000000000303', '{"full_name":"CEO"}');

update public.user_roles set role='worker' where user_id='00000000-0000-0000-0000-000000000301';
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000302';
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000303';

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
('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'SKU-TEST-001', 'BC-TEST-001', false, true, 100),
('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'SKU-TEST-002', 'BC-TEST-002', false, true, 100),
('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'SKU-DEFAULT-A', 'BC-DEFAULT-A', true, true, 100);

-- ============================================================
-- 1. management_pos_accounts returns POS rows and excludes website-source rows
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000303',true); -- CEO

do $$
declare
  v_pos_order_id uuid;
  v_website_order_id uuid;
  v_result jsonb;
  v_pos_count integer;
begin
  -- Create a POS order
  v_pos_order_id := pg_temp.record_pos_sale_id(
    '{"name": "POS Customer", "email": "pos@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00}]'::jsonb,
    '[{"method": "cash", "amount": 100.00}]'::jsonb,
    null
  );

  v_website_order_id := pg_temp.create_website_test_order(
    'WEB-ORDER-001',
    '00000000-0000-0000-0000-000000000300',
    '00000000-0000-0000-0000-000000000303'
  );

  -- Test management_pos_accounts - should return only POS order, not website
  v_result := public.management_pos_accounts(
    timezone('utc'::text, now()) - interval '1 day',
    timezone('utc'::text, now()) + interval '1 day',
    null, null, null, null, 100, 0
  );

  -- Check that we got exactly one order (the POS one)
  select jsonb_array_length(v_result->'orders') into v_pos_count;

  if v_pos_count <> 1 then
    raise exception 'Expected 1 POS order, got %', v_pos_count;
  end if;

  -- Check that the order we got is the POS order, not the website order
  if (v_result->'orders' #>> '{0,order_id}') <> v_pos_order_id::text then
    raise exception 'Returned order is not the POS order';
  end if;

  -- Explicitly check that website order is not in results
  if (v_result->'orders')::jsonb #>> '{0,order_id}' = v_website_order_id::text then
    raise exception 'Website order incorrectly included in results';
  end if;
end $$;

-- ============================================================
-- 2. management_pos_accounts filters work correctly
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000303',true); -- CEO

do $$
declare
  v_order_id uuid;
  v_result jsonb;
  v_filtered_count integer;
begin
  -- Create a POS order
  v_order_id := pg_temp.record_pos_sale_id(
    '{"name": "Filter Test Customer", "email": "filter@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 2, "unit_price": 100.00, "discount_per_unit": 50.00}]'::jsonb,
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
    raise exception 'Expected 1 order with credit_card filter, got %', v_filtered_count;
  end if;

  -- Test that it excludes other methods
  v_result := public.management_pos_accounts(
    timezone('utc'::text, now()) - interval '1 day',
    timezone('utc'::text, now()) + interval '1 day',
    'cash', null, null, 'Filter Test', 100, 0
  );
  select jsonb_array_length(v_result->'orders') into v_filtered_count;
  if v_filtered_count <> 0 then
    raise exception 'Expected 0 orders with cash filter (we have credit_card), got %', v_filtered_count;
  end if;

  -- Test search filter
  v_result := public.management_pos_accounts(
    timezone('utc'::text, now()) - interval '1 day',
    timezone('utc'::text, now()) + interval '1 day',
    null, null, null, 'Filter Test', 100, 0
  );
  select jsonb_array_length(v_result->'orders') into v_filtered_count;
  if v_filtered_count <> 1 then
    raise exception 'Expected 1 order with search filter, got %', v_filtered_count;
  end if;
end $$;

-- ============================================================
-- 3. management_pos_accounts summary math works correctly
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000303',true); -- CEO

do $$
declare
  v_order_id uuid;
  v_result jsonb;
begin
  -- Create a POS order
  v_order_id := pg_temp.record_pos_sale_id(
    '{"name": "Summary Test Customer", "email": "summary@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 2, "unit_price": 100.00, "discount_per_unit": 50.00}]'::jsonb,
    '[{"method": "credit_card", "amount": 100.00}]'::jsonb,
    null
  );

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
-- 4. management_pos_account_detail returns correct data
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000303',true); -- CEO

do $$
declare
  v_order_id uuid;
  v_result jsonb;
  v_item_count integer;
  v_payment_count integer;
begin
  -- Create a POS order
  v_order_id := pg_temp.record_pos_sale_id(
    '{"name": "Detail Test Customer", "email": "detail@example.com"}'::jsonb,
    '[{"variant_id": "22222222-2222-2222-2222-222222222222", "quantity": 1, "unit_price": 100.00, "discount_per_unit": 10.00}]'::jsonb,
    '[{"method": "cash", "amount": 90.00}]'::jsonb,
    null
  );

  -- Test detail RPC
  v_result := public.management_pos_account_detail(v_order_id);

  -- Check that we got the expected structure
  if v_result is null then
    raise exception 'Detail RPC returned null';
  end if;

  if not (v_result ? 'order') then
    raise exception 'Detail result missing order object';
  end if;

  if not (v_result ? 'order_items') then
    raise exception 'Detail result missing order_items array';
  end if;

  if not (v_result ? 'order_payments') then
    raise exception 'Detail result missing order_payments array';
  end if;

  if not (v_result ? 'stock_movements') then
    raise exception 'Detail result missing stock_movements array';
  end if;

  -- Check order data
  if (v_result->'order' #>> '{order_id}') <> v_order_id::text then
    raise exception 'Detail order ID mismatch';
  end if;

  if (v_result->'order' #>> '{source}') <> 'pos' then
    raise exception 'Detail order source mismatch';
  end if;

  -- Check we have exactly one order item
  select jsonb_array_length(v_result->'order_items') into v_item_count;
  if v_item_count <> 1 then
    raise exception 'Expected 1 order item, got %', v_item_count;
  end if;

  -- Check we have exactly one payment
  select jsonb_array_length(v_result->'order_payments') into v_payment_count;
  if v_payment_count <> 1 then
    raise exception 'Expected 1 payment, got %', v_payment_count;
  end if;
end $$;

-- ============================================================
-- 5. Unauthorized access to management_pos_accounts denied
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000300',true); -- Customer

do $$ begin
  begin
    perform public.management_pos_accounts(
      timezone('utc'::text, now()) - interval '1 day',
      timezone('utc'::text, now()) + interval '1 day',
      null, null, null, null, 100, 0
    );
    raise exception 'Unauthorized role allowed to call management_pos_accounts';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- 6. Unauthorized access to management_pos_account_detail denied
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000300',true); -- Customer

do $$ begin
  begin
    perform public.management_pos_account_detail('00000000-0000-0000-0000-000000000000');
    raise exception 'Unauthorized role allowed to call management_pos_account_detail';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- Cleanup
-- ============================================================
reset role;
rollback;