-- Recover a lost acknowledgement without recording the same money twice.
alter function public.commerce_write(text,jsonb) rename to commerce_write_operations;
revoke all on function public.commerce_write_operations(text,jsonb) from public,anon,authenticated;

create function public.commerce_write(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_role text:=public.active_app_role(); v_effect text;
  v_signed bigint; v_payment public.commerce_expense_payments%rowtype;
  v_movement public.cash_movements%rowtype; v_data jsonb;
begin
  if v_actor is null or coalesce(v_role,'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_action='cash_movement' and coalesce(p_payload->>'kind','') not in ('cash_in','cash_out','correction') then raise exception 'Cash kind is internal-only' using errcode='42501'; end if;
  if p_action in ('expense_pay','cash_movement') then
    v_effect:=p_payload->>'effect_key';
    if length(coalesce(v_effect,'')) not between 8 and 160 then raise exception 'Effect key required' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_action||':'||v_effect,0));
    if p_action='expense_pay' then
      select * into v_payment from public.commerce_expense_payments where effect_key=v_effect;
      if found then
        if v_payment.actor_id is distinct from v_actor
          or v_payment.expense_id is distinct from (p_payload->>'expense_id')::uuid
          or v_payment.amount_agorot is distinct from (p_payload->>'amount_agorot')::bigint
          or v_payment.method is distinct from p_payload->>'method'
          or v_payment.reference is distinct from p_payload->>'reference'
        then raise exception 'Payment replay payload conflict' using errcode='PT409'; end if;
        select to_jsonb(e) into v_data from public.commerce_expenses e where id=v_payment.expense_id;
        return jsonb_build_object('ok',true,'action',p_action,'data',v_data,'revision',v_data->'revision','replayed',true);
      end if;
    else
      v_signed:=case p_payload->>'kind'
        when 'cash_in' then (p_payload->>'amount_agorot')::bigint
        when 'cash_out' then -(p_payload->>'amount_agorot')::bigint
        when 'correction' then (p_payload->>'signed_amount_agorot')::bigint end;
      if v_signed is null or v_signed=0 or abs(v_signed)>100000000000 then raise exception 'Invalid signed cash amount' using errcode='22023'; end if;
      select * into v_movement from public.cash_movements where effect_key=v_effect;
      if found then
        if v_movement.actor_id is distinct from v_actor
          or v_movement.session_id is distinct from (p_payload->>'session_id')::uuid
          or v_movement.kind is distinct from p_payload->>'kind'
          or v_movement.signed_amount_agorot is distinct from v_signed
          or v_movement.reason is distinct from left(p_payload->>'reason',240)
          or v_movement.order_id is distinct from nullif(p_payload->>'order_id','')::uuid
        then raise exception 'Cash replay payload conflict' using errcode='PT409'; end if;
        select to_jsonb(s) into v_data from public.cash_sessions s where id=v_movement.session_id;
        return jsonb_build_object('ok',true,'action',p_action,'data',v_data,'revision',v_data->'revision','replayed',true);
      end if;
    end if;
  end if;
  return public.commerce_write_operations(p_action,p_payload);
end $$;
revoke all on function public.commerce_write(text,jsonb) from public,anon;
grant execute on function public.commerce_write(text,jsonb) to authenticated;

alter function public.commerce_read(text,jsonb) rename to commerce_read_operations;
revoke all on function public.commerce_read_operations(text,jsonb) from public,anon,authenticated;

