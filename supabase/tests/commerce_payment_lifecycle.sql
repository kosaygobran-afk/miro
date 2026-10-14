-- End-to-end commerce intent/payment/refund lifecycle. Fictional fixtures only;
-- this suite runs in the disposable verifier DB and rolls everything back.
begin;

insert into auth.users(id,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000901','{"full_name":"Lifecycle CEO"}'),
 ('00000000-0000-0000-0000-000000000902','{"full_name":"Lifecycle Guest Customer"}');
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000901';

insert into public.categories(id,slug,name_he,name_en,is_active)
values ('00000000-0000-0000-0000-000000000910','lifecycle-fixture','בדיקת מחזור','Lifecycle fixture',true);
insert into public.products(id,category_id,slug,name_he,name_en,price,inventory_count,tracking_mode,sales_channel)
values
 ('00000000-0000-0000-0000-000000000911','00000000-0000-0000-0000-000000000910','lifecycle-pos','מוצר בדיקה','Lifecycle product',100,10,'serial','pos_and_online'),
 ('00000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000910','lifecycle-quote','מוצר הצעת מחיר','Quote only product',null,10,'none','contact_only');
update public.products set status='active' where id in ('00000000-0000-0000-0000-000000000911','00000000-0000-0000-0000-000000000912');
insert into public.product_variants(id,product_id,sku,is_default,is_active,stock_qty,pos_enabled,pos_price)
values
 ('00000000-0000-0000-0000-000000000913','00000000-0000-0000-0000-000000000911','LIFE-POS-1',true,true,10,true,100),
 ('00000000-0000-0000-0000-000000000914','00000000-0000-0000-0000-000000000912','LIFE-QUOTE-1',true,true,10,true,null);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000901',true);

-- Canonical POS price, active reservation, same-payload replay and conflict.
do $$ declare a jsonb; b jsonb; v_id uuid; p jsonb; begin
  p:=jsonb_build_object('channel','pos','idempotency_key','lifecycle-intent-001','customer_snapshot',jsonb_build_object('name','Fictional buyer'),
    'items',jsonb_build_array(jsonb_build_object('variant_id','00000000-0000-0000-0000-000000000913','quantity',2)));
  a:=public.commerce_create_intent(p); v_id:=(a->'intent'->>'id')::uuid;
  if (a->'intent'->>'total_agorot')::bigint<>20000 then raise exception 'POS did not use canonical configured price'; end if;
  b:=public.commerce_create_intent(p);
  if (b->>'replayed')::boolean is not true or (b->'intent'->>'id')::uuid<>v_id then raise exception 'Intent replay did not preserve original intent'; end if;
  begin
    perform public.commerce_create_intent(p||jsonb_build_object('customer_snapshot',jsonb_build_object('name','Changed payload')));
    raise exception 'Conflicting intent idempotency payload accepted';
  exception when sqlstate 'PT409' then null; end;
  perform set_config('commerce.test.intent',v_id::text,true);
end $$;

-- Existing stock RPC may consume unreserved quantity, but cannot cross the hold.
do $$ declare v_variant uuid:='00000000-0000-0000-0000-000000000913'; begin
  perform public.record_stock_movement(v_variant,-8,'sale','LIFECYCLE-SAFE-SALE','Consumes only unheld units',null);
  if (select stock_qty from public.product_variants where id=v_variant)<>2 then raise exception 'Safe stock movement incorrect'; end if;
  begin
    perform public.record_stock_movement(v_variant,-1,'sale','LIFECYCLE-OVER-SALE','Would consume held stock',null);
    raise exception 'Legacy stock movement consumed an active reservation';
  exception when sqlstate 'PT409' then null; end;
end $$;

-- Manual and provider attempts can coexist; provider capture is accepted only
-- after exact server-verified binding and charge classification.
do $$ declare x jsonb; begin
  x:=public.commerce_start_attempt(jsonb_build_object('intent_id',current_setting('commerce.test.intent')::uuid,'method','credit_card','collection_kind','manual_recorded','idempotency_key','manual-attempt-001','confirmed_received',true,'amount_agorot',5000));
  if x->'attempt'->>'state'<>'captured' then raise exception 'Manual tender was not recorded'; end if;
  perform set_config('commerce.test.manual_attempt',(x->'attempt'->>'id'),true);
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

do $$ declare x jsonb; v_attempt uuid; v_intent uuid:=current_setting('commerce.test.intent')::uuid; p jsonb; begin
  p:=jsonb_build_object('intent_id',v_intent,'method','bit','idempotency_key','provider-attempt-001','amount_agorot',15000,'provider','payplus','environment','sandbox','merchant_ref','fixture-merchant');
  x:=public.commerce_start_provider_attempt(p,'00000000-0000-0000-0000-000000000901',null);
  v_attempt:=(x->'attempt'->>'id')::uuid;
  if x->'attempt'->>'state'<>'pending' then raise exception 'Provider attempt was not pending'; end if;
  perform set_config('commerce.test.provider_attempt',v_attempt::text,true);
  -- Wrong amount/currency/merchant/transaction kind must fail closed.
  foreach p in array array[
    jsonb_build_object('amount_agorot',14999,'currency','ILS','merchant_ref','fixture-merchant','transaction_kind','charge'),
    jsonb_build_object('amount_agorot',15000,'currency','USD','merchant_ref','fixture-merchant','transaction_kind','charge'),
    jsonb_build_object('amount_agorot',15000,'currency','ILS','merchant_ref','other-merchant','transaction_kind','charge'),
    jsonb_build_object('amount_agorot',15000,'currency','ILS','merchant_ref','fixture-merchant','transaction_kind','authorization')
  ] loop
    begin
      perform public.commerce_provider_result(v_attempt,'bad-binding-'||md5(p::text),jsonb_build_object('verified',true,'verification_source','server_query','provider','payplus','environment','sandbox','state','captured','transaction_uid','fixture-tx','safe_metadata','{}'::jsonb)||p);
      raise exception 'Invalid verified capture binding accepted: %',p;
    exception when sqlstate 'PT409' then null; end;
  end loop;
  perform public.commerce_provider_result(v_attempt,'capture-valid-001',jsonb_build_object('verified',true,'verification_source','server_query','provider','payplus','environment','sandbox','merchant_ref','fixture-merchant','amount_agorot',15000,'currency','ILS','state','captured','transaction_uid','fixture-tx-001','transaction_kind','charge','safe_metadata','{}'::jsonb));
  if (select count(*) from public.orders where commerce_intent_id=v_intent)<>1 then raise exception 'Capture did not finalize exactly one order'; end if;
  if (select stock_qty from public.product_variants where id='00000000-0000-0000-0000-000000000913')<>0 then raise exception 'Finalization did not consume reservation exactly once'; end if;
  if (select count(*) from public.stock_movements where reference='MIRO-'||to_char(now(),'YYMMDD')||'-%')<0 then null; end if;
  perform public.commerce_provider_result(v_attempt,'capture-valid-001',jsonb_build_object('verified',true,'verification_source','server_query','provider','payplus','environment','sandbox','merchant_ref','fixture-merchant','amount_agorot',15000,'currency','ILS','state','captured','transaction_uid','fixture-tx-001','transaction_kind','charge','safe_metadata','{}'::jsonb));
  if (select count(*) from public.orders where commerce_intent_id=v_intent)<>1 then raise exception 'Provider event replay duplicated order'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000901',true);
do $$ declare a jsonb; b jsonb; v_id uuid; v_state text; begin
  a:=public.commerce_request_refund(jsonb_build_object('attempt_id',current_setting('commerce.test.provider_attempt')::uuid,'amount_agorot',5000,'reason','Fictional lifecycle test','idempotency_key','refund-lifecycle-001'));
  v_id:=(a->>'refund_id')::uuid;
  b:=public.commerce_request_refund(jsonb_build_object('attempt_id',current_setting('commerce.test.provider_attempt')::uuid,'amount_agorot',5000,'reason','Fictional lifecycle test','idempotency_key','refund-lifecycle-001'));
  if (b->>'replayed')::boolean is not true or (b->>'refund_id')::uuid<>v_id then raise exception 'Refund replay did not retain original effect'; end if;
  begin
    perform public.commerce_request_refund(jsonb_build_object('attempt_id',current_setting('commerce.test.provider_attempt')::uuid,'amount_agorot',10001,'reason','Over-refund','idempotency_key','refund-lifecycle-002'));
    raise exception 'Refund exceeded captured balance';
  exception when sqlstate 'PT409' then null; end;
  perform set_config('commerce.test.refund',v_id::text,true);
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare v_id uuid:=current_setting('commerce.test.refund')::uuid; p jsonb; begin
  p:=jsonb_build_object('verified',true,'verification_source','server_query','provider','payplus','environment','sandbox','merchant_ref','fixture-merchant','amount_agorot',5000,'currency','ILS','state','succeeded','refund_uid','fixture-refund-001','safe_metadata','{}'::jsonb);
  perform public.commerce_refund_result(v_id,'refund-event-001',p);
  if (select provider_refund_uid from public.payment_refunds where id=v_id)<>'fixture-refund-001' then raise exception 'Refund UID not stored'; end if;
  if (select state from public.payment_attempts where id=current_setting('commerce.test.provider_attempt')::uuid)<>'partially_refunded' then raise exception 'Partial refund state incorrect'; end if;
  begin
    perform public.commerce_refund_result(v_id,'refund-event-002',p||jsonb_build_object('refund_uid','different-refund-uid'));
    raise exception 'Refund UID mutation accepted';
  exception when sqlstate 'PT409' then null; end;
end $$;

-- Quote-only online item is rejected; guest capability is bound, scoped and expires.
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
-- Physical return/restock is a separate fixture action from the partial refund.
update public.product_variants set stock_qty=1 where id='00000000-0000-0000-0000-000000000913';
do $$ declare p jsonb; begin
  begin
    perform public.commerce_create_guest_intent(jsonb_build_object('channel','website','idempotency_key','quote-only-online-001','items',jsonb_build_array(jsonb_build_object('variant_id','00000000-0000-0000-0000-000000000914','quantity',1))));
    raise exception 'Quote-only product accepted for online checkout';
  exception when sqlstate '22023' then null; end;
end $$;
do $$ declare g jsonb; cap text; gid uuid; begin
  g:=public.commerce_create_guest_intent(jsonb_build_object('channel','website','idempotency_key','guest-lifecycle-001','items',jsonb_build_array(jsonb_build_object('variant_id','00000000-0000-0000-0000-000000000913','quantity',1))));
  gid:=(g->'intent'->>'id')::uuid; cap:=g->>'guest_capability';
  if length(cap)<32 then raise exception 'Guest capability was not issued'; end if;
  begin perform public.commerce_start_guest_attempt(jsonb_build_object('intent_id',gid,'method','credit_card','idempotency_key','guest-attempt-wrong-cap','provider','payplus','environment','sandbox','merchant_ref','fixture-merchant'),'wrong-capability'); raise exception 'Wrong guest capability accepted'; exception when insufficient_privilege then null; end;
  if public.commerce_guest_status(gid,cap)->>'intent_id' is distinct from gid::text then raise exception 'Guest token could not read its own intent'; end if;
  begin perform public.commerce_guest_status(gid,'wrong-capability'); raise exception 'Guest token read another intent'; exception when insufficient_privilege then null; end;
  update public.commerce_intents set expires_at=now()-interval '1 minute' where id=gid;
  if (public.commerce_guest_status(gid,cap)->>'read_only_expired')::boolean is not true then raise exception 'Late guest status did not indicate read-only expiry'; end if;
  update public.commerce_intents set expires_at=now()-interval '31 minutes' where id=gid;
  begin perform public.commerce_guest_status(gid,cap); raise exception 'Expired guest capability remained usable'; exception when insufficient_privilege then null; end;
end $$;

rollback;
