-- Hardening tests for 20260927090000 / 20260927100000 / 20260927110000.
-- Run against an isolated migrated database. All fixtures are rolled back.
begin;

-- ============================================================
-- Fixtures
-- ============================================================

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
('00000000-0000-0000-0000-000000000200', 'h-customer@example.invalid', now(), '{"full_name":"Customer"}'),
('00000000-0000-0000-0000-000000000201', 'h-admin@example.invalid', now(), '{"full_name":"Admin"}'),
('00000000-0000-0000-0000-000000000202', 'h-ceo@example.invalid', now(), '{"full_name":"CEO"}'),
('00000000-0000-0000-0000-000000000203', 'h-suspended@example.invalid', now(), '{"full_name":"Suspended"}');

update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000201';
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000202';
update public.profiles set account_status='suspended' where id='00000000-0000-0000-0000-000000000203';

insert into public.categories(id, slug, name_he, name_en, is_active) values
('aaaaaaaa-0000-0000-0000-000000000001', 'hd-cat-active', 'פעיל', 'Active cat', true),
('aaaaaaaa-0000-0000-0000-000000000002', 'hd-cat-inactive', 'לא פעיל', 'Inactive cat', false),
('aaaaaaaa-0000-0000-0000-000000000003', 'hd-cat-deactivate', 'לכיבוי', 'Deactivate cat', true);

