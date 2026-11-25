begin;

insert into auth.users(id, email, email_confirmed_at) values
  ('a8400000-0000-4000-8000-000000000001', 'threshold-ceo@example.invalid', now()),
  ('a8400000-0000-4000-8000-000000000002', 'threshold-admin@example.invalid', now());
update public.user_roles set role = 'ceo' where user_id = 'a8400000-0000-4000-8000-000000000001';
update public.user_roles set role = 'admin' where user_id = 'a8400000-0000-4000-8000-000000000002';
insert into public.categories(id, slug, name_he, name_en)
values ('a8400000-0000-4000-8000-000000000003', 'threshold-qa', 'בדיקה', 'QA');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8400000-0000-4000-8000-000000000001', true);
select public.set_business_setting('inventory_defaults', '{"low_stock_threshold":7,"out_of_stock_policy":"keep_visible_contact"}');

select set_config('request.jwt.claim.sub', 'a8400000-0000-4000-8000-000000000002', true);
do $$
declare
  product public.products;
  inherited public.product_variants;
  overridden public.product_variants;
begin
  product := public.create_catalog_product('threshold-qa', 'בדיקה', 'QA', 'a8400000-0000-4000-8000-000000000003');
  perform set_config('miro.qa_threshold_product', product.id::text, true);
  inherited := public.create_catalog_variant_with_stock(jsonb_build_object(
    'product_id', product.id, 'sku', 'THRESHOLD-QA-DEFAULT',
    'is_default', true, 'initial_stock_qty', 7
  ));
  if inherited.low_stock_threshold <> 7 or inherited.stock_qty <> 7 or not inherited.is_default then
    raise exception 'First variant did not inherit the saved threshold';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.management_inventory_variant_list('THRESHOLD-QA-DEFAULT', 'low', 1, 10)->'items') item
    where (item->>'variant_id')::uuid = inherited.id
  ) then
    raise exception 'Inventory did not recognize stock at the saved threshold as low';
  end if;

  overridden := public.create_catalog_variant(jsonb_build_object(
    'product_id', product.id, 'sku', 'THRESHOLD-QA-ZERO', 'low_stock_threshold', 0
  ));
  if overridden.low_stock_threshold <> 0 then
    raise exception 'Explicit threshold zero was replaced';
  end if;
  overridden := public.create_catalog_variant(jsonb_build_object(
    'product_id', product.id, 'sku', 'THRESHOLD-QA-OVERRIDE', 'low_stock_threshold', 9
  ));
  if overridden.low_stock_threshold <> 9 then
    raise exception 'Explicit positive threshold was replaced';
  end if;
  if has_function_privilege('authenticated', 'public.catalog_variant_low_stock_default()', 'EXECUTE') or
     has_function_privilege('anon', 'public.catalog_variant_low_stock_default()', 'EXECUTE') then
    raise exception 'Private column default is browser-callable';
  end if;
end $$;

set local role service_role;
do $$
declare threshold integer;
begin
  insert into public.product_variants(product_id, sku)
  values (current_setting('miro.qa_threshold_product')::uuid, 'THRESHOLD-QA-DIRECT')
  returning low_stock_threshold into threshold;
  if threshold <> 7 then
    raise exception 'Omitted threshold did not use the column default';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8400000-0000-4000-8000-000000000001', true);
select public.set_business_setting('inventory_defaults', '{"low_stock_threshold":0,"out_of_stock_policy":"keep_visible_contact"}');

select set_config('request.jwt.claim.sub', 'a8400000-0000-4000-8000-000000000002', true);
do $$
declare variant public.product_variants;
begin
  variant := public.create_catalog_variant(jsonb_build_object(
    'product_id', current_setting('miro.qa_threshold_product')::uuid, 'sku', 'THRESHOLD-QA-LATEST'
  ));
  if variant.low_stock_threshold <> 0 then
    raise exception 'A saved zero business default did not reach the next creation';
  end if;
end $$;

reset role;
update public.business_settings set value = '{"low_stock_threshold":"invalid legacy value"}' where key = 'inventory_defaults';
set local role service_role;
do $$
declare threshold integer;
begin
  if (select low_stock_threshold from public.product_variants where sku = 'THRESHOLD-QA-DEFAULT') is distinct from 7 then
    raise exception 'Saving a default modified an existing threshold';
  end if;
  insert into public.product_variants(product_id, sku)
  values (current_setting('miro.qa_threshold_product')::uuid, 'THRESHOLD-QA-FALLBACK')
  returning low_stock_threshold into threshold;
  if threshold <> 3 then
    raise exception 'An invalid legacy business default did not use the standard fallback';
  end if;
end $$;

rollback;
