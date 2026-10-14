begin;
insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000851','{"full_name":"Reporting CEO"}');
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000851';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000851',true);
do $$ declare s jsonb; m jsonb; sid uuid; rev int; e jsonb; eid uuid; p jsonb; begin
  s:=public.commerce_write('cash_open','{"opening_float_agorot":10000}'); sid:=(s->'data'->>'id')::uuid;
  p:=jsonb_build_object('session_id',sid,'kind','correction','signed_amount_agorot',-500,'reason','count correction','effect_key','replay-cash-851');
  m:=public.commerce_write('cash_movement',p); rev:=(m->>'revision')::int;
  m:=public.commerce_write('cash_movement',p);
  if m->>'replayed'<>'true' or (m->>'revision')::int<>rev then raise exception 'Cash replay mutated the shift'; end if;
  begin perform public.commerce_write('cash_movement',p||'{"signed_amount_agorot":-501}'::jsonb); raise exception 'Conflicting replay accepted'; exception when sqlstate 'PT409' then null; end;
  perform public.commerce_write('cash_close',jsonb_build_object('session_id',sid,'expected_revision',rev,'counted_cash_agorot',9500));
  perform public.commerce_write('cash_movement',p); -- A lost acknowledgement remains recoverable after closing.
  e:=public.commerce_write('expense_save','{"supplier":{"name":"Reporting Supplier"},"document":{"document_date":"2026-10-06","expense_date":"2026-10-06","category":"office","currency":"ILS","deductibility":"pending"},"items":[{"description":"test","quantity":1,"net_agorot":10000,"vat_agorot":1800,"gross_agorot":11800}],"attachments":[]}');
  eid:=(e->'data'->>'id')::uuid;
  perform public.commerce_write('expense_submit',jsonb_build_object('expense_id',eid,'expected_revision',1));
  perform public.commerce_write('expense_approve',jsonb_build_object('expense_id',eid,'expected_revision',2,'decision','approved'));
  p:=jsonb_build_object('expense_id',eid,'amount_agorot',11800,'method','bank_transfer','effect_key','replay-expense-851');
  e:=public.commerce_write('expense_pay',p); rev:=(e->>'revision')::int;
  e:=public.commerce_write('expense_pay',p);
  if e->>'replayed'<>'true' or (e->>'revision')::int<>rev then raise exception 'Expense replay mutated posted payment'; end if;
  begin perform public.commerce_write('expense_pay',p||'{"amount_agorot":11799}'::jsonb); raise exception 'Conflicting expense replay accepted'; exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
insert into public.commerce_intents(id,channel,idempotency_key,payload_hash,subtotal_agorot,discount_agorot,vat_agorot,total_agorot,vat_rate,expires_at)
values ('00000000-0000-0000-0000-000000000852','pos','report-intent-852',repeat('a',64),100000,0,0,100000,0,now()+interval '1 hour');
insert into public.payment_attempts(id,intent_id,method,collection_kind,provider,environment,merchant_ref,idempotency_key,payload_hash,amount_agorot,state)
values
('00000000-0000-0000-0000-000000000853','00000000-0000-0000-0000-000000000852','credit_card','provider_collected','payplus','production','fixture','report-attempt-853',repeat('b',64),5000,'partially_refunded'),
('00000000-0000-0000-0000-000000000854','00000000-0000-0000-0000-000000000852','credit_card','provider_collected','payplus','sandbox','fixture','report-attempt-854',repeat('c',64),9000,'captured'),
('00000000-0000-0000-0000-000000000855','00000000-0000-0000-0000-000000000852','cash','manual_recorded',null,null,null,'report-attempt-855',repeat('d',64),2000,'captured'),
('00000000-0000-0000-0000-000000000856','00000000-0000-0000-0000-000000000852','credit_card','provider_collected','payplus','production','fixture','report-attempt-856',repeat('e',64),7000,'unknown');
insert into public.payment_refunds(attempt_id,amount_agorot,state,reason,idempotency_key,payload_hash,effect_key)
values ('00000000-0000-0000-0000-000000000853',1000,'succeeded','fixture refund','report-refund-853',repeat('f',64),'report-refund-853');
insert into public.settlement_entries(provider,environment,merchant_ref,settlement_uid,gross_agorot,fee_agorot,net_agorot,settled_at)
values ('payplus','production','fixture','report-settlement-853',4000,100,3900,now()),('payplus','sandbox','fixture','report-settlement-854',9000,100,8900,now());
set local role authenticated;
do $$ declare r jsonb; s jsonb; begin
  r:=public.commerce_read('report',jsonb_build_object('from',timezone('Asia/Jerusalem',now())::date,'to',timezone('Asia/Jerusalem',now())::date)); s:=r->'summary';
  if (s->>'provider_captured_agorot')::bigint<>5000 or (s->>'sandbox_captured_agorot')::bigint<>9000 or (s->>'manual_recorded_agorot')::bigint<>2000 or (s->>'refunds_succeeded_agorot')::bigint<>1000 or (s->>'settlement_net_agorot')::bigint<>3900 then raise exception 'Reporting conflated unknown, manual, sandbox or settlement money: %',s; end if;
  r:=public.commerce_read('payments','{"id":"00000000-0000-0000-0000-000000000853"}');
  if (r->>'total_count')::int<>1 or jsonb_array_length(r->'rows'->0->'refunds')<>1 then raise exception 'Bounded refund history missing'; end if;
  begin perform public.commerce_read_operations('payments','{}'); raise exception 'Read wrapper bypass permitted'; exception when insufficient_privilege then null; end;
  begin perform public.commerce_write_operations('cash_open','{"opening_float_agorot":0}'); raise exception 'Write wrapper bypass permitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.profiles set account_status='suspended' where id='00000000-0000-0000-0000-000000000851';
set local role authenticated;
do $$ begin
  begin perform public.commerce_read('payments','{}'); raise exception 'Inactive actor read financial data'; exception when insufficient_privilege then null; end;
  begin perform public.commerce_write('cash_open','{"opening_float_agorot":0}'); raise exception 'Inactive actor opened cash shift'; exception when insufficient_privilege then null; end;
  begin perform public.commerce_create_intent('{"channel":"pos"}'); raise exception 'Inactive actor created POS intent'; exception when insufficient_privilege then null; end;
  begin perform public.commerce_request_refund('{"attempt_id":"00000000-0000-0000-0000-000000000853"}'); raise exception 'Inactive actor requested refund'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.commerce_read('payments','{}'); raise exception 'Anonymous read permitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