-- New products must enter as draft (products_enforce_insert_draft_trg)
insert into public.products(id, category_id, slug, name_he, name_en, price, tracking_mode) values
('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'hd-product-a', 'מוצר קשיחות', 'Hardening A', 100.00, 'none'),
('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'hd-product-inactive-cat', 'קטגוריה כבויה', 'Inactive cat product', 10.00, 'none'),
('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'hd-product-publish-ok', 'פרסום תקין', 'Publish ok', 10.00, 'none'),
('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'hd-product-single-variant', 'וריאנט יחיד', 'Single variant', 10.00, 'none'),
('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'hd-product-two-variants', 'שני וריאנטים', 'Two variants', 10.00, 'none'),
('bbbbbbbb-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000003', 'hd-product-cat-off', 'קטגוריה תכבה', 'Category off', 10.00, 'none');

update public.products set status = 'active'
where id in (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000004',
  'bbbbbbbb-0000-0000-0000-000000000005',
  'bbbbbbbb-0000-0000-0000-000000000006'
);

insert into public.product_variants(id, product_id, sku, barcode, is_active, stock_qty) values
('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'HD-SKU-1', 'HD-BC-1', true, 10),
('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'HD-SKU-2', 'HD-BC-2', true, 1),
('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'HD-SKU-3', 'HD-BC-3', true, 0),
('cccccccc-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000004', 'HD-SKU-4', 'HD-BC-4', true, 0),
('cccccccc-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000005', 'HD-SKU-5', 'HD-BC-5', true, 0),
('cccccccc-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000005', 'HD-SKU-6', 'HD-BC-6', true, 0),
('cccccccc-0000-0000-0000-000000000007', 'bbbbbbbb-0000-0000-0000-000000000003', 'HD-SKU-7', 'HD-BC-7', true, 0);

-- ============================================================
-- 1. INSERT product with status = 'active' rejected (22023)
-- ============================================================
do $$ begin
  begin
    insert into public.products(category_id, slug, name_he, name_en, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'hd-product-born-active', 'ז', 'Born active', 'active');
    raise exception 'INSERT with active status allowed';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 2. product_prices: zero rejected, positive accepted
-- ============================================================
do $$ begin
  begin
    insert into public.product_prices(product_id, role, price)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'customer', 0);
    raise exception 'Zero role price allowed';
  exception when check_violation then null; end;

  insert into public.product_prices(product_id, role, price)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'customer', 120.00);
end $$;

-- Whitelisted public contact config (verified later as anon)
insert into public.business_settings(key, value) values
('public_contact', '{"phone": "+972-50-0000000", "whatsapp": "972500000000", "email": "info@example.invalid", "address_he": "רחוב 1", "internal_note": "must not leak"}'::jsonb);

-- ============================================================
-- 3. Sales identity: customer vs recorded_by, guest sale, invalid customer
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000202',true); -- CEO

do $$
declare
  v_order_id uuid;
  v_order record;
  v_item record;
begin
  -- (a) associated customer: user_id = customer account, recorded_by = CEO,
  --     missing email snapshot filled from auth.users
  v_order_id := public.record_sale(
    '{"customer_id": "00000000-0000-0000-0000-000000000200", "name": "Customer"}'::jsonb,
    '[{"variant_id": "cccccccc-0000-0000-0000-000000000001", "quantity": 1, "unit_price": 50}]'::jsonb
  );
  select * into v_order from public.orders where id = v_order_id;
  if v_order.user_id is distinct from '00000000-0000-0000-0000-000000000200' then
    raise exception 'Customer account not linked';
  end if;
  if v_order.recorded_by is distinct from '00000000-0000-0000-0000-000000000202' then
    raise exception 'Recorder mismatch';
  end if;
  if v_order.customer_email is distinct from 'h-customer@example.invalid' then
    raise exception 'Email snapshot not filled from account';
  end if;

  -- (b) suspended customer account rejected
  begin
    perform public.record_sale(
      '{"customer_id": "00000000-0000-0000-0000-000000000203", "name": "Suspended"}'::jsonb,
      '[{"variant_id": "cccccccc-0000-0000-0000-000000000001", "quantity": 1, "unit_price": 50}]'::jsonb
    );
    raise exception 'Suspended customer accepted';
  exception when sqlstate '22023' then null; end;

  -- (c) guest sale: no customer account
  v_order_id := public.record_sale(
    '{"name": "Guest Buyer", "email": "guest@example.invalid"}'::jsonb,
    '[{"variant_id": "cccccccc-0000-0000-0000-000000000001", "quantity": 1, "unit_price": 50}]'::jsonb
  );
  select * into v_order from public.orders where id = v_order_id;
  if v_order.user_id is not null then raise exception 'Guest sale linked a user'; end if;
  if v_order.recorded_by is distinct from '00000000-0000-0000-0000-000000000202' then
    raise exception 'Guest recorder mismatch';
  end if;

  -- (d) per-unit discount math: qty 3, unit 100, dpu 10 -> discount 30, line gross 270
  v_order_id := public.record_sale(
    '{"name": "Discounted"}'::jsonb,
    '[{"variant_id": "cccccccc-0000-0000-0000-000000000001", "quantity": 3, "unit_price": 100, "discount_per_unit": 10}]'::jsonb
  );
  select * into v_item from public.order_items where order_id = v_order_id;
  if v_item.discount_amount <> 30.00 then raise exception 'Line discount wrong: %', v_item.discount_amount; end if;
  if v_item.total_price <> 270.00 then raise exception 'Line gross wrong: %', v_item.total_price; end if;
  if abs(v_item.net_amount - 228.81) > 0.01 then raise exception 'Line net wrong'; end if;
  select * into v_order from public.orders where id = v_order_id;
  if v_order.total <> 270.00 then raise exception 'Order total wrong'; end if;
  if v_order.total < 0 or v_order.net_total < 0 or v_order.vat_total < 0 then
    raise exception 'Negative totals';
  end if;

  -- (e) discount_per_unit greater than unit_price rejected
  begin
    perform public.record_sale(
      '{"name": "Bad discount"}'::jsonb,
      '[{"variant_id": "cccccccc-0000-0000-0000-000000000001", "quantity": 1, "unit_price": 10, "discount_per_unit": 15}]'::jsonb
    );
    raise exception 'Over-discount accepted';
  exception when sqlstate '22023' then null; end;

  -- (f) legacy per-line "discount" key rejected
  begin
    perform public.record_sale(
      '{"name": "Legacy"}'::jsonb,
      '[{"variant_id": "cccccccc-0000-0000-0000-000000000001", "quantity": 1, "unit_price": 100, "discount": 10}]'::jsonb
    );
    raise exception 'Legacy discount key accepted';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 4. Stock movement sign enforcement + no-negative invariant
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000201',true); -- admin

do $$ begin
  -- Positive-only types reject negative deltas
  begin
    perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', -1, 'purchase_receipt', null, null, null);
    raise exception 'Negative purchase_receipt accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', -1, 'reservation_release', null, null, null);
    raise exception 'Negative reservation_release accepted';
  exception when sqlstate '22023' then null; end;

  -- Negative-only types reject positive deltas
  begin
    perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', 1, 'sale', null, null, null);
    raise exception 'Positive sale accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', 1, 'reservation', null, null, null);
    raise exception 'Positive reservation accepted';
  exception when sqlstate '22023' then null; end;

  -- Zero delta rejected
  begin
    perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', 0, 'manual_adjustment', null, null, null);
    raise exception 'Zero delta accepted';
  exception when sqlstate '22023' then null; end;

  -- Valid directions work (stock 1 -> 3 -> 1 -> 0)
  perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', 2, 'purchase_receipt', null, null, null);
  begin
    perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', -4, 'sale', null, null, null);
    raise exception 'Oversell accepted';
  exception when sqlstate '22023' then null; end;
  perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', -2, 'sale', null, null, null);
  perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', -1, 'transfer_out', null, null, null);
  if (select stock_qty from public.product_variants where id = 'cccccccc-0000-0000-0000-000000000002') <> 0 then
    raise exception 'Movement sequence wrong';
  end if;

  -- Either-sign types still cannot drive physical stock negative
  begin
    perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', -1, 'manual_adjustment', null, 'underflow', null);
    raise exception 'Negative final stock accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.record_stock_movement('cccccccc-0000-0000-0000-000000000002', -1, 'stocktake_correction', null, 'underflow', null);
    raise exception 'Negative correction accepted';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 5. adjust_stock lands on exactly the counted quantity
-- ============================================================
do $$ begin
  perform public.adjust_stock('cccccccc-0000-0000-0000-000000000002', 6, 'Cycle count');
  if (select stock_qty from public.product_variants where id = 'cccccccc-0000-0000-0000-000000000002') <> 6 then
    raise exception 'adjust_stock did not land on counted quantity';
  end if;
  if (select resulting_qty from public.stock_movements
      where variant_id = 'cccccccc-0000-0000-0000-000000000002' and type = 'stocktake_correction'
      order by created_at desc limit 1) <> 6 then
    raise exception 'adjust_stock movement snapshot wrong';
  end if;

  begin
    perform public.adjust_stock('cccccccc-0000-0000-0000-000000000002', 6, 'No change');
    raise exception 'No-change adjust accepted';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.adjust_stock('cccccccc-0000-0000-0000-000000000002', -1, 'Negative count');
    raise exception 'Negative count accepted';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 6. publish_product requires an active category
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000202',true); -- CEO
do $$ begin
  begin
    perform public.publish_product('bbbbbbbb-0000-0000-0000-000000000002');
    raise exception 'Publish with inactive category allowed';
  exception when sqlstate '22023' then null; end;

  perform public.publish_product('bbbbbbbb-0000-0000-0000-000000000003');
  if (select status from public.products where id = 'bbbbbbbb-0000-0000-0000-000000000003') <> 'active' then
    raise exception 'Valid publish failed';
  end if;
end $$;

-- ============================================================
-- 7. Last valid variant removal auto-unpublishes its product
-- ============================================================
reset role;
do $$ begin
  -- two-variant product survives removing one variant
  update public.product_variants set is_active = false
  where id = 'cccccccc-0000-0000-0000-000000000005';
  if (select status from public.products where id = 'bbbbbbbb-0000-0000-0000-000000000005') <> 'active' then
    raise exception 'Product unpublished while a valid variant remained';
  end if;

  -- last valid variant removed -> auto hidden + audit
  update public.product_variants set is_active = false
  where id = 'cccccccc-0000-0000-0000-000000000004';
  if (select status from public.products where id = 'bbbbbbbb-0000-0000-0000-000000000004') <> 'hidden' then
    raise exception 'Auto-unpublish on last variant removal failed';
  end if;
  if not exists (
    select 1 from public.audit_events
    where action = 'product_auto_unpublished'
      and entity_id = 'bbbbbbbb-0000-0000-0000-000000000004'
      and details->>'reason' = 'last_valid_variant_removed'
  ) then
    raise exception 'Auto-unpublish audit missing';
  end if;
end $$;

-- ============================================================
-- 8. Category deactivation unpublishes its active products
-- ============================================================
do $$ begin
  update public.categories set is_active = false
  where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  if (select status from public.products where id = 'bbbbbbbb-0000-0000-0000-000000000006') <> 'hidden' then
    raise exception 'Category deactivation did not unpublish active product';
  end if;
  if not exists (
    select 1 from public.audit_events
    where action = 'product_auto_unpublished'
      and entity_id = 'bbbbbbbb-0000-0000-0000-000000000006'
      and details->>'reason' = 'category_deactivated'
  ) then
    raise exception 'Category deactivation audit missing';
  end if;
end $$;

-- ============================================================
-- 9. Anonymous analytics consumers cannot write sale/return events
-- ============================================================
set local role anon;
select set_config('request.jwt.claim.sub','',true); -- clear stale claim from earlier sections; anon has no JWT
do $$ begin
  begin
    insert into public.analytics_events(event_type) values ('sale');
    raise exception 'Anon sale event accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.analytics_events(event_type) values ('return');
    raise exception 'Anon return event accepted';
  exception when insufficient_privilege then null; end;

  -- public browsing events still work
  insert into public.analytics_events(event_type, session_id) values ('product_view', 'hd-session-1');
end $$;

-- Public contact config: whitelisted fields only, nothing else exposed
do $$
declare v_config jsonb;
begin
  v_config := public.get_public_contact_config();
  if v_config->>'phone' is distinct from '+972-50-0000000' then
    raise exception 'Contact config phone missing';
  end if;
  if v_config ? 'internal_note' then
    raise exception 'Contact config leaked non-whitelisted field';
  end if;
end $$;

-- Anonymous enquiry intake: succeeds with caps; cannot self-triage
do $$ begin
  insert into public.service_requests(name, email, message, locale, status, assigned_to)
  values ('Anon Visitor', 'anon@example.invalid', 'Please contact me', 'he', 'spam',
          '00000000-0000-0000-0000-000000000201');
end $$;
reset role;
do $$ begin
  if not exists (
    select 1 from public.service_requests
    where email = 'anon@example.invalid' and status = 'new'
      and assigned_to is null
  ) then
    raise exception 'Anon request triage fields not forced';
  end if;
end $$;

-- ============================================================
-- 10. CEO-only controls reject non-CEO callers
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000201',true); -- admin
do $$ begin
  begin
    perform public.add_ceo('h-customer@example.invalid');
    raise exception 'Admin allowed to add CEO';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_tax_rate('Hack VAT', 12.00, current_date);
    raise exception 'Admin allowed to set tax rate';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_business_setting('hacked', '"yes"'::jsonb);
    raise exception 'Admin allowed to set business setting';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- 11. Management aggregation RPCs: authorized roles only, correct math
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000200',true); -- customer
do $$ begin
  begin
    perform public.management_sales_summary('2020-01-01'::timestamptz, '2100-01-01'::timestamptz);
    raise exception 'Customer read sales summary';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000202',true); -- CEO
do $$
declare v_summary jsonb; v_inventory jsonb;
begin
  v_summary := public.management_sales_summary('2020-01-01'::timestamptz, '2100-01-01'::timestamptz);
  -- three completed sales above: 50 + 50 + 270 = 370 gross over 3 orders / 5 units
  if (v_summary #>> '{current,orders_count}')::bigint <> 3 then
    raise exception 'Sales summary order count wrong: %', v_summary;
  end if;
  if (v_summary #>> '{current,gross_total}')::numeric <> 370.00 then
    raise exception 'Sales summary gross wrong: %', v_summary;
  end if;
  if (v_summary #>> '{current,items_count}')::bigint <> 5 then
    raise exception 'Sales summary items wrong: %', v_summary;
  end if;
  if (v_summary #>> '{previous,orders_count}')::bigint <> 0 then
    raise exception 'Previous period not empty';
  end if;

  -- page_size hard-capped at 100
  v_inventory := public.management_inventory_list(null, null, 1, 500);
  if (v_inventory->>'page_size')::integer <> 100 then raise exception 'Page size cap failed'; end if;

  -- DB-side status filter: 'out' finds the zero-stock variants only
  v_inventory := public.management_inventory_list(null, 'out', 1, 25);
  if (v_inventory->>'total_count')::bigint <> 5 then
    raise exception 'Out-of-stock filter wrong: %', v_inventory;
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_inventory->'items') i
    where i->>'status' <> 'out'
  ) then raise exception 'Out filter leaked other statuses'; end if;

  -- DB-side search over SKU
  v_inventory := public.management_inventory_list('HD-SKU-1', null, 1, 25);
  if (v_inventory->>'total_count')::bigint <> 1 then raise exception 'SKU search wrong'; end if;

  begin
    perform public.management_inventory_list(null, 'bogus', 1, 25);
    raise exception 'Invalid inventory status accepted';
  exception when sqlstate '22023' then null; end;
end $$;

reset role;
rollback;
