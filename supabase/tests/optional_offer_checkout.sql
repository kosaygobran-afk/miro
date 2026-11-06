-- Synthetic optional-offer pricing/context/payment lifecycle; always rollback.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('c1100000-0000-4000-8000-000000000001','optional-checkout-admin@example.invalid',now(),'{}'),
 ('c1100000-0000-4000-8000-000000000002','optional-checkout-customer@example.invalid',now(),'{}'),
 ('c1100000-0000-4000-8000-000000000003','optional-checkout-worker@example.invalid',now(),'{}');
update public.user_roles set role='admin' where user_id='c1100000-0000-4000-8000-000000000001';
update public.user_roles set role='worker' where user_id='c1100000-0000-4000-8000-000000000003';
insert into public.categories(id,slug,name_he,name_en) values('c1200000-0000-4000-8000-000000000001','optional-checkout-fixture','בדיקה','Optional checkout fixture');
insert into public.products(id,category_id,slug,name_he,name_en,price,sale_price,tracking_mode,sales_channel) values
 ('c1300000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','optional-checkout-parent','אב','Parent',200,150,'serial','pos_and_online'),
 ('c1300000-0000-4000-8000-000000000002','c1200000-0000-4000-8000-000000000001','optional-checkout-target','יעד','Target',100,60,'serial','pos_and_online'),
 ('c1300000-0000-4000-8000-000000000003','c1200000-0000-4000-8000-000000000001','optional-checkout-unpriced','בירור','Unpriced',null,null,'serial','contact_only');
insert into public.product_variants(id,product_id,sku,barcode,is_default,is_active,stock_qty,price_override) values
 ('c1400000-0000-4000-8000-000000000001','c1300000-0000-4000-8000-000000000001','OPTIONAL-PARENT','OPTIONAL-PARENT',true,true,30,null),
 ('c1400000-0000-4000-8000-000000000002','c1300000-0000-4000-8000-000000000002','OPTIONAL-TARGET-A','OPTIONAL-TARGET-A',true,true,30,80),
 ('c1400000-0000-4000-8000-000000000003','c1300000-0000-4000-8000-000000000002','OPTIONAL-TARGET-B','OPTIONAL-TARGET-B',false,true,30,null),
 ('c1400000-0000-4000-8000-000000000004','c1300000-0000-4000-8000-000000000003','OPTIONAL-UNPRICED','OPTIONAL-UNPRICED',true,true,30,null);
update public.products set status='active' where id in ('c1300000-0000-4000-8000-000000000001','c1300000-0000-4000-8000-000000000002','c1300000-0000-4000-8000-000000000003');
insert into public.product_prices(product_id,role,price) values('c1300000-0000-4000-8000-000000000002','customer',70);
insert into public.product_public_promotions(product_id,promotion_type,value,is_active) values('c1300000-0000-4000-8000-000000000002','percent',10,true);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1100000-0000-4000-8000-000000000001',true);
do $$ declare r jsonb; begin
 r:=public.replace_product_optional_offers('c1300000-0000-4000-8000-000000000001',0,'[
 {"target_product_id":"c1300000-0000-4000-8000-000000000002","target_variant_id":"c1400000-0000-4000-8000-000000000002","kind":"complementary","pricing_mode":"percent","discount_bps":1000},
 {"target_product_id":"c1300000-0000-4000-8000-000000000002","target_variant_id":"c1400000-0000-4000-8000-000000000003","kind":"accompanying","pricing_mode":"fixed","fixed_price_agorot":5000},
 {"target_product_id":"c1300000-0000-4000-8000-000000000003","target_variant_id":"c1400000-0000-4000-8000-000000000004","kind":"accompanying","pricing_mode":"fixed","fixed_price_agorot":1000}]');
 perform set_config('optional.test.offer_id',r->'offers'->0->>'id',true);
 perform set_config('optional.test.unpriced_id',r->'offers'->2->>'id',true);
