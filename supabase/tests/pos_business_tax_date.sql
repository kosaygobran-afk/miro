-- Foreign session dates must not select another day's Israeli tax window.
-- All tax rows below are fictional, isolated and rolled back.
begin;
insert into auth.users(id,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000001801','{"full_name":"Business date CEO"}'),
 ('00000000-0000-0000-0000-000000001802','{"full_name":"Business date customer"}');
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000001801';
insert into public.categories(id,slug,name_he,name_en) values('00000000-0000-0000-0000-000000001810','business-date-fixture','בדיקת תאריך','Business date fixture');
insert into public.products(id,category_id,slug,name_he,name_en,price,tracking_mode,sales_channel)
values('00000000-0000-0000-0000-000000001811','00000000-0000-0000-0000-000000001810','business-date-fixture','מוצר בדיקה','Business date fixture',107,'none','pos_and_online');
update public.products set status='active' where id='00000000-0000-0000-0000-000000001811';
insert into public.product_variants(id,product_id,sku,is_default,is_active,stock_qty)
values('00000000-0000-0000-0000-000000001812','00000000-0000-0000-0000-000000001811','BUSINESS-DATE-FIXTURE',true,true,20);

-- Pick one of the UTC+14 / UTC-12 sessions whose date differs from Israel at
-- this instant. The pair guarantees an adversarial date at every hour.
do $$ declare v_business date:=timezone('Asia/Jerusalem',now())::date; v_foreign_zone text; v_foreign date; begin
  v_foreign_zone:=case when timezone('Pacific/Kiritimati',now())::date<>v_business then 'Pacific/Kiritimati' else 'Etc/GMT+12' end;
  v_foreign:=timezone(v_foreign_zone,now())::date;
  if v_foreign=v_business then raise exception 'Foreign timezone fixture did not have a different date'; end if;
  update public.tax_rates set is_active=false;
  insert into public.tax_rates(name,rate,valid_from,valid_until,is_active) values
    ('Fictional Israeli business-day rate',7,v_business,v_business,true),
    ('Fictional foreign-session-day rate',11,v_foreign,v_foreign,true);
  perform set_config('pos.tax.foreign_zone',v_foreign_zone,true);
  perform set_config('TimeZone',v_foreign_zone,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001801',true);
do $$ declare x jsonb; v_order uuid; begin
  if public.current_tax_rate()<>11 then raise exception 'Adversarial caller date did not select foreign window'; end if;
  x:=public.commerce_create_intent('{"channel":"pos","idempotency_key":"business-date-pos-intent","customer_snapshot":{"name":"Fictional date buyer"},"items":[{"variant_id":"00000000-0000-0000-0000-000000001812","quantity":1}]}');
  if (x->'items'->0->>'vat_rate')::numeric<>7 or (x->'items'->0->>'net_agorot')::bigint<>10000 then raise exception 'POS quote used foreign tax date'; end if;
  if current_setting('TimeZone')<>current_setting('pos.tax.foreign_zone') then raise exception 'Quote leaked timezone into caller session'; end if;
  x:=public.record_pos_sale('{"name":"Fictional date buyer"}','[{"variant_id":"00000000-0000-0000-0000-000000001812","quantity":1,"unit_price":107}]','[{"method":"bank_transfer","amount":107}]','business-date-legacy-sale');
  v_order:=(x->>'order_id')::uuid;
  if (x->>'net_total')::numeric<>100 or (select vat_rate from public.order_items where order_id=v_order)<>7 then raise exception 'Legacy POS used foreign tax date'; end if;
  if current_setting('TimeZone')<>current_setting('pos.tax.foreign_zone') then raise exception 'Legacy sale leaked timezone into caller session'; end if;
  begin perform public.commerce_create_intent('{"channel":"pos","idempotency_key":"business-date-invalid-intent","customer_snapshot":{"name":"Fictional date buyer"},"items":[]}'); raise exception 'Invalid quote accepted'; exception when sqlstate '22023' then null; end;
  if current_setting('TimeZone')<>current_setting('pos.tax.foreign_zone') then raise exception 'Failed quote leaked timezone into caller session'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001802',true);
do $$ declare x jsonb; begin
  x:=public.commerce_create_intent('{"channel":"website","idempotency_key":"business-date-website-intent","customer_snapshot":{"name":"Fictional date buyer"},"items":[{"variant_id":"00000000-0000-0000-0000-000000001812","quantity":1}]}');
  if (x->'items'->0->>'vat_rate')::numeric<>7 or (x->'items'->0->>'net_agorot')::bigint<>10000 then raise exception 'Website quote used foreign tax date'; end if;
  if current_setting('TimeZone')<>current_setting('pos.tax.foreign_zone') then raise exception 'Website quote leaked timezone into caller session'; end if;
end $$;
reset role;
rollback;
