-- AUDIT REPRODUCTION ONLY: run in a fresh disposable database after all MIRO
-- migrations, with the auth/role shim from scripts/verify-database.py.
-- Never run on a linked/staging/production business database.
-- A true result below demonstrates the pre-fix defect, not correct behavior.
-- The numeric tax rates are arbitrary test inputs, not tax advice.
begin;

insert into auth.users(id,email,email_confirmed_at)
values ('11111111-1111-4111-8111-111111111111','audit@example.invalid',now());
update public.user_roles set role='ceo'
where user_id='11111111-1111-4111-8111-111111111111';

insert into public.categories(id,slug,name_he,name_en,is_active)
values ('22222222-2222-4222-8222-222222222222','audit-only','audit','audit',true);
insert into public.products(id,category_id,slug,name_he,name_en,price,purchase_cost,status,tracking_mode)
values ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','audit-only','audit','audit',100,37,'draft','none');
insert into public.product_variants(id,product_id,sku,barcode,cost_override,supplier_sku,is_active)
values ('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','audit-sku','audit-barcode',31,'internal-supplier-code',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.publish_product('33333333-3333-4333-8333-333333333333');
select public.set_tax_rate('audit-current',17,current_date);
select public.set_tax_rate('audit-future',18,current_date+30);
select public.current_tax_rate() is null as future_tax_leaves_no_current_rate;

select public.record_sale(
  '{"name":"audit guest","email":"guest@example.invalid"}'::jsonb,
  '[{"variant_id":"44444444-4444-4444-8444-444444444444","quantity":1,"unit_price":100}]'::jsonb
);
select public.record_sale(
  '{"name":"audit guest","email":"guest@example.invalid"}'::jsonb,
  '[{"variant_id":"44444444-4444-4444-8444-444444444444","quantity":1,"unit_price":100}]'::jsonb
);
reset role;
select count(*)=2 as repeated_command_creates_two_sales,
  bool_and(vat_total=0) as sales_after_scheduling_use_zero_vat
from public.orders where customer_name='audit guest';
select stock_qty=0 as none_mode_stock_unchanged_after_two_sales
from public.product_variants where id='44444444-4444-4444-8444-444444444444';

select set_config('request.jwt.claim.sub','',true);
set local role anon;
select purchase_cost=37 as anon_can_read_purchase_cost
from public.products where id='33333333-3333-4333-8333-333333333333';
select cost_override=31 as anon_can_read_variant_cost,
  supplier_sku='internal-supplier-code' as anon_can_read_supplier_sku
from public.product_variants where id='44444444-4444-4444-8444-444444444444';
insert into public.analytics_events(event_type,user_id,session_id)
values ('product_view','11111111-1111-4111-8111-111111111111','audit-forged-identity');
reset role;
select count(*)=1 as anon_forged_analytics_identity
from public.analytics_events where session_id='audit-forged-identity';

rollback;