end $$;
select set_config('request.jwt.claim.sub','c1100000-0000-4000-8000-000000000002',true);
do $$ declare p jsonb; child jsonb; patch jsonb; r jsonb; replay jsonb; begin
 if public.optional_offer_catalog_price_agorot('c1400000-0000-4000-8000-000000000002')<>7200 then raise exception 'Variant/public promotion canonical price mismatch'; end if;
 if public.optional_offer_catalog_price_agorot('c1400000-0000-4000-8000-000000000003')<>6300 then raise exception 'Role/public promotion fallback mismatch'; end if;
 if public.optional_offer_effective_price_agorot(1,'percent',9500,null) is not null then raise exception 'Rounded free item silently invented price'; end if;
 r:=public.get_public_product_optional_offers('c1300000-0000-4000-8000-000000000001');
 if (r->'offers'->0->>'catalog_price_agorot')::bigint<>7200 or (r->'offers'->0->>'effective_price_agorot')::bigint<>6480 then raise exception 'Display/quote helper parity failed'; end if;
 child:=jsonb_build_object('line_id','offered','variant_id','c1400000-0000-4000-8000-000000000002','quantity',2,'offer_id',current_setting('optional.test.offer_id'),'parent_line_id','parent','offer_revision',1);
 p:=jsonb_build_object('channel','website','idempotency_key','optional-lifecycle-key-001','customer_snapshot',jsonb_build_object('name','Synthetic buyer'),'items',jsonb_build_array(
  jsonb_build_object('line_id','parent','variant_id','c1400000-0000-4000-8000-000000000001','quantity',2),child,
  jsonb_build_object('line_id','standalone','variant_id','c1400000-0000-4000-8000-000000000002','quantity',1)));
 for patch in select value from jsonb_array_elements('[{"unit_price_agorot":1},{"discount_per_unit_agorot":1},{"parent_line_id":"missing"},{"quantity":3},{"variant_id":"c1400000-0000-4000-8000-000000000003"},{"parent_line_id":"standalone"},{"offer_id":"c1500000-0000-4000-8000-000000000099"}]') loop
  begin
   perform public.commerce_create_optional_offers_intent(jsonb_set(p,'{items,1}',child||patch));
   raise exception 'Forged optional context accepted: %',patch;
  exception when invalid_parameter_value or sqlstate 'PT409' then null; end;
 end loop;
 begin perform public.commerce_create_optional_offers_intent(jsonb_set(p,'{items}',p->'items'||jsonb_build_array(child||'{"line_id":"duplicate-offer"}'))); raise exception 'Duplicate offer allocation accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.commerce_create_optional_offers_intent(jsonb_set(p,'{items,0}',(p->'items'->0)||child||'{"line_id":"parent","parent_line_id":"offered"}')); raise exception 'Nested qualifying parent accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.commerce_create_guest_optional_offers_intent(p); raise exception 'Customer minted guest authority'; exception when insufficient_privilege then null; end;
 begin perform public.commerce_create_optional_offers_intent(jsonb_set(jsonb_set(jsonb_set(p,'{items,0,quantity}','15'),'{items,1,quantity}','15'),'{items,2,quantity}','16')); raise exception 'Aggregate duplicate quantity oversold stock'; exception when sqlstate 'PT409' then null; end;
 begin perform public.commerce_create_optional_offers_intent(jsonb_set(p,'{items,1}',child||jsonb_build_object('offer_id',current_setting('optional.test.unpriced_id'),'variant_id','c1400000-0000-4000-8000-000000000004'))); raise exception 'Fixed offer bypassed quote-only channel'; exception when invalid_parameter_value then null; end;
 r:=public.commerce_create_optional_offers_intent(p);
 if (r->'intent'->>'total_agorot')::bigint<>50960 or jsonb_array_length(r->'items')<>3 then raise exception 'Context prices did not preserve standalone and core parent independently: %',r; end if;
 if r->'items'->1->'offer_snapshot'->>'kind'<>'complementary' or (r->'items'->1->'offer_snapshot'->>'effective_price_agorot')::bigint<>6480 or r->'items'->0->'offer_id'<>'null'::jsonb then raise exception 'Safe context snapshot incorrect'; end if;
 if r->'items'->0 ? 'unit_cost_agorot' then raise exception 'Public response exposed cost'; end if;
 replay:=public.commerce_create_optional_offers_intent(p);
 if (replay->>'replayed')::boolean is not true or replay->'intent'->>'id'<>r->'intent'->>'id' then raise exception 'Context replay duplicated intent'; end if;
 begin perform public.commerce_create_optional_offers_intent(jsonb_set(p,'{items,0,quantity}','1')); raise exception 'Context idempotency conflict accepted'; exception when sqlstate 'PT409' then null; end;
 perform set_config('optional.test.payload',p::text,true);
 perform set_config('optional.test.intent',r->'intent'->>'id',true);
 begin perform 1 from public.commerce_optional_offer_requests; raise exception 'Customer read private request mapping'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','c1100000-0000-4000-8000-000000000003',true);
