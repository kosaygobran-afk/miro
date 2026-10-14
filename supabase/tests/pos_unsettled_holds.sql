-- Expiring the checkout timer must not discard stock behind uncertain money.
-- Every fixture and financial effect runs locally and is rolled back.
begin;
insert into auth.users(id,raw_user_meta_data) values('00000000-0000-0000-0000-000000001701','{"full_name":"Hold safety CEO"}');
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000001701';
insert into public.categories(id,slug,name_he,name_en) values('00000000-0000-0000-0000-000000001710','hold-safety','בדיקת החזקות','Hold safety');
insert into public.products(id,category_id,slug,name_he,name_en,price,tracking_mode) values('00000000-0000-0000-0000-000000001711','00000000-0000-0000-0000-000000001710','hold-safety','מוצר בדיקה','Hold safety',100,'serial');
update public.products set status='active' where id='00000000-0000-0000-0000-000000001711';
insert into public.product_variants(id,product_id,sku,is_default,is_active,stock_qty) values('00000000-0000-0000-0000-000000001712','00000000-0000-0000-0000-000000001711','HOLD-SAFETY',true,true,5);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001701',true);
do $$ declare x jsonb; begin
  x:=public.commerce_create_intent('{"channel":"pos","idempotency_key":"hold-partial-intent","customer_snapshot":{"name":"Fictional hold buyer"},"items":[{"variant_id":"00000000-0000-0000-0000-000000001712","quantity":2}]}');
  perform set_config('hold.safety.partial',x->'intent'->>'id',true);
  perform public.commerce_start_attempt(jsonb_build_object('intent_id',x->'intent'->>'id','method','bank_transfer','collection_kind','manual_recorded','amount_agorot',10000,'confirmed_received',true,'idempotency_key','hold-partial-tender'));
end $$;
reset role;
update public.commerce_intents set expires_at=now()-interval '1 minute' where id=current_setting('hold.safety.partial')::uuid;
update public.stock_reservations set expires_at=now()-interval '1 minute' where intent_id=current_setting('hold.safety.partial')::uuid;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
do $$ declare x jsonb; begin
  x:=public.commerce_expire_intents();
  if (x->>'reconciliation_exceptions')::int<>1 then raise exception 'Overdue captured funds were not escalated'; end if;
  if (select status from public.commerce_intents where id=current_setting('hold.safety.partial')::uuid)<>'exception' then raise exception 'Captured partial intent was silently expired'; end if;
  x:=public.commerce_pos_available_stock(array['00000000-0000-0000-0000-000000001712'::uuid]);
  if (x->0->>'available_qty')::int<>3 then raise exception 'Expiry exposed stock behind captured funds'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001701',true);
do $$ begin
  begin perform public.record_stock_movement('00000000-0000-0000-0000-000000001712',-4,'sale',null,null,null); raise exception 'Ledger consumed expired financial hold'; exception when sqlstate 'PT409' then null; end;
  begin perform public.commerce_create_intent('{"channel":"pos","idempotency_key":"hold-overbook-new-intent","customer_snapshot":{"name":"Fictional hold buyer"},"items":[{"variant_id":"00000000-0000-0000-0000-000000001712","quantity":4}]}'); raise exception 'New quote consumed expired financial hold'; exception when sqlstate 'PT409' then null; end;
  -- Explicitly confirmed remaining manual funds can complete an owned partial
  -- sale; already recorded tenders are not resubmitted.
  perform public.commerce_start_attempt(jsonb_build_object('intent_id',current_setting('hold.safety.partial'),'method','bank_transfer','collection_kind','manual_recorded','amount_agorot',10000,'confirmed_received',true,'idempotency_key','hold-remaining-tender'));
end $$;
reset role;
do $$ begin
  if (select stock_qty from public.product_variants where id='00000000-0000-0000-0000-000000001712')<>3 or (select status from public.commerce_intents where id=current_setting('hold.safety.partial')::uuid)<>'paid' then raise exception 'Manual resumed sale did not finalize once'; end if;
  if (select state from public.commerce_outbox where effect_key='expiry-capture-exception:'||current_setting('hold.safety.partial'))<>'done' then raise exception 'Resolved capture exception still outstanding'; end if;
end $$;
set local role authenticated;
do $$ declare x jsonb; begin
  x:=public.commerce_create_intent('{"channel":"pos","idempotency_key":"hold-provider-intent","customer_snapshot":{"name":"Fictional provider buyer"},"items":[{"variant_id":"00000000-0000-0000-0000-000000001712","quantity":2}]}');
  perform set_config('hold.safety.provider',x->'intent'->>'id',true);
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
do $$ declare x jsonb; begin
  x:=public.commerce_start_provider_attempt(jsonb_build_object('intent_id',current_setting('hold.safety.provider'),'method','credit_card','amount_agorot',20000,'idempotency_key','hold-provider-attempt','provider','payplus','environment','sandbox','merchant_ref','fictional-hold-merchant'),'00000000-0000-0000-0000-000000001701',null);
  perform set_config('hold.safety.attempt',x->'attempt'->>'id',true);
  perform public.commerce_mark_attempt_unknown((x->'attempt'->>'id')::uuid,'fictional-timeout');
  update public.commerce_intents set expires_at=now()-interval '1 minute' where id=current_setting('hold.safety.provider')::uuid;
  update public.stock_reservations set expires_at=now()-interval '1 minute' where intent_id=current_setting('hold.safety.provider')::uuid;
  perform public.commerce_expire_intents();
  x:=public.commerce_pos_available_stock(array['00000000-0000-0000-0000-000000001712'::uuid]);
  if (x->0->>'available_qty')::int<>1 then raise exception 'Unknown payment released reserved stock'; end if;
  if not exists(select 1 from public.commerce_outbox where effect_key='expiry-payment-query:'||current_setting('hold.safety.attempt') and effect_type='payment.query') then raise exception 'Unknown expired payment did not queue a read-only query'; end if;
  perform public.commerce_provider_result(current_setting('hold.safety.attempt')::uuid,'hold-verified-decline',jsonb_build_object('verified',true,'verification_source','server_query','provider','payplus','environment','sandbox','merchant_ref','fictional-hold-merchant','amount_agorot',20000,'currency','ILS','state','declined'));
  perform public.commerce_expire_intents();
  x:=public.commerce_pos_available_stock(array['00000000-0000-0000-0000-000000001712'::uuid]);
  if (x->0->>'available_qty')::int<>3 then raise exception 'Verified terminal non-charge did not release expired stock'; end if;
end $$;
reset role;
rollback;
