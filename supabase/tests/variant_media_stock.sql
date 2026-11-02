-- Disposable fixtures; the linked execution also always rolls back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('a1100000-0000-4000-8000-000000000001','variant-admin@example.invalid',now(),'{}'),
 ('a1100000-0000-4000-8000-000000000002','variant-customer@example.invalid',now(),'{}'),
 ('a1100000-0000-4000-8000-000000000003','variant-worker@example.invalid',now(),'{}');
update public.user_roles set role='admin' where user_id='a1100000-0000-4000-8000-000000000001';
update public.user_roles set role='worker' where user_id='a1100000-0000-4000-8000-000000000003';
insert into public.categories(id,slug,name_he,name_en) values ('a1200000-0000-4000-8000-000000000001','variant-media-qa','בדיקה','QA');
insert into public.products(id,category_id,slug,name_he,name_en,price) values
 ('a1300000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','variant-media-qa-a','בדיקה א','QA A',100),
 ('a1300000-0000-4000-8000-000000000002','a1200000-0000-4000-8000-000000000001','variant-media-qa-b','בדיקה ב','QA B',100);
insert into public.product_variants(id,product_id,sku,stock_qty,is_active) values
 ('a1400000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','VARIANT-MEDIA-QA-A',0,true),
 ('a1400000-0000-4000-8000-000000000002','a1300000-0000-4000-8000-000000000002','VARIANT-MEDIA-QA-B',0,true),
 ('a1400000-0000-4000-8000-000000000003','a1300000-0000-4000-8000-000000000001','VARIANT-MEDIA-QA-C',0,false);
insert into public.product_images(id,product_id,image_url,sort_order) values
 ('a1500000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','https://example.invalid/qa-a.png',0),
 ('a1500000-0000-4000-8000-000000000002','a1300000-0000-4000-8000-000000000001','https://example.invalid/qa-b.png',1);
-- UPDATE supports the linked status/is_active synchronization trigger as well.
update public.product_variants set is_active=false where id='a1400000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000001',true);
do $$ declare v public.product_variants; i public.product_images; result jsonb; begin
 -- Default zero, explicit zero, positive opening stock plus ledger/audit atomically.
 v:=public.create_catalog_variant_with_stock('{"product_id":"a1300000-0000-4000-8000-000000000001","sku":"VARIANT-QA-ZERO"}');
 if v.stock_qty<>0 then raise exception 'Default stock must be zero'; end if;
 v:=public.create_catalog_variant_with_stock('{"product_id":"a1300000-0000-4000-8000-000000000001","sku":"VARIANT-QA-EXPLICIT-ZERO","initial_stock_qty":0}');
 if v.stock_qty<>0 then raise exception 'Explicit zero lost'; end if;
 v:=public.create_catalog_variant_with_stock('{"product_id":"a1300000-0000-4000-8000-000000000001","sku":"VARIANT-QA-OPEN","initial_stock_qty":7}');
 if v.stock_qty<>7 or not exists(select 1 from public.stock_movements where variant_id=v.id and delta=7 and previous_qty=0 and resulting_qty=7 and actor_id=auth.uid()) then raise exception 'Opening stock not in ledger'; end if;
 if not exists(select 1 from public.audit_events where entity_id=v.id and action='variant_created' and user_id=auth.uid()) then raise exception 'Missing actor audit'; end if;
 begin
   perform public.create_catalog_variant_with_stock('{"product_id":"a1300000-0000-4000-8000-000000000001","sku":"VARIANT-QA-BAD","initial_stock_qty":-1}');
   raise exception 'Negative stock accepted';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.create_catalog_variant_with_stock('{"product_id":"a1300000-0000-4000-8000-000000000001","sku":"VARIANT-QA-BAD","initial_stock_qty":1.5}');
   raise exception 'Fractional stock accepted';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.update_variant(v.id,'{"stock_qty":4}');
   raise exception 'Metadata bypassed ledger';
 exception when invalid_parameter_value then null; end;
 perform public.adjust_catalog_variant_stock(v.id,3,7,'QA counted quantity');
 begin
   perform public.adjust_catalog_variant_stock(v.id,0,7,'Stale editor');
   raise exception 'Stale editor overwrote quantity';
 exception when sqlstate 'PT409' then null; end;
 perform public.adjust_catalog_variant_stock(v.id,0,3,'QA zero count');
 if (select stock_qty from public.product_variants where id=v.id)<>0 then raise exception 'Zero correction lost'; end if;
 -- Two images may belong to the same variant; primary and ownership are independent.
 i:=public.update_catalog_image('a1500000-0000-4000-8000-000000000001','{"variant_id":"a1400000-0000-4000-8000-000000000001"}');
 if i.variant_id is null then raise exception 'Assignment lost'; end if;
 perform public.update_catalog_image('a1500000-0000-4000-8000-000000000002','{"variant_id":"a1400000-0000-4000-8000-000000000001","is_primary":true}');
 begin
   perform public.update_catalog_image(i.id,'{"variant_id":"a1400000-0000-4000-8000-000000000002"}');
   raise exception 'Cross product assignment accepted';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.update_catalog_image(i.id,'{"variant_id":"a1400000-0000-4000-8000-000000000003"}');
   raise exception 'Archived variant assignment accepted';
 exception when invalid_parameter_value then null; end;
 i:=public.update_catalog_image(i.id,'{"variant_id":null}');
 if i.variant_id is not null then raise exception 'Cannot restore general image'; end if;
 -- Total is independent of search/page/status and excludes archived stock.
 perform public.adjust_catalog_variant_stock('a1400000-0000-4000-8000-000000000001',4,0,'QA total active');
 perform public.adjust_catalog_variant_stock('a1400000-0000-4000-8000-000000000003',12,0,'QA total archived');
 result:=public.management_inventory_variant_list('VARIANT-QA-OPEN',null,1,1);
 if (result->'items'->0->>'product_stock_qty')::integer<>4 then raise exception 'Total incorrectly scoped by pagination or archive'; end if;