do $$ begin begin perform public.commerce_create_optional_offers_intent(current_setting('optional.test.payload')::jsonb); raise exception 'Worker created customer intent'; exception when insufficient_privilege then null; end; end $$;
reset role;
do $$ begin
 if (select quantity from public.stock_reservations where intent_id=current_setting('optional.test.intent')::uuid and variant_id='c1400000-0000-4000-8000-000000000002')<>3 then raise exception 'Duplicate variant stock not aggregated'; end if;
 if (select count(*) from public.commerce_optional_offer_requests where intent_id=current_setting('optional.test.intent')::uuid)<>1 then raise exception 'Request mapping duplicated'; end if;
end $$;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
do $$ declare p jsonb; r jsonb; replay jsonb; begin
 p:=jsonb_set(jsonb_set(jsonb_set(current_setting('optional.test.payload')::jsonb,'{idempotency_key}','"optional-guest-key-001"'),'{items,0,quantity}','1'),'{items,1,quantity}','1');
 r:=public.commerce_create_guest_optional_offers_intent(p);
 replay:=public.commerce_create_guest_optional_offers_intent(p);
 if (r->'intent'->>'total_agorot')::bigint<>29480 or length(r->>'guest_capability')<32 or (replay->>'replayed')::boolean is not true or replay->'intent'->>'id'<>r->'intent'->>'id' then raise exception 'Guest optional quote/replay contract incorrect'; end if;
 perform set_config('optional.test.guest_payload',p::text,true);
end $$;
reset role;
-- Alter configuration/catalog after creation. Identical retry must recover
-- frozen context, not read the new offer or duplicate stock reservations.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1100000-0000-4000-8000-000000000001',true);
select public.replace_product_optional_offers('c1300000-0000-4000-8000-000000000001',1,'[]');
select public.update_variant('c1400000-0000-4000-8000-000000000002','{"price_override":99}');
select set_config('request.jwt.claim.sub','c1100000-0000-4000-8000-000000000002',true);
do $$ declare r jsonb; begin
 r:=public.commerce_create_optional_offers_intent(current_setting('optional.test.payload')::jsonb);
 if (r->'intent'->>'total_agorot')::bigint<>50960 or (r->>'replayed')::boolean is not true then raise exception 'Edited configuration changed replay'; end if;
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
do $$ declare r jsonb; attempt uuid; intent uuid:=current_setting('optional.test.intent')::uuid; begin
 r:=public.commerce_create_guest_optional_offers_intent(current_setting('optional.test.guest_payload')::jsonb);
 if (r->'intent'->>'total_agorot')::bigint<>29480 or length(r->>'guest_capability')<32 then raise exception 'Guest replay repriced removed offer'; end if;
 r:=public.commerce_start_provider_attempt(jsonb_build_object('intent_id',intent,'method','credit_card','idempotency_key','optional-provider-attempt-001','provider','payplus','environment','sandbox','merchant_ref','optional-fixture','amount_agorot',50960),'c1100000-0000-4000-8000-000000000002',null);
 attempt:=(r->'attempt'->>'id')::uuid;
 perform public.commerce_provider_result(attempt,'optional-capture-001',jsonb_build_object('verified',true,'verification_source','server_query','provider','payplus','environment','sandbox','merchant_ref','optional-fixture','amount_agorot',50960,'currency','ILS','state','captured','transaction_uid','optional-tx-001','transaction_kind','charge','safe_metadata','{}'::jsonb));
