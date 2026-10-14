-- POS review: keep legacy history, restrict client authority and recover lost
-- acknowledgements before attempting another financial write.

create function public.commerce_has_unsettled_payment(p_intent_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.payment_attempts a join public.commerce_intents i on i.id=a.intent_id
    where a.intent_id=p_intent_id and i.finalized_order_id is null
      and a.state in ('created','pending','authorized','captured','partially_refunded','unknown','exception')
  );
$$;
revoke all on function public.commerce_has_unsettled_payment(uuid) from public,anon,authenticated,service_role;

-- Call while holding the variant's ledger and row locks. Pending financial
-- effects retain a hold even when the checkout countdown has expired.
create function public.commerce_check_unsettled_stock(p_items jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; v_stock integer; v_tracking text; v_held bigint;
begin
  for item in select value from jsonb_array_elements(p_items) loop
    select pv.stock_qty,p.tracking_mode into v_stock,v_tracking from public.product_variants pv join public.products p on p.id=pv.product_id where pv.id=(item->>'variant_id')::uuid;
    if v_tracking<>'none' then
      select coalesce(sum(r.quantity),0) into v_held from public.stock_reservations r where r.variant_id=(item->>'variant_id')::uuid and r.state='active' and (r.expires_at>now() or public.commerce_has_unsettled_payment(r.intent_id));
      if v_stock-(item->>'quantity')::integer<v_held then raise exception 'Insufficient available stock' using errcode='PT409'; end if;
    end if;
  end loop;
end $$;
revoke all on function public.commerce_check_unsettled_stock(jsonb) from public,anon,authenticated,service_role;

alter function public.commerce_create_intent(jsonb) rename to commerce_create_intent_core;
revoke all on function public.commerce_create_intent_core(jsonb) from public,anon,authenticated,service_role;

create function public.commerce_create_intent(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item jsonb; v_id uuid; v_existing uuid; v_role text:=public.active_app_role(); v_channel text:=p_payload->>'channel'; v_result jsonb; v_public_items jsonb;
begin
  if v_channel='pos' and (auth.uid() is null or coalesce(v_role,'') not in ('admin','ceo')) then raise exception 'Forbidden' using errcode='42501'; end if;
  if v_channel='website' and ((auth.uid() is not null and v_role is distinct from 'customer') or (auth.uid() is null and auth.role() is distinct from 'service_role')) then raise exception 'Forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 100 then raise exception 'Invalid items' using errcode='22023'; end if;
  -- Customers cannot set a promotion by invoking the RPC directly.
  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item->'variant_id') is distinct from 'string' or jsonb_typeof(v_item->'quantity') is distinct from 'number' then raise exception 'Invalid item' using errcode='22023'; end if;
    if v_channel='website' and v_item ? 'discount_per_unit_agorot' then raise exception 'Website discounts are server-owned' using errcode='42501'; end if;
  end loop;
  -- A missing row cannot be locked. Serialize the namespace before looking up
  -- a key, then take the same variant advisory lock as the stock ledger.
  perform pg_advisory_xact_lock(hashtextextended('commerce-intent:'||coalesce(auth.uid()::text,'guest')||':'||coalesce(p_payload->>'idempotency_key',''),0));
  select id into v_existing from public.commerce_intents where idempotency_actor_id is not distinct from auth.uid() and idempotency_key=p_payload->>'idempotency_key' for update;
  if v_existing is null then
    for v_id in select distinct (value->>'variant_id')::uuid from jsonb_array_elements(p_payload->'items') order by 1 loop
      perform pg_advisory_xact_lock(hashtext(v_id::text));
      perform 1 from public.product_variants where id=v_id for update;
    end loop;
    perform public.commerce_check_unsettled_stock(p_payload->'items');
  end if;
  v_result:=public.commerce_create_intent_core(p_payload);
  if v_channel='website' then
    select coalesce(jsonb_agg((select jsonb_object_agg(field.key,field.value) from jsonb_each(item.value) field where field.key in ('id','intent_id','line_no','product_id','variant_id','quantity','unit_price_agorot','discount_per_unit_agorot','discount_agorot','gross_agorot','net_agorot','vat_agorot','vat_rate','sku_snapshot','product_name_he','product_name_en')) order by item.ordinality),'[]'::jsonb) into v_public_items from jsonb_array_elements(v_result->'items') with ordinality item(value,ordinality);
    v_result:=jsonb_set(v_result,'{items}',v_public_items);
  end if;
  return v_result;
end $$;
revoke all on function public.commerce_create_intent(jsonb) from public,anon,service_role;
grant execute on function public.commerce_create_intent(jsonb) to authenticated;

-- Legacy sale callers retain explicit discounts, but cannot replace catalog
-- pricing, bypass POS eligibility, or reuse another actor/payload's key.
alter function public.record_pos_sale(jsonb,jsonb,jsonb,text) rename to record_pos_sale_core;
revoke all on function public.record_pos_sale_core(jsonb,jsonb,jsonb,text) from public,anon,authenticated,service_role;
create function public.record_pos_sale(p_customer jsonb,p_items jsonb,p_payments jsonb,p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_role text:=public.active_app_role(); v_hash text; v_order public.orders%rowtype; v_result jsonb; v_item jsonb; v_id uuid; v_price numeric; v_enabled boolean;
begin
  if v_actor is null or coalesce(v_role,'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_idempotency_key is not null and length(p_idempotency_key) not between 8 and 160 then raise exception 'Invalid idempotency key' using errcode='22023'; end if;
  v_hash:=encode(public.commerce_digest(jsonb_build_object('customer',p_customer,'items',p_items,'payments',p_payments)::text,'sha256'),'hex');
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('legacy-pos:'||p_idempotency_key,0));
    select * into v_order from public.orders where idempotency_key=p_idempotency_key;
    if found then
      if v_order.source is distinct from 'pos' or v_order.recorded_by is distinct from v_actor or v_order.idempotency_payload_hash is distinct from v_hash then raise exception 'Sale idempotency binding conflict' using errcode='PT409'; end if;
      return jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'total_gross',v_order.total,'net_total',v_order.net_total,'vat_total',v_order.vat_total,'source',v_order.source,'status',v_order.status,'replayed',true);
    end if;
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Invalid items' using errcode='22023'; end if;
  if (select count(distinct value->>'variant_id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'Duplicate variants must be merged' using errcode='22023'; end if;
  if not exists(select 1 from public.tax_rates where is_active and valid_from<=current_date and (valid_until is null or valid_until>=current_date)) then raise exception 'No effective tax rate configured' using errcode='22023'; end if;
  for v_id in select (value->>'variant_id')::uuid from jsonb_array_elements(p_items) order by 1 loop
    perform pg_advisory_xact_lock(hashtext(v_id::text));
    perform 1 from public.product_variants where id=v_id for update;
  end loop;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select coalesce(pv.pos_price,pv.price_override,p.sale_price,p.price),pv.pos_enabled into v_price,v_enabled from public.product_variants pv join public.products p on p.id=pv.product_id where pv.id=(v_item->>'variant_id')::uuid;
    if not found or v_enabled is not true or v_price is null then raise exception 'POS price or eligibility is unavailable' using errcode='22023'; end if;
    if jsonb_typeof(v_item->'unit_price') is distinct from 'number' or (v_item->>'unit_price')::numeric is distinct from v_price then raise exception 'POS price changed; review the catalog price' using errcode='PT409'; end if;
    if coalesce((v_item->>'discount_per_unit')::numeric,0)<>round(coalesce((v_item->>'discount_per_unit')::numeric,0),2) then raise exception 'Discount must use whole agorot' using errcode='22023'; end if;
  end loop;
  if nullif(p_customer->>'customer_id','') is not null and not exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=(p_customer->>'customer_id')::uuid and r.role='customer' and p.account_status='active') then raise exception 'Invalid customer account' using errcode='22023'; end if;
  v_result:=public.record_pos_sale_core(p_customer,p_items,p_payments,p_idempotency_key);
  update public.orders set idempotency_actor_id=v_actor,idempotency_payload_hash=v_hash where id=(v_result->>'order_id')::uuid;
  return v_result||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.record_pos_sale(jsonb,jsonb,jsonb,text) from public,anon;
grant execute on function public.record_pos_sale(jsonb,jsonb,jsonb,text) to authenticated;

create or replace function public.commerce_start_attempt(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid; i public.commerce_intents%rowtype; v_actor uuid:=auth.uid(); v_role text:=public.active_app_role(); v_kind text:=p_payload->>'collection_kind'; v_method text:=p_payload->>'method'; v_provider text:=nullif(p_payload->>'provider',''); v_env text:=nullif(p_payload->>'environment',''); v_key text:=p_payload->>'idempotency_key'; v_hash text; v_amount bigint; v_installments integer; v_existing public.payment_attempts%rowtype; v_session uuid; v_reference text:=nullif(btrim(p_payload->>'reference'),''); v_merchant text:=nullif(p_payload->>'merchant_ref','');
begin
  if auth.role()='service_role' and v_actor is null and nullif(p_payload->>'actor_id','') is not null then
    v_actor:=(p_payload->>'actor_id')::uuid;
    select r.role into v_role from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=v_actor and p.account_status='active';
  end if;
  if length(coalesce(v_key,'')) not between 8 and 160 then raise exception 'Invalid idempotency key' using errcode='22023'; end if;
  select * into i from public.commerce_intents where id=(p_payload->>'intent_id')::uuid for update;
  if not found then raise exception 'Intent unavailable' using errcode='PT409'; end if;
  if i.channel='pos' then
    if v_actor is null then
      if auth.role() is distinct from 'service_role' or i.guest_capability_digest is null or encode(public.commerce_digest(coalesce(p_payload->>'_guest_capability',''),'sha256'),'hex') is distinct from i.guest_capability_digest then raise exception 'Guest capability invalid' using errcode='42501'; end if;
    elsif coalesce(v_role,'') not in ('admin','ceo') or i.actor_id is distinct from v_actor then raise exception 'Forbidden' using errcode='42501'; end if;
  elsif i.customer_id is not null then
    if v_actor is distinct from i.customer_id or v_role is distinct from 'customer' then raise exception 'Forbidden' using errcode='42501'; end if;
  elsif auth.role() is distinct from 'service_role' then raise exception 'Guest capability required' using errcode='42501'; end if;
  if v_kind is null or v_kind not in ('manual_recorded','provider_collected') or v_method is null or v_method not in ('cash','credit_card','bank_transfer','bit','check','other') then raise exception 'Invalid tender' using errcode='22023'; end if;
  if v_kind='provider_collected' and auth.role() is distinct from 'service_role' then raise exception 'Provider attempts are server-only' using errcode='42501'; end if;
  if v_kind='manual_recorded' and (i.channel<>'pos' or coalesce(v_role,'') not in ('admin','ceo') or p_payload->'confirmed_received' is distinct from 'true'::jsonb) then raise exception 'Confirmed POS tender required' using errcode='42501'; end if;
  if v_kind='provider_collected' and (v_provider is null or v_env is null or v_env not in ('sandbox','production') or v_merchant is null or v_method not in ('credit_card','bit')) then raise exception 'Provider binding required' using errcode='22023'; end if;
  if v_kind='manual_recorded' and (v_provider is not null or v_env is not null or v_merchant is not null) then raise exception 'Manual tender cannot claim provider verification' using errcode='22023'; end if;
  v_amount:=coalesce((p_payload->>'amount_agorot')::bigint,i.total_agorot);
  v_installments:=coalesce((p_payload->>'installments')::integer,1);
  if v_amount<1 or v_amount>i.total_agorot or v_installments not between 1 and 36 or (v_method='cash' and v_installments<>1) or length(coalesce(v_reference,''))>120 then raise exception 'Invalid tender amount, installments or reference' using errcode='22023'; end if;
  if v_method='cash' and coalesce((p_payload->>'cash_received_agorot')::bigint,v_amount)<v_amount then raise exception 'Insufficient cash received' using errcode='22023'; end if;
  v_hash:=encode(public.commerce_digest(jsonb_build_object('intent_id',i.id,'method',v_method,'kind',v_kind,'provider',v_provider,'environment',v_env,'merchant',v_merchant,'amount',v_amount,'installments',v_installments,'reference',v_reference,'cash_received_agorot',case when v_method='cash' then coalesce((p_payload->>'cash_received_agorot')::bigint,v_amount) end)::text,'sha256'),'hex');
  select * into v_existing from public.payment_attempts where intent_id=i.id and idempotency_actor_id is not distinct from v_actor and idempotency_key=v_key for update;
  if found then
    if v_existing.payload_hash<>v_hash then raise exception 'Idempotency payload conflict' using errcode='PT409'; end if;
    return jsonb_build_object('attempt',jsonb_build_object('id',v_existing.id,'state',v_existing.state,'amount_agorot',v_existing.amount_agorot,'provider',v_existing.provider,'environment',v_existing.environment,'method',v_existing.method,'request_uid',v_existing.request_uid,'hosted_url',v_existing.safe_metadata->>'hosted_url'),'order_id',i.finalized_order_id,'replayed',true);
  end if;
  -- Final tender acknowledgement may be lost after status becomes paid. Only
  -- an existing identical attempt may replay; a new write still fails closed.
  -- A manager may explicitly record the remaining received manual funds on an
  -- overdue partial sale. Its original hold is still protected; an uncertain
  -- provider effect must be reconciled before this path can resume.
  if i.channel='pos' and v_kind='manual_recorded' and i.status in ('partially_paid','exception') and i.expires_at<=now()
    and exists(select 1 from public.payment_attempts where intent_id=i.id and collection_kind='manual_recorded' and state='captured')
    and not exists(select 1 from public.payment_attempts where intent_id=i.id and state in ('created','pending','authorized','captured','partially_refunded','unknown','exception') and (collection_kind<>'manual_recorded' or state<>'captured')) then
    i.expires_at:=now()+interval '15 minutes'; i.status:='partially_paid';
    update public.commerce_intents set expires_at=i.expires_at,status='partially_paid',revision=revision+1,updated_at=now() where id=i.id;
    update public.stock_reservations set expires_at=i.expires_at,updated_at=now() where intent_id=i.id and state='active';
    insert into public.audit_events(action,user_id,details,entity_type,entity_id) values('pos_partial_intent_resumed',v_actor,jsonb_build_object('intent_id',i.id,'reason','explicit_remaining_manual_tender'),'commerce_intent',i.id);
  end if;
  if i.status not in ('reserved','awaiting_payment','partially_paid') or i.expires_at<=now() then raise exception 'Intent unavailable' using errcode='PT409'; end if;
  if v_amount+coalesce((select sum(amount_agorot) from public.payment_attempts where intent_id=i.id and state not in ('declined','voided','refunded')),0)>i.total_agorot then raise exception 'Tender allocations exceed intent total' using errcode='PT409'; end if;
  if v_kind='manual_recorded' and v_method='cash' then
    select id into v_session from public.cash_sessions where actor_id=v_actor and state='open' for update;
    if v_session is null then raise exception 'Open cash shift required' using errcode='PT409'; end if;
  end if;
  insert into public.payment_attempts(intent_id,method,collection_kind,provider,environment,merchant_ref,idempotency_actor_id,idempotency_key,payload_hash,amount_agorot,installments,state,provider_effect_key,safe_metadata)
  values(i.id,v_method,v_kind,v_provider,v_env,v_merchant,v_actor,v_key,v_hash,v_amount,v_installments,case when v_kind='manual_recorded' then 'captured' else 'pending' end,gen_random_uuid()::text,case when v_kind='manual_recorded' then jsonb_build_object('reference',v_reference,'confirmed_received',true) else '{}'::jsonb end) returning id into a;
  if v_kind='manual_recorded' and v_method='cash' then
    insert into public.cash_movements(session_id,kind,signed_amount_agorot,reason,effect_key,actor_id) values(v_session,'sale_cash',v_amount,'POS cash tender','sale-cash:'||a,v_actor);
    update public.cash_sessions set revision=revision+1 where id=v_session;
  end if;
  update public.commerce_intents set status='awaiting_payment',updated_at=now() where id=i.id;
  if v_kind='manual_recorded' then perform public.commerce_finalize_intent(i.id); end if;
  return jsonb_build_object('attempt',jsonb_build_object('id',a,'state',case when v_kind='manual_recorded' then 'captured' else 'pending' end,'amount_agorot',v_amount,'provider',v_provider,'environment',v_env,'method',v_method),'replayed',false);
end $$;

-- Finalization is a private effect, called only after tender validation. Do
-- not grant customers/service callers the general staff stock writer.
create or replace function public.commerce_finalize_intent(p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.commerce_intents%rowtype; v_order uuid; v_number text; item record; attempt record; v_paid bigint; v_previous integer; v_next integer; v_id uuid;
begin
  select * into i from public.commerce_intents where id=p_intent_id for update;
  if not found then raise exception 'Intent not found' using errcode='22023'; end if;
  if i.finalized_order_id is not null then return jsonb_build_object('order_id',i.finalized_order_id,'status','paid','replayed',true); end if;
  if i.status in ('cancelled','expired') then raise exception 'Intent has been released' using errcode='PT409'; end if;
  select coalesce(sum(amount_agorot),0) into v_paid from public.payment_attempts where intent_id=i.id and state='captured';
  if v_paid<i.total_agorot then
    update public.commerce_intents set status=case when v_paid>0 then 'partially_paid' else 'awaiting_payment' end,updated_at=now() where id=i.id;
    return jsonb_build_object('intent_id',i.id,'status',case when v_paid>0 then 'partially_paid' else 'awaiting_payment' end,'paid_agorot',v_paid,'due_agorot',i.total_agorot-v_paid,'replayed',false);
  end if;
  if v_paid<>i.total_agorot or i.total_agorot<=0 or not exists(select 1 from public.commerce_intent_items where intent_id=i.id) then raise exception 'Captured amount must equal a nonempty intent total' using errcode='PT409'; end if;
  for v_id in select variant_id from public.commerce_intent_items where intent_id=i.id order by variant_id loop
    perform pg_advisory_xact_lock(hashtext(v_id::text));
    perform 1 from public.product_variants where id=v_id for update;
  end loop;
  v_number:='MIRO-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,5,'0');
  insert into public.orders(order_number,status,currency,customer_name,customer_email,customer_phone,user_id,recorded_by,source,subtotal,vat_total,total,net_total,shipping_cost,notes,created_at,updated_at,commerce_intent_id,idempotency_key)
  values(v_number,'paid','ILS',nullif(i.customer_snapshot->>'name',''),nullif(i.customer_snapshot->>'email',''),nullif(i.customer_snapshot->>'phone',''),i.customer_id,i.actor_id,case when i.channel='pos' then 'pos' else 'website' end,i.subtotal_agorot/100.0,i.vat_agorot/100.0,i.total_agorot/100.0,i.subtotal_agorot/100.0,0,null,now(),now(),i.id,'commerce:'||i.id) returning id into v_order;
  -- Presence of the quote's reservation snapshots stock tracking. A later
  -- catalog edit cannot turn a held item into an untracked sale.
  for item in select ci.*,exists(select 1 from public.stock_reservations sr where sr.intent_id=ci.intent_id and sr.variant_id=ci.variant_id) as tracked_at_quote from public.commerce_intent_items ci where ci.intent_id=i.id order by ci.variant_id loop
    insert into public.order_items(order_id,product_id,variant_id,quantity,unit_price,total_price,sku_snapshot,product_name_he,product_name_en,unit_cost,vat_rate,vat_amount,discount_amount,net_amount)
    values(v_order,item.product_id,item.variant_id,item.quantity,item.unit_price_agorot/100.0,item.gross_agorot/100.0,item.sku_snapshot,item.product_name_he,item.product_name_en,item.unit_cost_agorot/100.0,item.vat_rate,item.vat_agorot/100.0,item.discount_agorot/100.0,item.net_agorot/100.0);
    update public.stock_reservations set state='consumed',consumed_order_id=v_order,updated_at=now() where intent_id=i.id and variant_id=item.variant_id and state='active';
    if item.tracked_at_quote then
      select stock_qty into v_previous from public.product_variants where id=item.variant_id;
      v_next:=v_previous-item.quantity;
      if v_next<0 then raise exception 'Insufficient stock for captured intent' using errcode='PT409'; end if;
      -- The reserved-stock trigger still protects every other active hold.
      update public.product_variants set stock_qty=v_next,updated_at=now() where id=item.variant_id;
      insert into public.stock_movements(variant_id,delta,previous_qty,resulting_qty,type,reference,unit_cost,note,actor_id)
      values(item.variant_id,-item.quantity,v_previous,v_next,'sale',v_number,item.unit_cost_agorot/100.0,'Commerce intent finalized',i.actor_id);
      insert into public.audit_events(action,user_id,details,entity_type,entity_id)
      values('stock_movement',i.actor_id,jsonb_build_object('variant_id',item.variant_id,'delta',-item.quantity,'type','sale','previous_qty',v_previous,'resulting_qty',v_next,'reference',v_number,'intent_id',i.id),'product_variant',item.variant_id);
    end if;
  end loop;
  for attempt in select * from public.payment_attempts where intent_id=i.id and state='captured' order by created_at,id loop
    insert into public.order_payments(order_id,payment_method,amount,currency,installments,payment_status,external_reference,recorded_by,paid_at,commerce_attempt_id,collection_kind,provider,provider_transaction_uid)
    values(v_order,attempt.method,attempt.amount_agorot/100.0,'ILS',attempt.installments,'paid',coalesce(attempt.transaction_uid,attempt.safe_metadata->>'reference'),coalesce(attempt.idempotency_actor_id,i.actor_id),attempt.updated_at,attempt.id,attempt.collection_kind,attempt.provider,attempt.transaction_uid);
  end loop;
  update public.cash_movements set order_id=v_order where effect_key in (select 'sale-cash:'||id from public.payment_attempts where intent_id=i.id and state='captured');
  update public.commerce_intents set status='paid',finalized_order_id=v_order,updated_at=now() where id=i.id;
  update public.commerce_outbox set state='done',completed_at=now(),last_error_code=null,updated_at=now() where effect_key='expiry-capture-exception:'||i.id;
  insert into public.audit_events(action,user_id,details,entity_type,entity_id) values('commerce_intent_finalized',i.actor_id,jsonb_build_object('intent_id',i.id,'order_id',v_order,'total_agorot',i.total_agorot,'channel',i.channel),'sale_order',v_order);
  insert into public.commerce_outbox(effect_type,aggregate_type,aggregate_id,effect_key,payload) values('document.create','order',v_order,'document:create:'||v_order,jsonb_build_object('order_id',v_order)) on conflict(effect_key) do nothing;
  return jsonb_build_object('order_id',v_order,'order_number',v_number,'status','paid','replayed',false);
end $$;

-- All payment paths lock intent before attempt. This prevents capture/replay
-- from taking the inverse order to start_attempt and cancellation.
alter function public.commerce_provider_result(uuid,text,jsonb) rename to commerce_provider_result_core;
revoke all on function public.commerce_provider_result_core(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.commerce_provider_result(p_attempt_id uuid,p_event_key text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_intent uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select intent_id into v_intent from public.payment_attempts where id=p_attempt_id;
  perform 1 from public.commerce_intents where id=v_intent for update;
  return public.commerce_provider_result_core(p_attempt_id,p_event_key,p_result);
end $$;
revoke all on function public.commerce_provider_result(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_provider_result(uuid,text,jsonb) to service_role;

create function public.commerce_pos_available_stock(p_variant_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  if p_variant_ids is null or cardinality(p_variant_ids)>500 then raise exception 'Maximum 500 variant IDs' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('variant_id',pv.id,'stock_qty',pv.stock_qty,'reserved_qty',coalesce(r.quantity,0),'available_qty',greatest(0,pv.stock_qty-coalesce(r.quantity,0))) order by pv.id),'[]'::jsonb) into v_rows
  from public.product_variants pv left join lateral(select sum(sr.quantity)::bigint quantity from public.stock_reservations sr where sr.variant_id=pv.id and sr.state='active' and sr.expires_at>now()) r on true where pv.id=any(p_variant_ids);
  return v_rows;
end $$;
revoke all on function public.commerce_pos_available_stock(uuid[]) from public,anon,authenticated;
grant execute on function public.commerce_pos_available_stock(uuid[]) to service_role;

-- Capability validation remains identical for server orchestration and browser
-- clients; service access does not bypass its token/expiry checks.
grant execute on function public.commerce_guest_status(uuid,text) to service_role;