end $$;
-- Worker/customer denied by SQL even with direct RPC access.
select set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.update_catalog_image('a1500000-0000-4000-8000-000000000001','{"variant_id":null}'); raise exception 'Customer write allowed'; exception when insufficient_privilege then null; end;
 begin perform public.adjust_catalog_variant_stock('a1400000-0000-4000-8000-000000000001',0,4,'Unauthorized'); raise exception 'Customer stock allowed'; exception when insufficient_privilege then null; end;
 begin perform public.create_catalog_variant_with_stock('{"product_id":"a1300000-0000-4000-8000-000000000001","sku":"CUSTOMER-WRITE"}'); raise exception 'Customer create allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000003',true);
do $$ begin
 begin perform public.adjust_catalog_variant_stock('a1400000-0000-4000-8000-000000000001',0,4,'Unauthorized'); raise exception 'Worker stock allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Composite FK enforces ownership for service-role/direct writes too.
do $$ begin
 begin
   update public.product_images set variant_id='a1400000-0000-4000-8000-000000000002' where id='a1500000-0000-4000-8000-000000000001';
   raise exception 'Direct cross product assignment allowed';
 exception when foreign_key_violation then null; end;
end $$;
-- Public images retain product RLS and also inherit assigned variant visibility.
update public.product_variants set barcode='VARIANT-MEDIA-QA-PUBLIC' where id='a1400000-0000-4000-8000-000000000001';
update public.products set status='active' where id='a1300000-0000-4000-8000-000000000001';
insert into public.product_images(id,product_id,image_url,variant_id) values
 ('a1500000-0000-4000-8000-000000000003','a1300000-0000-4000-8000-000000000001','https://example.invalid/qa-hidden.png','a1400000-0000-4000-8000-000000000003');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 if (select count(*) from public.product_images where id in ('a1500000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000002'))<>2 then raise exception 'General/visible variant images hidden'; end if;
 if exists(select 1 from public.product_images where id='a1500000-0000-4000-8000-000000000003') then raise exception 'Hidden variant media exposed'; end if;
 if not has_column_privilege('anon','public.product_images','variant_id','SELECT') then raise exception 'Public cannot read assignment'; end if;
 if has_column_privilege('anon','public.product_images','original_image_url','SELECT') then raise exception 'Private originals exposed'; end if;
 begin perform public.adjust_catalog_variant_stock('a1400000-0000-4000-8000-000000000001',0,4,'Unauthorized'); raise exception 'Anon stock allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
