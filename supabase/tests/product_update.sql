-- Tests for 20260927210000_product_update_rpc.sql (Ticket DB-1).
-- Run against an isolated migrated database. All fixtures are rolled back.
begin;

-- ============================================================
-- Fixtures
-- ============================================================

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
('00000000-0000-0000-0000-000000000300', 'pu-customer@example.invalid', now(), '{"full_name":"Customer"}'),
('00000000-0000-0000-0000-000000000301', 'pu-admin@example.invalid', now(), '{"full_name":"Admin"}'),
('00000000-0000-0000-0000-000000000302', 'pu-ceo@example.invalid', now(), '{"full_name":"CEO"}');

update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000301';
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000302';

insert into public.categories(id, slug, name_he, name_en, is_active) values
('dddddddd-0000-0000-0000-000000000001', 'pu-cat-a', 'קטגוריה א', 'PU Cat A', true),
('dddddddd-0000-0000-0000-000000000009', 'pu-cat-cascade', 'קטגוריית מפל', 'PU Cascade cat', true);

-- P1: draft, complete record (content-edit target)
-- P2: active, complete record (active-invariant + archive/restore target)
-- P3: draft, empty name_he, otherwise publishable (final-state validation)
-- P4: draft, variant missing barcode (publish rejection, then repair)
-- P5: active product in the cascade category
-- P6: draft with two variants / two images (variant default + image meta tests)
insert into public.products(id, category_id, slug, name_he, name_en, price, tracking_mode) values
('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'pu-p1', 'מוצר אחד', 'Product One', 100.00, 'none'),
('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'pu-p2', 'מוצר שני', 'Product Two', 100.00, 'none'),
('eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001', 'pu-p3', '', 'Product Three', 100.00, 'none'),
('eeeeeeee-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000001', 'pu-p4', 'מוצר ארבע', 'Product Four', 100.00, 'none'),
('eeeeeeee-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000009', 'pu-p5', 'מוצר חמש', 'Product Five', 100.00, 'none'),
('eeeeeeee-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000001', 'pu-p6', 'מוצר שש', 'Product Six', 100.00, 'none');

update public.products set status = 'active'
where id in (
  'eeeeeeee-0000-0000-0000-000000000002',
  'eeeeeeee-0000-0000-0000-000000000005'
);

insert into public.product_variants(id, product_id, sku, barcode, is_active, is_default, stock_qty) values
('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'PU-SKU-1', 'PU-BC-1', true, true, 0),
('ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002', 'PU-SKU-2', 'PU-BC-2', true, true, 0),
('ffffffff-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000003', 'PU-SKU-3', 'PU-BC-3', true, true, 0),
('ffffffff-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000004', 'PU-SKU-4', null, true, true, 0),
('ffffffff-0000-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000005', 'PU-SKU-5', 'PU-BC-5', true, true, 0),
('ffffffff-0000-0000-0000-00000000006a', 'eeeeeeee-0000-0000-0000-000000000006', 'PU-SKU-6A', 'PU-BC-6A', true, true, 0),
('ffffffff-0000-0000-0000-00000000006b', 'eeeeeeee-0000-0000-0000-000000000006', 'PU-SKU-6B', 'PU-BC-6B', true, false, 0);

insert into public.product_images(id, product_id, image_url, sort_order) values
('99999999-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000006', 'https://example.invalid/a.jpg', 0),
('99999999-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000006', 'https://example.invalid/b.jpg', 1);

-- ============================================================
-- 1. Authorization: customers / anonymous cannot call the RPCs
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000300',true); -- customer

do $$ begin
  begin
    perform public.update_product('eeeeeeee-0000-0000-0000-000000000001', '{"brand":"x"}'::jsonb);
    raise exception 'Customer allowed to update product';
  exception when insufficient_privilege then null; end;
  begin
    perform public.upsert_product_price('eeeeeeee-0000-0000-0000-000000000001', 'customer', 10);
    raise exception 'Customer allowed to set price';
  exception when insufficient_privilege then null; end;
  begin
    perform public.update_variant('ffffffff-0000-0000-0000-000000000001', '{"sku":"x"}'::jsonb);
    raise exception 'Customer allowed to update variant';
  exception when insufficient_privilege then null; end;
  begin
    perform public.upsert_product_image_meta('99999999-0000-0000-0000-000000000001', '{"alt_he":"x"}'::jsonb);
    raise exception 'Customer allowed to update image';
  exception when insufficient_privilege then null; end;
  begin
    perform public.manage_category('create', null, '{"slug":"hack","name_he":"ח","name_en":"H"}'::jsonb);
    raise exception 'Customer allowed to manage category';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- 2. Status-unchanged save persists ALL whitelisted fields
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true); -- admin

do $$
declare
  v_row public.products;
begin
  v_row := public.update_product(
    'eeeeeeee-0000-0000-0000-000000000001',
    '{
      "name_he": "מוצר אחד מעודכן",
      "name_en": "Product One Updated",
      "slug": "pu-p1-updated",
      "brand": "BrandX",
      "model_number": "MX-1",
      "short_description_he": "תקציר",
      "short_description_en": "Summary",
      "description_he": "תיאור מלא",
      "description_en": "Full description",
      "tags": ["security", "indoor"],
      "warranty_he": "שנה",
      "warranty_en": "1 year",
      "sort_order": 7,
      "out_of_stock_policy": "hide_from_public",
      "is_featured": true,
      "seo_title_he": "כותרת סיאו",
      "seo_title_en": "SEO title",
      "seo_description_he": "תיאור סיאו",
      "seo_description_en": "SEO description",
      "price": 199.90,
      "compare_at_price": 249.90,
      "sale_price": 179.90,
      "purchase_cost": 50
    }'::jsonb
  );

  if v_row.status <> 'draft' then raise exception 'Status changed on plain save'; end if;
  if v_row.name_he <> 'מוצר אחד מעודכן' or v_row.name_en <> 'Product One Updated'
     or v_row.slug <> 'pu-p1-updated' or v_row.brand <> 'BrandX'
     or v_row.model_number <> 'MX-1' or v_row.short_description_he <> 'תקציר'
     or v_row.description_en <> 'Full description'
     or v_row.tags <> array['security','indoor']
     or v_row.warranty_en <> '1 year' or v_row.sort_order <> 7
     or v_row.out_of_stock_policy <> 'hide_from_public' or not v_row.is_featured
     or v_row.seo_title_en <> 'SEO title' or v_row.price <> 199.90
     or v_row.compare_at_price <> 249.90 or v_row.sale_price <> 179.90
     or v_row.purchase_cost <> 50.00 then
    raise exception 'Status-unchanged save did not persist all fields: %', v_row;
  end if;

  -- field-level clearing works too (jsonb null -> column null)
  v_row := public.update_product(
    'eeeeeeee-0000-0000-0000-000000000001',
    '{"sale_price": null, "warranty_en": null}'::jsonb
  );
  if v_row.sale_price is not null or v_row.warranty_en is not null then
    raise exception 'Null patch values not persisted';
  end if;

  -- exactly one audit row per call, with changed field names
  if (select count(*) from public.audit_events
      where action = 'product_updated'
        and entity_id = 'eeeeeeee-0000-0000-0000-000000000001') <> 2 then
    raise exception 'product_updated audit rows wrong';
  end if;
  if not exists (
    select 1 from public.audit_events
    where action = 'product_updated'
      and entity_id = 'eeeeeeee-0000-0000-0000-000000000001'
      and details->>'previous_status' = 'draft'
      and details->>'target_status' = 'draft'
      and details->'changed_fields' ? 'brand'
      and details->'changed_fields' ? 'sale_price'
      and not (details->'changed_fields' ? 'status')
  ) then
    raise exception 'Audit row missing changed field names';
  end if;
  if (select user_id from public.audit_events
      where action = 'product_updated'
        and entity_id = 'eeeeeeee-0000-0000-0000-000000000001'
      order by created_at desc limit 1) <> '00000000-0000-0000-0000-000000000301' then
    raise exception 'Audit actor is not the admin caller';
  end if;
end $$;

-- ============================================================
-- 3. Unknown keys are rejected (fixes the silent-discard bug)
-- ============================================================
do $$ begin
  begin
    perform public.update_product('eeeeeeee-0000-0000-0000-000000000001', '{"tracking_mode":"serial"}'::jsonb);
    raise exception 'Non-whitelisted field accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.update_product('eeeeeeee-0000-0000-0000-000000000001', '{"bogus_field":1}'::jsonb);
    raise exception 'Unknown field accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.update_product('eeeeeeee-0000-0000-0000-000000000001', '{"status":"retired"}'::jsonb);
    raise exception 'Invalid status accepted';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 4. Active product: invalid final state rejected, NOTHING persists
--    (fields rolled back atomically, no audit row written)
-- ============================================================
do $$
declare
  v_audit_count bigint;
  v_brand text;
begin
  select count(*) into v_audit_count
  from public.audit_events
  where action = 'product_updated'
    and entity_id = 'eeeeeeee-0000-0000-0000-000000000002';

  begin
    perform public.update_product(
      'eeeeeeee-0000-0000-0000-000000000002',
      '{"name_he": "", "brand": "ShouldNotPersist"}'::jsonb
    );
    raise exception 'Clearing name_he on active product allowed';
  exception when sqlstate '22023' then null; end;

  select brand into v_brand from public.products
  where id = 'eeeeeeee-0000-0000-0000-000000000002';
  if v_brand is not null then
    raise exception 'Failed save leaked field changes (brand=%)', v_brand;
  end if;

  if (select count(*) from public.audit_events
      where action = 'product_updated'
        and entity_id = 'eeeeeeee-0000-0000-0000-000000000002') <> v_audit_count then
    raise exception 'Failed save wrote an audit row';
  end if;
end $$;

-- ============================================================
-- 5. Status transitions validate the FINAL patched state
-- ============================================================
do $$
declare
  v_row public.products;
begin
  -- P4: variant has no barcode -> publish rejected
  begin
    perform public.update_product('eeeeeeee-0000-0000-0000-000000000004', '{"status":"active"}'::jsonb);
    raise exception 'Publish without barcode allowed';
  exception when sqlstate '22023' then null; end;
  if (select status from public.products where id = 'eeeeeeee-0000-0000-0000-000000000004') <> 'draft' then
    raise exception 'Rejected publish still changed status';
  end if;

  -- repair the variant transactionally, then publish succeeds
  perform public.update_variant('ffffffff-0000-0000-0000-000000000004', '{"barcode":"PU-BC-4"}'::jsonb);
  v_row := public.update_product('eeeeeeee-0000-0000-0000-000000000004', '{"status":"active"}'::jsonb);
  if v_row.status <> 'active' or not v_row.is_active then
    raise exception 'Valid publish via update_product failed';
  end if;
  if not exists (
    select 1 from public.audit_events
    where action = 'product_updated'
      and entity_id = 'eeeeeeee-0000-0000-0000-000000000004'
      and details->>'previous_status' = 'draft'
      and details->>'target_status' = 'active'
      and details->'changed_fields' ? 'status'
  ) then
    raise exception 'Publish transition audit wrong';
  end if;

  -- P3: empty name_he -> publish rejected even though patch is otherwise valid...
  begin
    perform public.update_product('eeeeeeee-0000-0000-0000-000000000003', '{"status":"active"}'::jsonb);
    raise exception 'Publish with empty name_he allowed';
  exception when sqlstate '22023' then null; end;

  -- ...but fixing the name in the SAME call passes: final state is validated
  v_row := public.update_product(
    'eeeeeeee-0000-0000-0000-000000000003',
    '{"name_he": "מוצר שלוש", "status": "active"}'::jsonb
  );
  if v_row.status <> 'active' or v_row.name_he <> 'מוצר שלוש' then
    raise exception 'Combined fix+publish did not validate final state';
  end if;

  -- consistency with products_guard_active_integrity: the content save fires
  -- while the row is still active, so blanking a name is rejected even when
  -- the same call also asks to leave the active state (atomic rejection)
  begin
    perform public.update_product(
      'eeeeeeee-0000-0000-0000-000000000003',
      '{"name_en": "", "status": "hidden"}'::jsonb
    );
    raise exception 'Blanking a name on an active product allowed';
  exception when sqlstate '22023' then null; end;
  if (select name_en from public.products where id = 'eeeeeeee-0000-0000-0000-000000000003') <> 'Product Three' then
    raise exception 'Rejected combined update leaked the name change';
  end if;
  if (select status from public.products where id = 'eeeeeeee-0000-0000-0000-000000000003') <> 'active' then
    raise exception 'Rejected combined update leaked the status change';
  end if;

  -- a clean hide transition works
  v_row := public.update_product('eeeeeeee-0000-0000-0000-000000000003', '{"status":"hidden"}'::jsonb);
  if v_row.status <> 'hidden' or v_row.is_active then
    raise exception 'Hide transition failed';
  end if;
end $$;

-- ============================================================
-- 6. Archived product: edit + restore path
-- ============================================================
do $$
declare
  v_row public.products;
begin
  v_row := public.update_product('eeeeeeee-0000-0000-0000-000000000002', '{"status":"archived"}'::jsonb);
  if v_row.status <> 'archived' then raise exception 'Archive transition failed'; end if;

  -- an archived product stays editable and can be restored when complete
  v_row := public.update_product(
    'eeeeeeee-0000-0000-0000-000000000002',
    '{"brand": "RestoredBrand", "status": "active"}'::jsonb
  );
  if v_row.status <> 'active' or v_row.brand <> 'RestoredBrand' then
    raise exception 'Archived edit+restore failed (status=%, brand=%)', v_row.status, v_row.brand;
  end if;
  if not exists (
    select 1 from public.audit_events
    where action = 'product_updated'
      and entity_id = 'eeeeeeee-0000-0000-0000-000000000002'
      and details->>'previous_status' = 'archived'
      and details->>'target_status' = 'active'
  ) then
    raise exception 'Restore audit row missing';
  end if;
end $$;

-- ============================================================
-- 7. Price contract: violations rejected with 23514, costs may be 0
-- ============================================================
reset role; -- constraint checks as superuser (table-level, role-independent)

do $$ begin
  -- products.price must be > 0 when not null
  begin
    update public.products set price = 0 where id = 'eeeeeeee-0000-0000-0000-000000000001';
    raise exception 'Zero base price allowed';
  exception when check_violation then null; end;

  -- sale_price must be > 0 when not null
  begin
    update public.products set sale_price = 0 where id = 'eeeeeeee-0000-0000-0000-000000000001';
    raise exception 'Zero sale price allowed';
  exception when check_violation then null; end;

  -- NEW: compare_at_price must exceed sale_price when both are set
  begin
    update public.products set sale_price = 100, compare_at_price = 90
    where id = 'eeeeeeee-0000-0000-0000-000000000001';
    raise exception 'compare_at_price <= sale_price allowed';
  exception when check_violation then null; end;

  -- equal prices are also rejected
  begin
    update public.products set sale_price = 100, compare_at_price = 100
    where id = 'eeeeeeee-0000-0000-0000-000000000001';
    raise exception 'compare_at_price = sale_price allowed';
  exception when check_violation then null; end;

  -- valid combination accepted
  update public.products set sale_price = 100, compare_at_price = 150
  where id = 'eeeeeeee-0000-0000-0000-000000000001';

  -- the new constraint was VALIDATEd (fixture data was clean)
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_compare_at_gt_sale' and convalidated
  ) then
    raise exception 'products_compare_at_gt_sale was not validated on clean data';
  end if;

  -- product_prices.price must be > 0
  begin
    insert into public.product_prices(product_id, role, price)
    values ('eeeeeeee-0000-0000-0000-000000000001', 'worker', 0);
    raise exception 'Zero role price allowed';
  exception when check_violation then null; end;

  -- variant price_override must be > 0 when not null
  begin
    update public.product_variants set price_override = 0
    where id = 'ffffffff-0000-0000-0000-000000000001';
    raise exception 'Zero price_override allowed';
  exception when check_violation then null; end;

  -- costs MAY be zero
  update public.products set purchase_cost = 0 where id = 'eeeeeeee-0000-0000-0000-000000000001';
  update public.product_variants set cost_override = 0
  where id = 'ffffffff-0000-0000-0000-000000000001';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true); -- admin

