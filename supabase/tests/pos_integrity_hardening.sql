-- Fictional fixtures in disposable PostgreSQL; every change rolls back.
begin;
insert into auth.users(id,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000001201','{"full_name":"POS integrity CEO"}'),
 ('00000000-0000-0000-0000-000000001202','{"full_name":"POS integrity admin"}'),
 ('00000000-0000-0000-0000-000000001203','{"full_name":"POS integrity customer"}');
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000001201';
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000001202';
insert into public.categories(id,slug,name_he,name_en) values('00000000-0000-0000-0000-000000001210','pos-integrity','בדיקת קופה','POS integrity');
insert into public.products(id,category_id,slug,name_he,name_en,price,inventory_count,tracking_mode,sales_channel)
values ('00000000-0000-0000-0000-000000001211','00000000-0000-0000-0000-000000001210','pos-integrity','מוצר בדיקה','Integrity product',100,10,'serial','pos_and_online');
update public.products set status='active' where id='00000000-0000-0000-0000-000000001211';
insert into public.product_variants(id,product_id,sku,is_default,is_active,stock_qty,pos_price) values('00000000-0000-0000-0000-000000001212','00000000-0000-0000-0000-000000001211','POS-INTEGRITY',true,true,10,120);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001201',true);

-- Catalog price is authoritative, discounts are explicit, and retry keys bind
-- the complete payload and actor instead of silently replaying another sale.
do $$ declare p jsonb; x jsonb; y jsonb; begin
  p:='[{"variant_id":"00000000-0000-0000-0000-000000001212","quantity":1,"unit_price":120,"discount_per_unit":20}]';
  begin
    perform public.record_pos_sale('{"name":"Fixture"}','[{"variant_id":"00000000-0000-0000-0000-000000001212","quantity":1,"unit_price":1}]','[{"method":"bank_transfer","amount":1}]','legacy-price-check');
    raise exception 'Browser unit price overrode configured POS price';
  exception when sqlstate 'PT409' then null; end;
  x:=public.record_pos_sale('{"name":"Fixture"}',p,'[{"method":"bank_transfer","amount":100}]','legacy-safe-replay');
  y:=public.record_pos_sale('{"name":"Fixture"}',p,'[{"method":"bank_transfer","amount":100}]','legacy-safe-replay');
  if y->>'order_id' is distinct from x->>'order_id' or (y->>'replayed')::boolean is not true then raise exception 'Legacy identical retry did not recover original sale'; end if;
  begin
    perform public.record_pos_sale('{"name":"Changed"}',p,'[{"method":"bank_transfer","amount":100}]','legacy-safe-replay');
    raise exception 'Legacy changed-payload retry was accepted';
  exception when sqlstate 'PT409' then null; end;
  perform set_config('pos.integrity.legacy',x->>'order_id',true);
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001202',true);
do $$ begin
  begin
    perform public.record_pos_sale('{"name":"Fixture"}','[{"variant_id":"00000000-0000-0000-0000-000000001212","quantity":1,"unit_price":120,"discount_per_unit":20}]','[{"method":"bank_transfer","amount":100}]','legacy-safe-replay');
    raise exception 'Another cashier replayed a legacy sale key';
  exception when sqlstate 'PT409' then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001203',true);
do $$ begin
  begin
    perform public.commerce_create_intent('{"channel":"website","idempotency_key":"discount-exploit","customer_snapshot":{"name":"Fixture"},"items":[{"variant_id":"00000000-0000-0000-0000-000000001212","quantity":1,"discount_per_unit_agorot":9999}]}');
    raise exception 'Customer set its own website discount through the RPC';
  exception when insufficient_privilege then null; end;
  begin perform public.commerce_create_intent_core('{}'); raise exception 'Core quoting function exposed'; exception when insufficient_privilege then null; end;
  begin perform public.record_pos_sale_core('{}','[]','[]',null); raise exception 'Core legacy writer exposed'; exception when insufficient_privilege then null; end;
  begin perform public.commerce_pos_available_stock(array['00000000-0000-0000-0000-000000001212'::uuid]); raise exception 'Customer read internal stock endpoint'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001201',true);
do $$ declare x jsonb; p jsonb; begin
  x:=public.commerce_create_intent('{"channel":"pos","idempotency_key":"integrity-tender-intent","customer_snapshot":{"name":"Fixture"},"items":[{"variant_id":"00000000-0000-0000-0000-000000001212","quantity":2}]}');
  perform set_config('pos.integrity.intent',x->'intent'->>'id',true);
  p:=jsonb_build_object('intent_id',x->'intent'->>'id','method','bank_transfer','collection_kind','manual_recorded','amount_agorot',24000,'reference','FICTIONAL-TRANSFER','idempotency_key','integrity-final-tender');
  begin perform public.commerce_start_attempt(p); raise exception 'Unconfirmed tender recorded'; exception when insufficient_privilege then null; end;
  perform set_config('pos.integrity.tender_payload',(p||jsonb_build_object('confirmed_received',true))::text,true);
end $$;

-- The public stock projection contains aggregate availability and no hold IDs.
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
do $$ declare x jsonb; begin
  x:=public.commerce_pos_available_stock(array['00000000-0000-0000-0000-000000001212'::uuid]);
  if (x->0->>'stock_qty')::int<>9 or (x->0->>'reserved_qty')::int<>2 or (x->0->>'available_qty')::int<>7 or x->0 ? 'intent_id' then raise exception 'Availability projection inconsistent or excessive'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001201',true);
do $$ declare x jsonb; y jsonb; p jsonb:=current_setting('pos.integrity.tender_payload')::jsonb; begin
  x:=public.commerce_start_attempt(p);
  y:=public.commerce_start_attempt(p);
  if (y->>'replayed')::boolean is not true or x->'attempt'->>'id' is distinct from y->'attempt'->>'id' or y->>'order_id' is null then raise exception 'Lost final tender acknowledgement could not replay after paid'; end if;
  begin perform public.commerce_start_attempt(p||jsonb_build_object('reference','CHANGED')); raise exception 'Changed reference reused tender key'; exception when sqlstate 'PT409' then null; end;
  begin perform public.commerce_start_attempt(p||jsonb_build_object('idempotency_key','integrity-new-tender')); raise exception 'New tender charged already paid intent'; exception when sqlstate 'PT409' then null; end;
end $$;

reset role;
do $$ declare v_order uuid; begin
  select finalized_order_id into v_order from public.commerce_intents where id=current_setting('pos.integrity.intent')::uuid;
  if (select count(*) from public.orders where commerce_intent_id=current_setting('pos.integrity.intent')::uuid)<>1 then raise exception 'Tender retry duplicated order'; end if;
  if (select stock_qty from public.product_variants where id='00000000-0000-0000-0000-000000001212')<>7 then raise exception 'Tender replay changed stock more than once'; end if;
  if (select count(*) from public.stock_movements where reference=(select order_number from public.orders where id=v_order))<>1 then raise exception 'Stock ledger did not have exactly one consumption'; end if;
  if (select external_reference from public.order_payments where order_id=v_order)<>'FICTIONAL-TRANSFER' then raise exception 'Manual tender reference was not retained'; end if;
end $$;

-- A provider capture with no staff JWT can consume tracked stock atomically.
-- Existing lifecycle coverage exercises mixed tenders; this covers a website
-- guest and verifies the normal stock RPC was not made publicly accessible.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
do $$ declare x jsonb; a jsonb; i uuid; p jsonb; begin
  x:=public.commerce_create_guest_intent('{"channel":"website","idempotency_key":"integrity-guest-intent","customer_snapshot":{"name":"Fixture guest"},"items":[{"variant_id":"00000000-0000-0000-0000-000000001212","quantity":1}]}');
  if x->'items'->0 ? 'unit_cost_agorot' then raise exception 'Website quote leaked acquisition cost'; end if;
  i:=(x->'intent'->>'id')::uuid;
  -- Quote-time stock tracking survives catalog edits while payment is pending.
  update public.products set tracking_mode='none' where id='00000000-0000-0000-0000-000000001211';
  a:=public.commerce_start_guest_attempt(jsonb_build_object('intent_id',i,'method','credit_card','amount_agorot',10000,'idempotency_key','integrity-guest-attempt','provider','payplus','environment','sandbox','merchant_ref','fictional-integrity'),x->>'guest_capability');
  p:=jsonb_build_object('verified',true,'verification_source','server_query','provider','payplus','environment','sandbox','merchant_ref','fictional-integrity','amount_agorot',10000,'currency','ILS','state','captured','transaction_uid','fictional-integrity-transaction','transaction_kind','charge');
  perform public.commerce_provider_result((a->'attempt'->>'id')::uuid,'integrity-provider-capture',p);
  perform public.commerce_provider_result((a->'attempt'->>'id')::uuid,'integrity-provider-capture',p);
  if (select count(*) from public.orders where commerce_intent_id=i)<>1 or (select stock_qty from public.product_variants where id='00000000-0000-0000-0000-000000001212')<>6 then raise exception 'Guest provider capture did not consume tracked stock once'; end if;
  begin perform public.record_stock_movement('00000000-0000-0000-0000-000000001212',-1,'sale',null,null,null); raise exception 'General stock writer widened to service callers'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.products set tracking_mode='serial' where id='00000000-0000-0000-0000-000000001211';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001201',true);
do $$ declare x jsonb; p jsonb; opened jsonb; begin
  x:=public.commerce_create_intent('{"channel":"pos","idempotency_key":"integrity-cash-intent","customer_snapshot":{"name":"Fixture cash buyer"},"items":[{"variant_id":"00000000-0000-0000-0000-000000001212","quantity":1}]}');
  p:=jsonb_build_object('intent_id',x->'intent'->>'id','method','cash','collection_kind','manual_recorded','amount_agorot',12000,'cash_received_agorot',15000,'confirmed_received',true,'idempotency_key','integrity-cash-tender');
  begin perform public.commerce_start_attempt(p); raise exception 'Cash tender did not require an open shift'; exception when sqlstate 'PT409' then null; end;
  opened:=public.commerce_write('cash_open','{"opening_float_agorot":10000}');
  perform set_config('pos.integrity.cash_session',opened->'data'->>'id',true);
  begin perform public.commerce_start_attempt(p||jsonb_build_object('installments',2)); raise exception 'Cash was recorded in installments'; exception when sqlstate '22023' then null; end;
  begin perform public.commerce_start_attempt(p||jsonb_build_object('cash_received_agorot',11000)); raise exception 'Cash received below tender was accepted'; exception when sqlstate '22023' then null; end;
  perform public.commerce_start_attempt(p);
  x:=public.commerce_start_attempt(p);
  if (x->>'replayed')::boolean is not true then raise exception 'Cash acknowledgement replay failed'; end if;
  begin
    perform public.commerce_write('cash_close',jsonb_build_object('session_id',current_setting('pos.integrity.cash_session'),'expected_revision',1,'counted_cash_agorot',22000));
    raise exception 'Stale cash balance revision closed shift';
  exception when sqlstate 'PT409' then null; end;
  x:=public.commerce_write('cash_close',jsonb_build_object('session_id',current_setting('pos.integrity.cash_session'),'expected_revision',2,'counted_cash_agorot',22000));
  if (x->'data'->>'variance_agorot')::bigint<>0 then raise exception 'Cash sale/change did not reconcile shift balance'; end if;
end $$;
reset role;
do $$ declare s uuid:=current_setting('pos.integrity.cash_session')::uuid; begin
  if (select count(*) from public.cash_movements where session_id=s and kind='sale_cash')<>1 then raise exception 'Cash retry duplicated cash movement'; end if;
  if (select signed_amount_agorot from public.cash_movements where session_id=s and kind='sale_cash')<>12000 or (select order_id from public.cash_movements where session_id=s and kind='sale_cash') is null then raise exception 'Cash movement did not record net tender and order linkage'; end if;
end $$;
rollback;
