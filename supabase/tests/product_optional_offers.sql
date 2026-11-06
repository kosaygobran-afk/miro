-- Disposable database fixtures only. All configuration/actor writes roll back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('b1100000-0000-4000-8000-000000000001','offers-admin@example.invalid',now(),'{}'),
 ('b1100000-0000-4000-8000-000000000002','offers-ceo@example.invalid',now(),'{}'),
 ('b1100000-0000-4000-8000-000000000003','offers-customer@example.invalid',now(),'{}'),
 ('b1100000-0000-4000-8000-000000000004','offers-worker@example.invalid',now(),'{}'),
 ('b1100000-0000-4000-8000-000000000005','offers-blocked@example.invalid',now(),'{}');
update public.user_roles set role='admin' where user_id in ('b1100000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000005');
update public.user_roles set role='ceo' where user_id='b1100000-0000-4000-8000-000000000002';
update public.user_roles set role='worker' where user_id='b1100000-0000-4000-8000-000000000004';
update public.profiles set account_status='blocked' where id='b1100000-0000-4000-8000-000000000005';
insert into public.categories(id,slug,name_he,name_en) values('b1200000-0000-4000-8000-000000000001','optional-offers-fixture','בדיקה','Optional offers fixture');
insert into public.products(id,category_id,slug,name_he,name_en,price) values
 ('b1300000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000001','optional-offers-parent','מוצר אב','Parent',100),
 ('b1300000-0000-4000-8000-000000000002','b1200000-0000-4000-8000-000000000001','optional-offers-target','מוצר יעד','Target',50),
 ('b1300000-0000-4000-8000-000000000003','b1200000-0000-4000-8000-000000000001','optional-offers-hidden','מוצר נסתר','Hidden',20),
 ('b1300000-0000-4000-8000-000000000004','b1200000-0000-4000-8000-000000000001','optional-offers-many','מוצר רב','Many',10);
insert into public.product_variants(id,product_id,sku,barcode,is_default,is_active,stock_qty) values
 ('b1400000-0000-4000-8000-000000000001','b1300000-0000-4000-8000-000000000001','OFFER-PARENT','OFFER-PARENT',true,true,10),
 ('b1400000-0000-4000-8000-000000000002','b1300000-0000-4000-8000-000000000002','OFFER-TARGET-A','OFFER-TARGET-A',true,true,10),
 ('b1400000-0000-4000-8000-000000000003','b1300000-0000-4000-8000-000000000002','OFFER-TARGET-B','OFFER-TARGET-B',false,true,10),
 ('b1400000-0000-4000-8000-000000000004','b1300000-0000-4000-8000-000000000003','OFFER-HIDDEN','OFFER-HIDDEN',true,true,10),
 ('b1400000-0000-4000-8000-000000000005','b1300000-0000-4000-8000-000000000004','OFFER-MANY','OFFER-MANY',true,true,10);
update public.products set status='active' where id in ('b1300000-0000-4000-8000-000000000001','b1300000-0000-4000-8000-000000000002','b1300000-0000-4000-8000-000000000004');

