-- Worker has the same account access as a customer, with a distinct role price.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('dd100000-0000-4000-8000-000000000001','worker-customer@example.invalid',now(),'{}'),
 ('dd100000-0000-4000-8000-000000000002','other-customer@example.invalid',now(),'{}'),
 ('dd100000-0000-4000-8000-000000000003','worker-admin@example.invalid',now(),'{}');
update public.user_roles set role='worker' where user_id='dd100000-0000-4000-8000-000000000001';
update public.user_roles set role='admin' where user_id='dd100000-0000-4000-8000-000000000003';
insert into public.categories(id,slug,name_he,name_en) values
 ('dd200000-0000-4000-8000-000000000001','worker-pricing-test','בדיקה','Test');
insert into public.products(id,category_id,slug,name_he,name_en,price) values
 ('dd300000-0000-4000-8000-000000000001','dd200000-0000-4000-8000-000000000001','worker-pricing-test','בדיקה','Test',100);
update public.products set status='active' where id='dd300000-0000-4000-8000-000000000001';
insert into public.product_prices(product_id,role,price) values
 ('dd300000-0000-4000-8000-000000000001','worker',80),
 ('dd300000-0000-4000-8000-000000000001','customer',100);
insert into public.service_requests(id,customer_id,name,email,message) values
 ('dd400000-0000-4000-8000-000000000001','dd100000-0000-4000-8000-000000000001','Worker','worker-customer@example.invalid','My own request'),
 ('dd400000-0000-4000-8000-000000000002','dd100000-0000-4000-8000-000000000002','Other','other-customer@example.invalid','Private request');
update public.service_requests set assigned_to='dd100000-0000-4000-8000-000000000001'
 where id='dd400000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','dd100000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.service_requests) <> 1
    or not exists(select 1 from public.service_requests where id='dd400000-0000-4000-8000-000000000001') then
   raise exception 'Worker own-request isolation failed';
 end if;
 if (select price from public.product_prices where product_id='dd300000-0000-4000-8000-000000000001' and role='worker') <> 80 then
   raise exception 'Worker price not available';
 end if;
 if exists(select 1 from public.product_prices where product_id='dd300000-0000-4000-8000-000000000001' and role='customer') then
   raise exception 'Worker can read another role price';
 end if;
 begin
   perform public.update_service_request('dd400000-0000-4000-8000-000000000002','closed',null);
   raise exception 'Worker updated an assigned request';
 exception when insufficient_privilege then null; end;
 begin
   perform public.update_service_request_management_core('dd400000-0000-4000-8000-000000000002','closed',null);
   raise exception 'Worker called private management core';
 exception when insufficient_privilege then null; end;
 perform public.customer_shopping(auth.uid(),'cart','{"worker":{"quantity":1}}');
end $$;
reset role;
set local role service_role;
do $$
declare payload constant jsonb := '{"name":"Worker","email":"worker-customer@example.invalid","phone":"0500000000","message":"Pickup","locale":"en","checkout":{"fulfillment":"pickup","payment_collected":false,"cart":[{"quantity":1}]}}';
begin
 perform public.record_checkout_request('dd500000-0000-4000-8000-000000000001',repeat('c',64),'dd100000-0000-4000-8000-000000000001',payload,'test:worker-checkout');
 if public.record_checkout_request('dd500000-0000-4000-8000-000000000001',repeat('c',64),'dd100000-0000-4000-8000-000000000001') <> 'dd500000-0000-4000-8000-000000000001'::uuid then
   raise exception 'Worker checkout replay failed';
 end if;
 begin
   perform public.record_checkout_request('dd500000-0000-4000-8000-000000000001',repeat('c',64),'dd100000-0000-4000-8000-000000000002');
   raise exception 'Worker checkout accepted a different identity';
 exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','dd100000-0000-4000-8000-000000000001',true);
do $$ begin
 if not exists(select 1 from public.service_requests where id='dd500000-0000-4000-8000-000000000001' and customer_id=auth.uid()) then
   raise exception 'Worker checkout not visible in account history';
 end if;
end $$;
rollback;