-- the RPC also enforces the contract with 22023 before writing
do $$ begin
  begin
    perform public.upsert_product_price('eeeeeeee-0000-0000-0000-000000000001', 'customer', 0);
    raise exception 'RPC accepted zero price';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 8. Category parent cycles are impossible (RPC and direct writes)
-- ============================================================
do $$
declare
  v_a uuid; v_b uuid; v_c uuid;
begin
  v_a := public.manage_category('create', null,
    '{"slug":"pu-chain-a","name_he":"שרשרת א","name_en":"Chain A"}'::jsonb);
  v_b := public.manage_category('create', null,
    jsonb_build_object('slug','pu-chain-b','name_he','שרשרת ב','name_en','Chain B','parent_id', v_a));
  v_c := public.manage_category('create', null,
    jsonb_build_object('slug','pu-chain-c','name_he','שרשרת ג','name_en','Chain C','parent_id', v_b));

  -- A->B->C exists; making A a child of C closes A->B->C->A
  begin
    perform public.manage_category('update', v_a, jsonb_build_object('parent_id', v_c));
    raise exception 'Category cycle accepted via RPC';
  exception when sqlstate '22023' then null; end;

  -- self-parent rejected
  begin
    perform public.manage_category('update', v_a, jsonb_build_object('parent_id', v_a));
    raise exception 'Self-parent accepted via RPC';
  exception when sqlstate '22023' then null; end;

  -- chain intact after rejections
  if (select parent_id from public.categories where id = v_a) is not null then
    raise exception 'Rejected cycle attempt changed parent_id';
  end if;

  -- unknown parent rejected
  begin
    perform public.manage_category('update', v_a,
      jsonb_build_object('parent_id', 'dddddddd-9999-9999-9999-999999999999'));
    raise exception 'Unknown parent accepted';
  exception when sqlstate '22023' then null; end;