set local role authenticated;
select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000001',true);
do $$ declare result jsonb; original_name text; payload jsonb; offer_id uuid; begin
 if public.management_read_product_optional_offers('b1300000-0000-4000-8000-000000000001')->>'revision'<>'0' then raise exception 'Missing initial revision zero'; end if;
 result:=public.replace_product_optional_offers('b1300000-0000-4000-8000-000000000001',0,'[
  {"target_product_id":"b1300000-0000-4000-8000-000000000002","target_variant_id":"b1400000-0000-4000-8000-000000000002","kind":"complementary","pricing_mode":"percent","discount_bps":1000,"label_he":"תוספת","sort_order":1},
  {"target_product_id":"b1300000-0000-4000-8000-000000000002","target_variant_id":"b1400000-0000-4000-8000-000000000003","kind":"accompanying","pricing_mode":"fixed","fixed_price_agorot":2000,"sort_order":0},
  {"target_product_id":"b1300000-0000-4000-8000-000000000003","target_variant_id":"b1400000-0000-4000-8000-000000000004","kind":"complementary","pricing_mode":"catalog","sort_order":2}
 ]');
 if result->>'revision'<>'1' or jsonb_array_length(result->'offers')<>3 or result->'offers'->0->>'kind'<>'complementary' or result->'offers'->0->'target'->>'sku'<>'OFFER-TARGET-A' then raise exception 'Offer persistence/ordering/descriptors incorrect'; end if;
 perform set_config('offers.test.saved_id',result->'offers'->2->>'id',true);
 for payload in select value from jsonb_array_elements('[
  {"parent_product_id":"b1300000-0000-4000-8000-000000000001"},
  {"deleted_at":null},{"unit_price":1},{"discount_bps":1.5},{"discount_bps":9501},
  {"pricing_mode":"fixed","discount_bps":null,"fixed_price_agorot":100000001},
  {"pricing_mode":"catalog","discount_bps":1000},{"kind":"unknown"},
  {"target_product_id":"b1300000-0000-4000-8000-000000000003"},
  {"target_product_id":"b1300000-0000-4000-8000-000000000001","target_variant_id":"b1400000-0000-4000-8000-000000000001"},
  {"is_active":null},{"sort_order":null},{"sort_order":-1},{"target_variant_id":"not-a-uuid"}
 ]') loop
  begin
   perform public.replace_product_optional_offers('b1300000-0000-4000-8000-000000000001',1,jsonb_build_array(jsonb_build_object('target_product_id','b1300000-0000-4000-8000-000000000002','target_variant_id','b1400000-0000-4000-8000-000000000002','kind','complementary','pricing_mode','percent','discount_bps',1000)||payload));
   raise exception 'Malformed optional offer accepted: %',payload;
  exception when invalid_parameter_value then null; end;
 end loop;
 begin
  perform public.replace_product_optional_offers('b1300000-0000-4000-8000-000000000001',1,jsonb_build_array(jsonb_build_object('target_product_id','b1300000-0000-4000-8000-000000000002','target_variant_id','b1400000-0000-4000-8000-000000000002','kind','complementary','pricing_mode','catalog','label_en',repeat('x',161))));
  raise exception 'Oversized label accepted'; exception when invalid_parameter_value then null; end;
 begin
  perform public.replace_product_optional_offers('b1300000-0000-4000-8000-000000000001',0,'[]');
  raise exception 'Stale revision accepted'; exception when sqlstate 'PT409' then null; end;
 original_name:=(select name_en from public.products where id='b1300000-0000-4000-8000-000000000001');
 begin
  perform public.update_product_with_optional_offers('b1300000-0000-4000-8000-000000000001','{"name_en":"Must roll back"}','[]',0);
  raise exception 'Stale combined save accepted'; exception when sqlstate 'PT409' then null; end;
 if (select name_en from public.products where id='b1300000-0000-4000-8000-000000000001')<>original_name then raise exception 'Combined save partially updated product'; end if;
 if public.management_read_product_optional_offers('b1300000-0000-4000-8000-000000000001')->>'revision'<>'1' then raise exception 'Invalid save changed revision'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.audit_events where action='product_optional_offers_replaced' and entity_id='b1300000-0000-4000-8000-000000000001')<>1 then raise exception 'Audit not atomic'; end if;
 begin update public.product_optional_offers set target_product_id='b1300000-0000-4000-8000-000000000003' where target_variant_id='b1400000-0000-4000-8000-000000000002'; raise exception 'Composite target ownership bypassed'; exception when foreign_key_violation then null; end;
 begin update public.product_optional_offers set discount_bps=null where pricing_mode='percent'; raise exception 'NULL percent bypassed table constraint'; exception when check_violation then null; end;