end $$;
reset role;
do $$ declare v_order uuid; begin
 select finalized_order_id into v_order from public.commerce_intents where id=current_setting('optional.test.intent')::uuid;
 if v_order is null then raise exception 'Optional intent did not finalize'; end if;
 if (select count(*) from public.order_items o where o.order_id=v_order and line_id is not null)<>3 then raise exception 'Order provenance missing'; end if;
 if (select stock_qty from public.product_variants where id='c1400000-0000-4000-8000-000000000001')<>28 or (select stock_qty from public.product_variants where id='c1400000-0000-4000-8000-000000000002')<>27 then raise exception 'Context stock consumed incorrectly'; end if;
 if (select count(*) from public.stock_reservations where intent_id=current_setting('optional.test.intent')::uuid and state='consumed')<>2 then raise exception 'Reservation not consumed once per variant'; end if;
 if (select round(sum(total_price)*100)::bigint from public.order_items o where o.order_id=v_order)<>50960 then raise exception 'Order financial amounts changed'; end if;
end $$;
-- The linked catalog has variant-scoped promotions, priority and explicit
-- audiences beyond the repository baseline. Exercise that additive branch in
-- this same rollback transaction without replacing installed pricing guards.
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='product_public_promotions' and column_name='variant_id') then
  alter table public.product_public_promotions drop constraint product_public_promotions_product_unique;
  alter table public.product_public_promotions drop constraint product_public_promotions_promotion_type_check;
  alter table public.product_public_promotions add constraint optional_fixture_promotion_type_check check(promotion_type in('percent','fixed','final_price'));
  alter table public.product_public_promotions add column variant_id uuid references public.product_variants(id);
  alter table public.product_public_promotions add column priority integer not null default 0;
 end if;
end $$;
create table if not exists public.product_promotion_audiences (
 promotion_id uuid not null references public.product_public_promotions(id),
 role text not null,
 primary key(promotion_id,role)
);
insert into public.product_public_promotions(id,product_id,variant_id,promotion_type,value,priority,is_active,scheduled_from) values
 ('c1600000-0000-4000-8000-000000000001','c1300000-0000-4000-8000-000000000002',null,'percent',1,100,true,null),
 ('c1600000-0000-4000-8000-000000000002','c1300000-0000-4000-8000-000000000002','c1400000-0000-4000-8000-000000000002','final_price',42,5,true,null),
 ('c1600000-0000-4000-8000-000000000003','c1300000-0000-4000-8000-000000000002','c1400000-0000-4000-8000-000000000002','final_price',35,8,true,null),
 ('c1600000-0000-4000-8000-000000000004','c1300000-0000-4000-8000-000000000002','c1400000-0000-4000-8000-000000000002','final_price',1,999,true,null),
 ('c1600000-0000-4000-8000-000000000005','c1300000-0000-4000-8000-000000000002','c1400000-0000-4000-8000-000000000002','fixed',5,1000,true,now()+interval '1 day');
insert into public.product_promotion_audiences(promotion_id,role)
 select id,case when id='c1600000-0000-4000-8000-000000000004' then 'worker' else 'customer' end
 from public.product_public_promotions where id in(
 'c1600000-0000-4000-8000-000000000001','c1600000-0000-4000-8000-000000000002',
 'c1600000-0000-4000-8000-000000000003','c1600000-0000-4000-8000-000000000004','c1600000-0000-4000-8000-000000000005');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1100000-0000-4000-8000-000000000002',true);
do $$ begin
 if public.optional_offer_catalog_price_agorot('c1400000-0000-4000-8000-000000000002')<>3500 then raise exception 'Variant/priority/audience/schedule/final-price resolution incorrect'; end if;
 if public.optional_offer_catalog_price_agorot('c1400000-0000-4000-8000-000000000003')<>6930 then raise exception 'Product-wide promotion fallback incorrect'; end if;
end $$;
rollback;