end $$;

reset role;
do $$
declare
  v_a uuid; v_b uuid;
begin
  select id into v_a from public.categories where slug = 'pu-chain-a';
  select id into v_b from public.categories where slug = 'pu-chain-b';
  -- direct write path is guarded by the trigger as well
  begin
    update public.categories set parent_id = v_b where id = v_a;
    raise exception 'Category cycle accepted by direct write';
  exception when sqlstate '22023' then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true); -- admin

-- ============================================================
-- 9. manage_category: deactivate cascades to hidden, reactivate returns
-- ============================================================
do $$ begin
  perform public.manage_category('deactivate', 'dddddddd-0000-0000-0000-000000000009');

  if (select is_active from public.categories where id = 'dddddddd-0000-0000-0000-000000000009') then
    raise exception 'Category not deactivated';
  end if;
  -- existing cascade trigger fired: active product in that category -> hidden
  if (select status from public.products where id = 'eeeeeeee-0000-0000-0000-000000000005') <> 'hidden' then
    raise exception 'Category deactivation did not cascade to hidden';
  end if;
  if not exists (
    select 1 from public.audit_events
    where action = 'product_auto_unpublished'
      and entity_id = 'eeeeeeee-0000-0000-0000-000000000005'
      and details->>'reason' = 'category_deactivated'
  ) then
    raise exception 'Cascade audit row missing';
  end if;
  if not exists (
    select 1 from public.audit_events
    where action = 'category_deactivated'
      and entity_id = 'dddddddd-0000-0000-0000-000000000009'
  ) then
    raise exception 'category_deactivated audit row missing';
  end if;

  perform public.manage_category('reactivate', 'dddddddd-0000-0000-0000-000000000009');
  if not (select is_active from public.categories where id = 'dddddddd-0000-0000-0000-000000000009') then
    raise exception 'Category not reactivated';
  end if;

  -- a deactivated category does not satisfy publish validation
  perform public.manage_category('deactivate', 'dddddddd-0000-0000-0000-000000000009');
  begin
    perform public.update_product('eeeeeeee-0000-0000-0000-000000000005', '{"status":"active"}'::jsonb);
    raise exception 'Publish into inactive category allowed';
  exception when sqlstate '22023' then null; end;
  perform public.manage_category('reactivate', 'dddddddd-0000-0000-0000-000000000009');

  -- invalid action rejected
  begin
    perform public.manage_category('obliterate', 'dddddddd-0000-0000-0000-000000000009');
    raise exception 'Invalid category action accepted';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 10. upsert_product_price: set / replace / remove, one transaction