end $$;
-- Restrictive caller policy emulates linked audience guards without replacing
-- any existing visibility policy/function or reading owner records.
create policy "Optional offers fixture audience" on public.product_variants as restrictive for select to anon,authenticated
 using (id<>'b1400000-0000-4000-8000-000000000003'::uuid);
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare result jsonb; begin
 result:=public.get_public_product_optional_offers('b1300000-0000-4000-8000-000000000001');
 if result->>'revision'<>'1' or jsonb_array_length(result->'offers')<>1 or result->'offers'->0->>'target_variant_id'<>'b1400000-0000-4000-8000-000000000002' then raise exception 'Invoker projection leaked hidden product/variant'; end if;
 if result->'offers'->0 ? 'target' or result->'offers'->0 ? 'deleted_at' then raise exception 'Public projection exposed private fields'; end if;
 if has_column_privilege('anon','public.product_optional_offers','deleted_at','SELECT') then raise exception 'Public tombstone column granted'; end if;
 begin perform public.replace_product_optional_offers('b1300000-0000-4000-8000-000000000001',1,'[]'); raise exception 'Anonymous write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ declare actor text; begin
 foreach actor in array array['b1100000-0000-4000-8000-000000000003','b1100000-0000-4000-8000-000000000004','b1100000-0000-4000-8000-000000000005'] loop
  perform set_config('request.jwt.claim.sub',actor,true);
  begin perform public.replace_product_optional_offers('b1300000-0000-4000-8000-000000000001',1,'[]'); raise exception 'Unauthorized actor wrote offers'; exception when insufficient_privilege then null; end;
  begin perform public.management_read_product_optional_offers('b1300000-0000-4000-8000-000000000001'); raise exception 'Unauthorized actor read management offers'; exception when insufficient_privilege then null; end;
  begin update public.product_optional_offers set is_active=false; raise exception 'Direct table write allowed'; exception when insufficient_privilege then null; end;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000002',true);
do $$ declare result jsonb; begin
 result:=public.replace_product_optional_offers('b1300000-0000-4000-8000-000000000001',1,'[{"target_product_id":"b1300000-0000-4000-8000-000000000002","target_variant_id":"b1400000-0000-4000-8000-000000000002","kind":"complementary","pricing_mode":"catalog","is_active":false}]');
 if jsonb_array_length(result->'offers')<>1 or (result->'offers'->0->>'is_active')::boolean then raise exception 'Removed rows resurfaced or inactive row lost'; end if;
 result:=public.replace_product_optional_offers('b1300000-0000-4000-8000-000000000001',2,'[{"target_product_id":"b1300000-0000-4000-8000-000000000002","target_variant_id":"b1400000-0000-4000-8000-000000000003","kind":"accompanying","pricing_mode":"catalog"}]');
 if result->'offers'->0->>'id'<>current_setting('offers.test.saved_id') then raise exception 'Re-added target discarded historical identity'; end if;
 result:=public.update_product_with_optional_offers('b1300000-0000-4000-8000-000000000001','{"name_en":"Saved atomically"}','[]',3);
 if result->'product'->>'name_en'<>'Saved atomically' or result->'optional_offers'->>'revision'<>'4' then raise exception 'Combined result contract incorrect'; end if;
end $$;
reset role;
-- Configuration permits arbitrary-length offer lists (checkout has its separate
-- transaction item bound); there is no invented 100-row configuration cap.
insert into public.product_variants(product_id,sku,barcode,is_active)
 select 'b1300000-0000-4000-8000-000000000002','OFFER-MANY-'||n,'OFFER-MANY-'||n,true from generate_series(1,101)n;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1100000-0000-4000-8000-000000000001',true);
do $$ declare payload jsonb; result jsonb; begin
 select jsonb_agg(jsonb_build_object('target_product_id',product_id,'target_variant_id',id,'kind','complementary','pricing_mode','catalog')) into payload from public.product_variants where sku like 'OFFER-MANY-%';
 result:=public.replace_product_optional_offers('b1300000-0000-4000-8000-000000000004',0,payload);
 if jsonb_array_length(result->'offers')<>101 then raise exception 'Arbitrary offer list truncated'; end if;
end $$;
rollback;
