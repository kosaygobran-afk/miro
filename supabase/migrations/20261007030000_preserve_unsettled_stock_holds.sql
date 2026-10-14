-- An expired checkout timer is not evidence that pending/unknown/captured
-- money has been returned. Preserve its stock until reconciliation completes.
-- A hosted checkout may return after the stock timer. The capability receives
-- a bounded read-only grace period; all start/cancel write gates keep checking
-- the original expiry and server-verified payment state.
create or replace function public.commerce_guest_status(p_intent_id uuid,p_capability text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.commerce_intents%rowtype;
begin
  select * into i from public.commerce_intents where id=p_intent_id;
  if not found or i.expires_at+interval '30 minutes'<=now() or i.guest_capability_digest is null or encode(public.commerce_digest(coalesce(p_capability,''),'sha256'),'hex') is distinct from i.guest_capability_digest then raise exception 'Not found' using errcode='42501'; end if;
  return jsonb_build_object('intent_id',i.id,'state',i.status,'order_id',i.finalized_order_id,'total_agorot',i.total_agorot,'currency',i.currency,'updated_at',i.updated_at,'expires_at',i.expires_at,'read_only_expired',i.expires_at<=now());
end $$;

create or replace function public.commerce_guard_reserved_stock()
returns trigger language plpgsql security definer set search_path='' as $$
declare held bigint;
begin
  if new.stock_qty<old.stock_qty then
    select coalesce(sum(r.quantity),0) into held from public.stock_reservations r
    where r.variant_id=new.id and r.state='active' and (r.expires_at>now() or public.commerce_has_unsettled_payment(r.intent_id));
    if new.stock_qty<held then raise exception 'Stock is reserved by active or unsettled commerce intents' using errcode='PT409'; end if;
  end if;
  return new;
end $$;

create or replace function public.commerce_pos_available_stock(p_variant_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  if p_variant_ids is null or cardinality(p_variant_ids)>500 then raise exception 'Maximum 500 variant IDs' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('variant_id',pv.id,'stock_qty',pv.stock_qty,'reserved_qty',coalesce(r.quantity,0),'available_qty',greatest(0,pv.stock_qty-coalesce(r.quantity,0))) order by pv.id),'[]'::jsonb) into v_rows
  from public.product_variants pv left join lateral(
    select sum(sr.quantity)::bigint quantity from public.stock_reservations sr
    where sr.variant_id=pv.id and sr.state='active' and (sr.expires_at>now() or public.commerce_has_unsettled_payment(sr.intent_id))
  ) r on true where pv.id=any(p_variant_ids);
  return v_rows;
end $$;

create or replace function public.commerce_expire_intents(p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.commerce_intents%rowtype; v_expired integer:=0; v_exceptions integer:=0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  -- Previously escalated rows keep their holds but do not fill every batch,
  -- starving later unpaid expirations or new read-only reconciliation jobs.
  for i in select ci.* from public.commerce_intents ci
    where ci.expires_at<=now() and ci.status in ('reserved','awaiting_payment','partially_paid','exception')
      and (
        not public.commerce_has_unsettled_payment(ci.id)
        or (exists(select 1 from public.payment_attempts a where a.intent_id=ci.id and a.state in ('captured','partially_refunded','exception')) and not exists(select 1 from public.commerce_outbox o where o.effect_key='expiry-capture-exception:'||ci.id))
        or exists(select 1 from public.payment_attempts a where a.intent_id=ci.id and a.collection_kind='provider_collected' and a.state in ('created','pending','authorized','unknown','exception') and not exists(select 1 from public.commerce_outbox o where o.effect_key='expiry-payment-query:'||a.id))
      )
    order by ci.expires_at for update skip locked limit least(2000,greatest(1,coalesce(p_limit,500))) loop
    if public.commerce_has_unsettled_payment(i.id) then
      if exists(select 1 from public.payment_attempts where intent_id=i.id and state in ('captured','partially_refunded','exception')) then
        update public.commerce_intents set status='exception',revision=revision+1,updated_at=now() where id=i.id and status<>'exception';
        insert into public.commerce_outbox(effect_type,aggregate_type,aggregate_id,effect_key,payload,state,last_error_code)
        values('payment.capture_exception','commerce_intent',i.id,'expiry-capture-exception:'||i.id,jsonb_build_object('intent_id',i.id,'reason','expired_with_unsettled_funds'),'quarantined','expired_with_unsettled_funds') on conflict(effect_key) do nothing;
        if i.status<>'exception' then v_exceptions:=v_exceptions+1; end if;
      end if;
      -- Queue only a status lookup. Never resubmit an uncertain charge.
      insert into public.commerce_outbox(effect_type,aggregate_type,aggregate_id,effect_key,payload)
      select 'payment.query','payment_attempt',a.id,'expiry-payment-query:'||a.id,jsonb_build_object('attempt_id',a.id,'request_uid',a.request_uid,'provider',a.provider,'environment',a.environment,'merchant_ref',a.merchant_ref)
      from public.payment_attempts a where a.intent_id=i.id and a.collection_kind='provider_collected' and a.state in ('created','pending','authorized','unknown','exception') on conflict(effect_key) do nothing;
    else
      update public.commerce_intents set status='expired',revision=revision+1,updated_at=now() where id=i.id;
      update public.stock_reservations set state='expired',updated_at=now() where intent_id=i.id and state='active';
      v_expired:=v_expired+1;
    end if;
  end loop;
  return jsonb_build_object('expired_intents',v_expired,'reconciliation_exceptions',v_exceptions,'processed_at',now());
end $$;

-- Timeout marking and link claiming follow the same intent-first lock order
-- as tender creation/capture. The inner functions keep their existing checks.
alter function public.commerce_mark_attempt_unknown(uuid,text) rename to commerce_mark_attempt_unknown_core;
revoke all on function public.commerce_mark_attempt_unknown_core(uuid,text) from public,anon,authenticated,service_role;
create function public.commerce_mark_attempt_unknown(p_attempt_id uuid,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_intent uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select intent_id into v_intent from public.payment_attempts where id=p_attempt_id;
  perform 1 from public.commerce_intents where id=v_intent for update;
  return public.commerce_mark_attempt_unknown_core(p_attempt_id,p_error_code);
end $$;
revoke all on function public.commerce_mark_attempt_unknown(uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_mark_attempt_unknown(uuid,text) to service_role;

alter function public.commerce_claim_payment_link(uuid,text) rename to commerce_claim_payment_link_core;
revoke all on function public.commerce_claim_payment_link_core(uuid,text) from public,anon,authenticated,service_role;
create function public.commerce_claim_payment_link(p_intent_id uuid,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  perform 1 from public.commerce_intents where id=p_intent_id for update;
  return public.commerce_claim_payment_link_core(p_intent_id,p_token);
end $$;
revoke all on function public.commerce_claim_payment_link(uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_claim_payment_link(uuid,text) to service_role;