-- (RLS hides role='customer' rows from the admin caller, so all
-- table-state assertions run as superuser after reset role.)
-- ============================================================
do $$ begin
  perform public.upsert_product_price('eeeeeeee-0000-0000-0000-000000000001', 'customer', 120.00);
  perform public.upsert_product_price('eeeeeeee-0000-0000-0000-000000000001', 'customer', 99.00);
end $$;
reset role;
do $$ begin
  if (select price from public.product_prices
      where product_id = 'eeeeeeee-0000-0000-0000-000000000001' and role = 'customer') <> 99.00 then
    raise exception 'Role price not set/replaced';
  end if;
  if (select count(*) from public.product_prices
      where product_id = 'eeeeeeee-0000-0000-0000-000000000001' and role = 'customer') <> 1 then
    raise exception 'Duplicate role price rows';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true); -- admin
do $$ begin
  begin
    perform public.upsert_product_price('eeeeeeee-0000-0000-0000-000000000001', 'superadmin', 10);
    raise exception 'Invalid price role accepted';
  exception when sqlstate '22023' then null; end;

  -- NULL price removes the row (not-published convention)
  perform public.upsert_product_price('eeeeeeee-0000-0000-0000-000000000001', 'customer', null);
end $$;
reset role;
do $$ begin
  if exists (
    select 1 from public.product_prices
    where product_id = 'eeeeeeee-0000-0000-0000-000000000001' and role = 'customer'
  ) then
    raise exception 'NULL price did not remove the row';
  end if;

  if not exists (select 1 from public.audit_events where action = 'product_price_set'
                 and entity_id = 'eeeeeeee-0000-0000-0000-000000000001')
     or not exists (select 1 from public.audit_events where action = 'product_price_removed'
                    and entity_id = 'eeeeeeee-0000-0000-0000-000000000001') then
    raise exception 'Price audit rows missing';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true); -- admin again for section 11