create function public.commerce_read(p_section text,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text:=public.active_app_role(); v_result jsonb; v_rows jsonb; v_summary jsonb; v_count bigint;
  v_from date:=nullif(p_filters->>'from','')::date; v_to date:=nullif(p_filters->>'to','')::date;
  v_offset integer:=greatest(0,coalesce((p_filters->>'offset')::integer,0));
  v_limit integer:=least(200,greatest(1,coalesce((p_filters->>'limit')::integer,50)));
begin
  if coalesce(v_role,'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
  if v_from>v_to then raise exception 'Invalid date range' using errcode='22023'; end if;
  if p_section='payments' then
    select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('refunds',coalesce(r.rows,'[]'::jsonb)) order by a.created_at desc,a.id),'[]'::jsonb)
    into v_rows from (
      select id,intent_id,method,collection_kind,provider,environment,request_uid,transaction_uid,
        amount_agorot,currency,state,verified_collection_state,created_at,updated_at
      from public.payment_attempts
      where (nullif(p_filters->>'id','') is null or id=(p_filters->>'id')::uuid)
        and (nullif(p_filters->>'status','') is null or state=p_filters->>'status')
        and (v_from is null or timezone('Asia/Jerusalem',created_at)::date>=v_from)
        and (v_to is null or timezone('Asia/Jerusalem',created_at)::date<=v_to)
      order by created_at desc,id offset v_offset limit v_limit
    ) a left join lateral (
      select jsonb_agg(jsonb_build_object('id',id,'amount_agorot',amount_agorot,'currency','ILS',
        'state',state,'reason',reason,'provider_refund_uid',provider_refund_uid,'created_at',created_at,'updated_at',updated_at)
        order by created_at,id) rows from public.payment_refunds where attempt_id=a.id
    ) r on true;
    select count(*) into v_count from public.payment_attempts
      where (nullif(p_filters->>'id','') is null or id=(p_filters->>'id')::uuid)
        and (nullif(p_filters->>'status','') is null or state=p_filters->>'status')
        and (v_from is null or timezone('Asia/Jerusalem',created_at)::date>=v_from)
        and (v_to is null or timezone('Asia/Jerusalem',created_at)::date<=v_to);
    return jsonb_build_object('section',p_section,'rows',v_rows,'total_count',v_count,'summary',
      jsonb_build_object('timezone','Asia/Jerusalem','date_basis','attempt_created_at','scope','attempts and linked refund requests; manual recorded is operator confirmation, sandbox is test money'));
  end if;
  v_result:=public.commerce_read_operations(p_section,p_filters);
  if p_section='report' then
    v_summary:=v_result->'summary';
    v_from:=(v_summary->>'from')::date; v_to:=(v_summary->>'to')::date;
    v_summary:=v_summary||jsonb_build_object(
      'provider_captured_agorot',coalesce((select sum(amount_agorot) from public.payment_attempts where collection_kind='provider_collected' and environment='production' and (state in ('captured','partially_refunded','refunded') or verified_collection_state='captured') and timezone('Asia/Jerusalem',created_at)::date between v_from and v_to),0),
      'sandbox_captured_agorot',coalesce((select sum(amount_agorot) from public.payment_attempts where collection_kind='provider_collected' and environment='sandbox' and (state in ('captured','partially_refunded','refunded') or verified_collection_state='captured') and timezone('Asia/Jerusalem',created_at)::date between v_from and v_to),0),
      'manual_recorded_agorot',coalesce((select sum(amount_agorot) from public.payment_attempts where collection_kind='manual_recorded' and state='captured' and timezone('Asia/Jerusalem',created_at)::date between v_from and v_to),0),
      'refunds_succeeded_agorot',coalesce((select sum(r.amount_agorot) from public.payment_refunds r join public.payment_attempts a on a.id=r.attempt_id where r.state='succeeded' and a.environment='production' and timezone('Asia/Jerusalem',r.updated_at)::date between v_from and v_to),0),
      'settlement_gross_agorot',coalesce((select sum(gross_agorot) from public.settlement_entries where environment='production' and timezone('Asia/Jerusalem',settled_at)::date between v_from and v_to),0),
      'settlement_fee_agorot',coalesce((select sum(fee_agorot) from public.settlement_entries where environment='production' and timezone('Asia/Jerusalem',settled_at)::date between v_from and v_to),0),
      'settlement_net_agorot',coalesce((select sum(net_agorot) from public.settlement_entries where environment='production' and timezone('Asia/Jerusalem',settled_at)::date between v_from and v_to),0),
      'exceptions_count',(select count(*) from public.payment_attempts where state in ('exception','unknown') and timezone('Asia/Jerusalem',created_at)::date between v_from and v_to),
      'outbox_pending_count',(select count(*) from public.commerce_outbox where state<>'done'),
      'collection_date_basis','attempt_created_at',
      'refund_date_basis','last_verified_update_at',
      'settlement_date_basis','settled_at',
      'operations_scope','production verified collection, separately reported sandbox and manual confirmations; cash cohorts by attempt creation, refunds by verified update, settlements by settled date; outstanding jobs are current, all dates Asia/Jerusalem; excludes chargebacks, filing and unrecorded bank movements'
    );
    v_result:=jsonb_set(jsonb_set(v_result,'{summary}',v_summary),'{rows}',jsonb_build_array(v_summary));
  end if;
  return v_result;
end $$;
revoke all on function public.commerce_read(text,jsonb) from public,anon;
grant execute on function public.commerce_read(text,jsonb) to authenticated;

-- A remote refund may have succeeded even when its acknowledgement was lost.
-- Keep the balance reserved and queue only read-only lookup, never submission.
create function public.commerce_mark_refund_unknown(p_refund_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.payment_refunds%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select * into r from public.payment_refunds where id=p_refund_id for update;
  if not found then raise exception 'Refund not found' using errcode='22023'; end if;
  if r.state in ('requested','pending','unknown') then
    update public.payment_refunds set state='unknown',updated_at=now() where id=r.id;
    update public.commerce_outbox set state='pending',available_at=now(),last_error_code='refund_query_required',updated_at=now()
      where aggregate_type='payment_refund' and aggregate_id=r.id and effect_type='payment.refund.reconcile' and state='quarantined';
  end if;
  return jsonb_build_object('refund_id',r.id,'state',(select state from public.payment_refunds where id=r.id),'reconciliation_required',r.state<>'succeeded');
end $$;
revoke all on function public.commerce_mark_refund_unknown(uuid) from public,anon,authenticated;
grant execute on function public.commerce_mark_refund_unknown(uuid) to service_role;