-- ============================================================
-- 11. update_variant: metadata edit, stock_qty unreachable, defaults flip
-- ============================================================
do $$
declare
  v_row public.product_variants;
begin
  v_row := public.update_variant(
    'ffffffff-0000-0000-0000-000000000001',
    '{"sku":"PU-SKU-1-NEW","color_en":"Black","color_hex":"#000000","price_override":149.90,"cost_override":20,"low_stock_threshold":2}'::jsonb
  );
  if v_row.sku <> 'PU-SKU-1-NEW' or v_row.color_en <> 'Black'
     or v_row.color_hex <> '#000000' or v_row.price_override <> 149.90
     or v_row.cost_override <> 20.00 or v_row.low_stock_threshold <> 2 then
    raise exception 'Variant patch not persisted: %', v_row;
  end if;

  -- stock_qty is not reachable through this RPC
  begin
    perform public.update_variant('ffffffff-0000-0000-0000-000000000001', '{"stock_qty": 99}'::jsonb);
    raise exception 'stock_qty editable via update_variant';
  exception when sqlstate '22023' then null; end;
  if (select stock_qty from public.product_variants where id = 'ffffffff-0000-0000-0000-000000000001') <> 0 then
    raise exception 'stock_qty changed via update_variant';
  end if;

  -- zero price_override rejected by the check constraint (23514)
  begin
    perform public.update_variant('ffffffff-0000-0000-0000-000000000001', '{"price_override": 0}'::jsonb);
    raise exception 'Zero price_override accepted via RPC';
  exception when check_violation then null; end;

  -- default flip is atomic: 6a loses default, 6b gains it
  v_row := public.update_variant('ffffffff-0000-0000-0000-00000000006b', '{"is_default": true}'::jsonb);
  if not v_row.is_default then raise exception 'Default not set on 6b'; end if;
  if (select is_default from public.product_variants where id = 'ffffffff-0000-0000-0000-00000000006a') then
    raise exception 'Sibling default not cleared';
  end if;

  if not exists (
    select 1 from public.audit_events
    where action = 'variant_updated'
      and entity_id = 'ffffffff-0000-0000-0000-000000000001'
      and details->'changed_fields' ? 'sku'
  ) then
    raise exception 'variant_updated audit row missing';
  end if;
end $$;

-- ============================================================
-- 12. upsert_product_image_meta: alt/order/primary
-- ============================================================
do $$
declare
  v_row public.product_images;
begin
  v_row := public.upsert_product_image_meta(
    '99999999-0000-0000-0000-000000000002',
    '{"alt_he":"תמונה ב","alt_en":"Image B","sort_order":5}'::jsonb
  );
  if v_row.alt_he <> 'תמונה ב' or v_row.alt_en <> 'Image B' or v_row.sort_order <> 5 then
    raise exception 'Image meta not persisted: %', v_row;
  end if;

  -- primary convention: lowest sort_order wins
  v_row := public.upsert_product_image_meta(
    '99999999-0000-0000-0000-000000000002',
    '{"is_primary": true}'::jsonb
  );
  if v_row.sort_order >= (select sort_order from public.product_images
                          where id = '99999999-0000-0000-0000-000000000001') then
    raise exception 'is_primary did not move image below current minimum (got %)', v_row.sort_order;
  end if;

  begin
    perform public.upsert_product_image_meta('99999999-0000-0000-0000-000000000001', '{"image_url":"https://x.invalid/y.jpg"}'::jsonb);
    raise exception 'Non-meta image field accepted';
  exception when sqlstate '22023' then null; end;

  if not exists (
    select 1 from public.audit_events
    where action = 'product_image_updated'
      and entity_id = 'eeeeeeee-0000-0000-0000-000000000006'
      and details->'changed_fields' ? 'is_primary'
  ) then
    raise exception 'product_image_updated audit row missing';
  end if;
end $$;

-- ============================================================
-- 13. CEO role also authorized (role model parity)
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000302',true); -- CEO
do $$
declare
  v_row public.products;
begin
  v_row := public.update_product('eeeeeeee-0000-0000-0000-000000000001', '{"brand":"CeoBrand"}'::jsonb);
  if v_row.brand <> 'CeoBrand' then raise exception 'CEO update_product failed'; end if;
  if (select user_id from public.audit_events
      where action = 'product_updated' and entity_id = 'eeeeeeee-0000-0000-0000-000000000001'
      order by created_at desc limit 1) <> '00000000-0000-0000-0000-000000000302' then
    raise exception 'CEO audit actor mismatch';
  end if;
end $$;

reset role;

do $$ begin
  raise notice 'product_update.sql: all tests passed';
end $$;

rollback;
