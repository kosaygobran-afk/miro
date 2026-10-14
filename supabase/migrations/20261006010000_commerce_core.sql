-- Additive commerce core. Existing orders and stock ledger remain canonical history.
-- New holds are soft reservations and never change on-hand stock_qty.

-- Schema-qualified core hashing avoids the deployment-dependent pgcrypto
-- extension schema inside SECURITY DEFINER functions with an empty search path.
create function public.commerce_digest(p_value text,p_algorithm text)
returns bytea language sql immutable strict set search_path='' as $$
  select case when p_algorithm='sha256' then pg_catalog.sha256(pg_catalog.convert_to(p_value,'UTF8')) end;
$$;
create function public.commerce_random_token()
returns text language sql volatile set search_path='' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.gen_random_uuid()::text||pg_catalog.gen_random_uuid()::text||pg_catalog.gen_random_uuid()::text,'UTF8')),'hex');
$$;
revoke all on function public.commerce_digest(text,text),public.commerce_random_token() from public,anon,authenticated;
grant execute on function public.commerce_digest(text,text),public.commerce_random_token() to service_role;

alter table public.products
  add column if not exists sales_channel text not null default 'contact_only'
    check (sales_channel in ('contact_only','pos_only','online_checkout','pos_and_online'));
alter table public.product_variants
  add column if not exists pos_enabled boolean not null default true,
  add column if not exists pos_price numeric(12,2)
    check (pos_price is null or pos_price > 0);

alter table public.orders
  add column if not exists commerce_intent_id uuid,
  add column if not exists idempotency_actor_id uuid references auth.users(id) on delete set null,
  add column if not exists idempotency_payload_hash text;
create unique index if not exists orders_commerce_intent_unique
  on public.orders(commerce_intent_id) where commerce_intent_id is not null;

alter table public.order_payments
  alter column paid_at drop not null,
  add column if not exists commerce_attempt_id uuid,
  add column if not exists collection_kind text not null default 'manual_recorded'
    check (collection_kind in ('manual_recorded','provider_collected')),
  add column if not exists provider text,
  add column if not exists provider_transaction_uid text;

create table if not exists public.commerce_intents (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('pos','website')),
  status text not null default 'reserved'
    check (status in ('reserved','awaiting_payment','partially_paid','paid','cancelled','expired','exception')),
  revision integer not null default 1 check (revision > 0),
  idempotency_actor_id uuid references auth.users(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  actor_id uuid references auth.users(id) on delete set null,
  customer_id uuid references auth.users(id) on delete set null,
  customer_snapshot jsonb not null default '{}'::jsonb,
  guest_capability_digest text,
  currency text not null default 'ILS' check (currency = 'ILS'),
  subtotal_agorot bigint not null check (subtotal_agorot between 0 and 100000000000),
  discount_agorot bigint not null check (discount_agorot between 0 and 100000000000),
  vat_agorot bigint not null check (vat_agorot between 0 and 100000000000),
  total_agorot bigint not null check (total_agorot between 0 and 100000000000),
  vat_rate numeric(5,2) not null check (vat_rate >= 0 and vat_rate < 100),
  prices_include_vat boolean not null default true,
  expires_at timestamptz not null,
  finalized_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(idempotency_actor_id,idempotency_key)
);
create index if not exists commerce_intents_status_expiry_idx
  on public.commerce_intents(status,expires_at);
create index if not exists commerce_intents_customer_idx
  on public.commerce_intents(customer_id,created_at desc);
create unique index if not exists commerce_intents_actor_key_unique
  on public.commerce_intents(coalesce(idempotency_actor_id,'00000000-0000-0000-0000-000000000000'::uuid),idempotency_key);

create table if not exists public.commerce_intent_items (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.commerce_intents(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 10000),
  unit_price_agorot bigint not null check (unit_price_agorot between 1 and 100000000),
  discount_per_unit_agorot bigint not null default 0 check (discount_per_unit_agorot >= 0),
  discount_agorot bigint not null check (discount_agorot >= 0),
  gross_agorot bigint not null check (gross_agorot >= 0),
  net_agorot bigint not null check (net_agorot >= 0),
  vat_agorot bigint not null check (vat_agorot >= 0),
  vat_rate numeric(5,2) not null,
  unit_cost_agorot bigint not null default 0 check (unit_cost_agorot >= 0),
  sku_snapshot text,
  product_name_he text,
  product_name_en text,
  unique(intent_id,line_no)
);

create table if not exists public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.commerce_intents(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  state text not null default 'active' check (state in ('active','consumed','released','expired')),
  expires_at timestamptz not null,
  consumed_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(intent_id,variant_id)
);
create index if not exists stock_reservations_available_idx
  on public.stock_reservations(variant_id,expires_at) where state='active';

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.commerce_intents(id) on delete restrict,
  method text not null check (method in ('cash','credit_card','bank_transfer','bit','check','other')),
  collection_kind text not null check (collection_kind in ('manual_recorded','provider_collected')),
  provider text,
  environment text check (environment is null or environment in ('sandbox','production')),
  merchant_ref text,
  request_uid text,
  transaction_uid text,
  idempotency_actor_id uuid references auth.users(id) on delete set null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  amount_agorot bigint not null check (amount_agorot between 1 and 100000000000),
  currency text not null default 'ILS' check (currency='ILS'),
  installments integer not null default 1 check (installments between 1 and 36),
  state text not null default 'created' check (state in ('created','pending','authorized','captured','declined','voided','partially_refunded','refunded','unknown','exception')),
  verified_collection_state text check (verified_collection_state is null or verified_collection_state in ('pending','authorized','captured','declined','voided','unknown')),
  provider_effect_key text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_attempts_provider_txn_unique
  on public.payment_attempts(provider,environment,merchant_ref,transaction_uid)
  where transaction_uid is not null;
create index if not exists payment_attempts_intent_idx on public.payment_attempts(intent_id,created_at);
create unique index if not exists payment_attempts_intent_actor_key_unique
  on public.payment_attempts(intent_id,coalesce(idempotency_actor_id,'00000000-0000-0000-0000-000000000000'::uuid),idempotency_key);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  environment text not null check (environment in ('sandbox','production')),
  merchant_ref text not null,
  event_key text not null,
  attempt_id uuid references public.payment_attempts(id) on delete restrict,
  verified_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload_hash text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  processing_state text not null default 'received' check(processing_state in ('received','applied','rejected','exception')),
  result_state text,
  unique(provider,environment,merchant_ref,event_key)
);
create index if not exists payment_events_attempt_idx on public.payment_events(attempt_id,received_at);

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  amount_agorot bigint not null check (amount_agorot > 0),
  state text not null default 'requested' check(state in ('requested','pending','succeeded','failed','unknown','cancelled')),
  reason text not null,
  idempotency_actor_id uuid references auth.users(id) on delete set null,
  idempotency_key text not null,
  payload_hash text not null,
  provider_refund_uid text,
  effect_key text not null unique,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(idempotency_actor_id,idempotency_key)
);
create unique index if not exists payment_refunds_provider_uid_unique on public.payment_refunds(attempt_id,provider_refund_uid) where provider_refund_uid is not null;

create table if not exists public.commerce_outbox (
  id uuid primary key default gen_random_uuid(),
  effect_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  effect_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  state text not null default 'pending' check(state in ('pending','leased','done','quarantined')),
  available_at timestamptz not null default now(),
  lease_token uuid,
  leased_until timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 12,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(attempts >= 0 and max_attempts between 1 and 50)
);
create index if not exists commerce_outbox_claim_idx on public.commerce_outbox(state,available_at,created_at);

create table if not exists public.settlement_entries (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  environment text not null check(environment in ('sandbox','production')),
  merchant_ref text not null,
  settlement_uid text not null,
  transaction_uid text,
  attempt_id uuid references public.payment_attempts(id) on delete restrict,
  gross_agorot bigint not null,
  fee_agorot bigint not null default 0 check(fee_agorot >= 0),
  net_agorot bigint not null,
  currency text not null default 'ILS' check(currency='ILS'),
  settled_at timestamptz,
  bank_reference text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique nulls not distinct(provider,environment,merchant_ref,settlement_uid,transaction_uid),
  check(gross_agorot = fee_agorot + net_agorot)
);

-- All commerce storage is RPC-only for clients. Never expose provider payloads directly.
do $$ declare t text; begin
  foreach t in array array['commerce_intents','commerce_intent_items','stock_reservations','payment_attempts','payment_events','payment_refunds','commerce_outbox','settlement_entries'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

-- Additive immutable channel and price metadata; preserve current POS eligibility.
comment on column public.products.sales_channel is 'Public sales policy. contact_only preserves the enquiry-first storefront default.';
comment on column public.product_variants.pos_enabled is 'Internal POS eligibility, independent of public channel.';
comment on column public.product_variants.pos_price is 'Explicit internal POS price when public product price is unpublished.';

-- Generic settings cannot mutate commerce-owned/fiscal settings.
create or replace function public.set_business_setting(p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode='42501';
  end if;
  if p_key in ('animation_settings','appearance_version_1_backup') then
    raise exception 'Use dedicated appearance settings controls' using errcode='22023';
  end if;
  if p_key like 'commerce.%' or p_key like 'fiscal.%' or p_key like 'payment.%' then
    raise exception 'Protected setting key' using errcode='42501';
  end if;
  insert into public.business_settings(key,value,updated_by) values(p_key,p_value,auth.uid())
  on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_events(action,user_id,details,entity_type,entity_id)
  values('setting_changed',auth.uid(),jsonb_build_object('setting_key',p_key,'new_value',p_value),'business_setting',null);
end $$;
revoke all on function public.set_business_setting(text,jsonb) from public,anon;
grant execute on function public.set_business_setting(text,jsonb) to authenticated;

-- Prevent every legacy or future stock writer from consuming quantity held by an active commerce intent.
create or replace function public.commerce_guard_reserved_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare held bigint;
begin
  if new.stock_qty < old.stock_qty then
    select coalesce(sum(r.quantity),0) into held
    from public.stock_reservations r
    where r.variant_id=new.id and r.state='active' and r.expires_at>now();
    if new.stock_qty < held then
      raise exception 'Stock is reserved by active commerce intents' using errcode='PT409';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists commerce_guard_reserved_stock_trigger on public.product_variants;
create trigger commerce_guard_reserved_stock_trigger before update of stock_qty on public.product_variants
for each row execute function public.commerce_guard_reserved_stock();

create or replace function public.commerce_create_intent(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_role text; v_channel text; v_key text; v_hash text;
  v_existing public.commerce_intents%rowtype; v_intent uuid; v_guest text;
  v_customer jsonb; v_items jsonb; v_item jsonb; v_vid uuid; v_qty integer;
  v_discount bigint; v_variant record; v_product record; v_price bigint;
  v_rate numeric(5,2); v_net bigint; v_vat bigint; v_gross bigint;
  v_subtotal bigint:=0; v_discounts bigint:=0; v_vat_total bigint:=0; v_total bigint:=0; v_customer_id uuid;
  v_exp timestamptz:=now()+interval '15 minutes'; v_line integer:=0;
  v_item_rows jsonb:='[]'::jsonb; v_res_rows jsonb:='[]'::jsonb;
  v_public boolean; v_money_per_unit bigint;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid payload' using errcode='22023'; end if;
  v_role:=public.active_app_role();
  v_channel:=coalesce(p_payload->>'channel','');
  if v_channel not in ('pos','website') then raise exception 'Invalid channel' using errcode='22023'; end if;
  if v_channel='pos' and (coalesce(v_role,'') not in ('admin','ceo') or v_actor is null) then raise exception 'Forbidden' using errcode='42501'; end if;
  if v_channel='website' and v_actor is not null and v_role is distinct from 'customer' then raise exception 'Forbidden' using errcode='42501'; end if;
  if v_channel='website' and v_actor is null and auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  v_key:=nullif(p_payload->>'idempotency_key','');
  if v_key is null or length(v_key)<8 or length(v_key)>160 then raise exception 'Invalid idempotency key' using errcode='22023'; end if;
  v_customer:=coalesce(p_payload->'customer_snapshot','{}'::jsonb);
  v_items:=p_payload->'items';
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)=0 or jsonb_array_length(v_items)>100 then raise exception 'Invalid items' using errcode='22023'; end if;
  if (select count(distinct value->>'variant_id') from jsonb_array_elements(v_items))<>jsonb_array_length(v_items) then raise exception 'Duplicate variants must be merged before quoting' using errcode='22023'; end if;
  v_customer_id:=case when v_channel='website' then v_actor else nullif(v_customer->>'customer_id','')::uuid end;
  if v_customer_id is not null and not exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=v_customer_id and r.role='customer' and p.account_status='active') then raise exception 'Customer account is invalid' using errcode='22023'; end if;
  v_guest:=case when v_channel='website' and v_actor is null and auth.role()='service_role' then coalesce(nullif(p_payload->>'_guest_capability',''),public.commerce_random_token()) else null end;
  v_hash:=encode(public.commerce_digest(jsonb_build_object('channel',v_channel,'customer',v_customer,'items',v_items,'customer_id',v_customer_id)::text,'sha256'),'hex');
  select * into v_existing from public.commerce_intents where idempotency_actor_id is not distinct from v_actor and idempotency_key=v_key for update;
  if found then
    if v_existing.payload_hash<>v_hash then raise exception 'Idempotency payload conflict' using errcode='PT409'; end if;
    if v_guest is not null then update public.commerce_intents set guest_capability_digest=encode(public.commerce_digest(v_guest,'sha256'),'hex'),updated_at=now() where id=v_existing.id; end if;
    select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]') into v_item_rows from public.commerce_intent_items i where i.intent_id=v_existing.id;
    select coalesce(jsonb_agg(jsonb_build_object('variant_id',r.variant_id,'quantity',r.quantity,'expires_at',r.expires_at)),'[]') into v_res_rows from public.stock_reservations r where r.intent_id=v_existing.id;
    return jsonb_build_object('intent',jsonb_build_object('id',v_existing.id,'status',v_existing.status,'channel',v_existing.channel,'total_agorot',v_existing.total_agorot,'currency','ILS','expires_at',v_existing.expires_at,'revision',v_existing.revision),'items',v_item_rows,'reservations',v_res_rows,'guest_capability',v_guest,'replayed',true);
  end if;
  select rate into v_rate from public.tax_rates where is_active and valid_from<=current_date and (valid_until is null or valid_until>=current_date) order by valid_from desc limit 1;
  if v_rate is null then raise exception 'No effective tax rate configured' using errcode='22023'; end if;
  if p_payload ? 'expires_at' then v_exp:=least(greatest((p_payload->>'expires_at')::timestamptz,now()+interval '2 minutes'),now()+interval '30 minutes'); end if;
  insert into public.commerce_intents(channel,idempotency_actor_id,idempotency_key,payload_hash,actor_id,customer_id,customer_snapshot,guest_capability_digest,vat_rate,expires_at,subtotal_agorot,discount_agorot,vat_agorot,total_agorot)
  values(v_channel,v_actor,v_key,v_hash,case when v_channel='pos' then v_actor end,v_customer_id,v_customer,case when v_guest is not null then encode(public.commerce_digest(v_guest,'sha256'),'hex') end,v_rate,v_exp,0,0,0,0) returning id into v_intent;
  -- Lock all variants in stable order before checking availability.
  for v_item in select value from jsonb_array_elements(v_items) order by (value->>'variant_id')::uuid loop
    v_vid:=(v_item->>'variant_id')::uuid;
    perform 1 from public.product_variants where id=v_vid for update;
    if not found then raise exception 'Variant not found' using errcode='22023'; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_items) order by (value->>'variant_id')::uuid loop
    if jsonb_typeof(v_item)<>'object' or jsonb_typeof(v_item->'quantity')<>'number' then raise exception 'Invalid item' using errcode='22023'; end if;
    v_vid:=(v_item->>'variant_id')::uuid; v_qty:=(v_item->>'quantity')::integer; v_discount:=coalesce((v_item->>'discount_per_unit_agorot')::bigint,0);
    if v_qty<1 or v_qty>10000 or v_discount<0 then raise exception 'Invalid quantity/discount' using errcode='22023'; end if;
    select pv.*,p.status,p.sales_channel,p.tracking_mode,p.purchase_cost,p.name_he,p.name_en,p.price,p.sale_price into v_variant from public.product_variants pv join public.products p on p.id=pv.product_id where pv.id=v_vid;
    if not v_variant.is_active or v_variant.status<>'active' then raise exception 'Variant unavailable' using errcode='22023'; end if;
    if v_channel='pos' and not v_variant.pos_enabled then raise exception 'Variant not available at POS' using errcode='22023'; end if;
    if v_channel='website' and v_variant.sales_channel not in ('online_checkout','pos_and_online') then raise exception 'Website checkout unavailable' using errcode='22023'; end if;
    v_public:=v_channel='website';
    if v_public then
      v_money_per_unit:=round(coalesce(v_variant.price_override,v_variant.sale_price,(select pp.price from public.product_prices pp where pp.product_id=v_variant.product_id and pp.role='customer'),v_variant.price)*100)::bigint;
      if v_money_per_unit is null then raise exception 'Quote-only product cannot be checked out' using errcode='22023'; end if;
    else
      if coalesce(v_variant.pos_price,v_variant.price_override,v_variant.sale_price,v_variant.price) is null then raise exception 'POS price is not configured' using errcode='22023'; end if;
      v_money_per_unit:=round(coalesce(v_variant.pos_price,v_variant.price_override,v_variant.sale_price,v_variant.price)*100)::bigint;
    end if;
    if v_discount>=v_money_per_unit then raise exception 'Discount must be below unit price' using errcode='22023'; end if;
    if v_variant.tracking_mode<>'none' then
      if v_variant.stock_qty-v_qty < (select coalesce(sum(r.quantity),0) from public.stock_reservations r where r.variant_id=v_vid and r.intent_id<>v_intent and r.state='active' and r.expires_at>now()) then raise exception 'Insufficient available stock' using errcode='PT409'; end if;
    end if;
    v_line:=v_line+1;
    v_gross:=(v_money_per_unit-v_discount)*v_qty;
    v_net:=round(v_gross/(1+v_rate/100)); v_vat:=v_gross-v_net;
    v_subtotal:=v_subtotal+v_net; v_discounts:=v_discounts+v_discount*v_qty; v_vat_total:=v_vat_total+v_vat; v_total:=v_total+v_gross;
    insert into public.commerce_intent_items(intent_id,line_no,product_id,variant_id,quantity,unit_price_agorot,discount_per_unit_agorot,discount_agorot,gross_agorot,net_agorot,vat_agorot,vat_rate,unit_cost_agorot,sku_snapshot,product_name_he,product_name_en)
    values(v_intent,v_line,v_variant.product_id,v_vid,v_qty,v_money_per_unit,v_discount,v_discount*v_qty,v_gross,v_net,v_vat,v_rate,round(coalesce(v_variant.cost_override,v_variant.purchase_cost,0)*100)::bigint,v_variant.sku,v_variant.name_he,v_variant.name_en);
    if v_variant.tracking_mode<>'none' then insert into public.stock_reservations(intent_id,variant_id,quantity,expires_at) values(v_intent,v_vid,v_qty,v_exp) on conflict(intent_id,variant_id) do update set quantity=stock_reservations.quantity+excluded.quantity,expires_at=greatest(stock_reservations.expires_at,excluded.expires_at); end if;
  end loop;
  update public.commerce_intents set subtotal_agorot=v_subtotal,discount_agorot=v_discounts,vat_agorot=v_vat_total,total_agorot=v_total where id=v_intent;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no),'[]') into v_item_rows from public.commerce_intent_items i where i.intent_id=v_intent;
  select coalesce(jsonb_agg(jsonb_build_object('variant_id',r.variant_id,'quantity',r.quantity,'expires_at',r.expires_at)),'[]') into v_res_rows from public.stock_reservations r where r.intent_id=v_intent;
  return jsonb_build_object('intent',jsonb_build_object('id',v_intent,'status','reserved','channel',v_channel,'total_agorot',v_total,'currency','ILS','expires_at',v_exp,'revision',1),'items',v_item_rows,'reservations',v_res_rows,'guest_capability',v_guest,'replayed',false);
end $$;
revoke all on function public.commerce_create_intent(jsonb) from public,anon,service_role;
grant execute on function public.commerce_create_intent(jsonb) to authenticated;

create or replace function public.commerce_create_guest_intent(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p jsonb; r jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  if p_payload->>'channel' is distinct from 'website' then raise exception 'Website guest intent required' using errcode='22023'; end if;
  if p_payload ? 'customer_id' then raise exception 'Guest intent cannot bind an account' using errcode='22023'; end if;
  p:=p_payload||jsonb_build_object('customer_snapshot',coalesce(p_payload->'customer_snapshot','{}'::jsonb),'_guest_capability',public.commerce_random_token());
  r:=public.commerce_create_intent(p);
  return r;
end $$;
revoke all on function public.commerce_create_guest_intent(jsonb) from public,anon,authenticated;
grant execute on function public.commerce_create_guest_intent(jsonb) to service_role;

create or replace function public.commerce_start_attempt(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a uuid; v_intent public.commerce_intents%rowtype; v_actor uuid:=auth.uid(); v_role text; v_kind text; v_method text; v_provider text; v_env text; v_key text; v_hash text; v_state text; v_amt bigint; v_existing public.payment_attempts%rowtype; v_cash_session uuid;
begin
  v_role:=public.active_app_role(); v_kind:=p_payload->>'collection_kind'; v_method:=p_payload->>'method'; v_provider:=nullif(p_payload->>'provider',''); v_env:=nullif(p_payload->>'environment',''); v_key:=p_payload->>'idempotency_key';
  if auth.role()='service_role' and v_actor is null and nullif(p_payload->>'actor_id','') is not null then
    v_actor:=(p_payload->>'actor_id')::uuid;
    select r.role into v_role from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=v_actor and p.account_status='active';
  end if;
  if v_key is null or length(v_key)<8 then raise exception 'Invalid idempotency key' using errcode='22023'; end if;
  select * into v_intent from public.commerce_intents where id=(p_payload->>'intent_id')::uuid for update;
  if not found or v_intent.status not in ('reserved','awaiting_payment','partially_paid') or v_intent.expires_at<=now() then raise exception 'Intent unavailable' using errcode='PT409'; end if;
  if v_intent.channel='pos' and v_actor is null then
    if auth.role() is distinct from 'service_role' or encode(public.commerce_digest(coalesce(p_payload->>'_guest_capability',''),'sha256'),'hex') is distinct from v_intent.guest_capability_digest then raise exception 'Guest capability invalid' using errcode='42501'; end if;
  elsif v_intent.channel='pos' and coalesce(v_role,'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
  if v_intent.channel='website' and v_intent.customer_id is not null and v_intent.customer_id is distinct from v_actor then raise exception 'Forbidden' using errcode='42501'; end if;
  if v_intent.channel='website' and v_intent.customer_id is null and auth.role()<>'service_role' then raise exception 'Guest capability required' using errcode='42501'; end if;
  if v_kind not in ('manual_recorded','provider_collected') then raise exception 'Invalid collection kind' using errcode='22023'; end if;
  if v_kind='provider_collected' and auth.role() is distinct from 'service_role' then raise exception 'Provider attempts are server-only' using errcode='42501'; end if;
  if v_kind='manual_recorded' and (v_intent.channel<>'pos' or coalesce(v_role,'') not in ('admin','ceo')) then raise exception 'Manual tender is POS-only' using errcode='42501'; end if;
  if v_kind='provider_collected' and (v_provider is null or v_env not in ('sandbox','production') or nullif(p_payload->>'merchant_ref','') is null) then raise exception 'Provider binding required' using errcode='22023'; end if;
  if v_kind='manual_recorded' and v_method not in ('cash','credit_card','bank_transfer','bit','check','other') then raise exception 'Invalid tender' using errcode='22023'; end if;
  if v_method not in ('cash','credit_card','bank_transfer','bit','check','other') then raise exception 'Invalid method' using errcode='22023'; end if;
  v_amt:=coalesce((p_payload->>'amount_agorot')::bigint,v_intent.total_agorot);
  if v_amt<1 or v_amt>v_intent.total_agorot then raise exception 'Invalid amount' using errcode='22023'; end if;
  v_hash:=encode(public.commerce_digest(jsonb_build_object('intent_id',v_intent.id,'method',v_method,'kind',v_kind,'provider',v_provider,'environment',v_env,'amount',v_amt,'installments',coalesce((p_payload->>'installments')::integer,1))::text,'sha256'),'hex');
  select * into v_existing from public.payment_attempts where intent_id=v_intent.id and idempotency_actor_id is not distinct from v_actor and idempotency_key=v_key for update;
  if found then if v_existing.payload_hash<>v_hash then raise exception 'Idempotency payload conflict' using errcode='PT409'; end if; return jsonb_build_object('attempt',jsonb_build_object('id',v_existing.id,'state',v_existing.state,'amount_agorot',v_existing.amount_agorot,'provider',v_existing.provider,'environment',v_existing.environment,'method',v_existing.method,'request_uid',v_existing.request_uid,'hosted_url',v_existing.safe_metadata->>'hosted_url'),'replayed',true); end if;
  if v_amt+coalesce((select sum(amount_agorot) from public.payment_attempts where intent_id=v_intent.id and state not in ('declined','voided','refunded')),0)>v_intent.total_agorot then raise exception 'Tender allocations exceed intent total' using errcode='PT409'; end if;
  if v_kind='manual_recorded' and v_method='cash' then select id into v_cash_session from public.cash_sessions where actor_id=v_actor and state='open' for update; if v_cash_session is null then raise exception 'Open cash shift required' using errcode='PT409'; end if; end if;
  insert into public.payment_attempts(intent_id,method,collection_kind,provider,environment,merchant_ref,idempotency_actor_id,idempotency_key,payload_hash,amount_agorot,installments,state,provider_effect_key)
  values(v_intent.id,v_method,v_kind,v_provider,v_env,nullif(p_payload->>'merchant_ref',''),v_actor,v_key,v_hash,v_amt,coalesce((p_payload->>'installments')::integer,1),case when v_kind='manual_recorded' then 'captured' else 'pending' end,gen_random_uuid()::text) returning id,state into a,v_state;
  if v_kind='manual_recorded' and v_method='cash' then insert into public.cash_movements(session_id,kind,signed_amount_agorot,reason,effect_key,actor_id) values(v_cash_session,'sale_cash',v_amt,'POS cash tender','sale-cash:'||a,v_actor); end if;
  update public.commerce_intents set status='awaiting_payment',updated_at=now() where id=v_intent.id;
  if v_kind='manual_recorded' then perform public.commerce_finalize_intent(v_intent.id); end if;
  return jsonb_build_object('attempt',jsonb_build_object('id',a,'state',v_state,'amount_agorot',v_amt,'provider',v_provider,'environment',v_env,'method',v_method),'replayed',false);
end $$;
revoke all on function public.commerce_start_attempt(jsonb) from public,anon,service_role;
grant execute on function public.commerce_start_attempt(jsonb) to authenticated;

create or replace function public.commerce_finalize_intent(p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_intent public.commerce_intents%rowtype; v_order uuid; v_number text; v_item record; v_due bigint; v_paid bigint; v_attempt record; v_order_status text;
begin
  select * into v_intent from public.commerce_intents where id=p_intent_id for update;
  if not found then raise exception 'Intent not found' using errcode='22023'; end if;
  if v_intent.finalized_order_id is not null then return jsonb_build_object('order_id',v_intent.finalized_order_id,'status','paid','replayed',true); end if;
  select coalesce(sum(amount_agorot),0) into v_paid from public.payment_attempts where intent_id=p_intent_id and state='captured';
  if v_paid<v_intent.total_agorot then
    update public.commerce_intents set status=case when v_paid>0 then 'partially_paid' else 'awaiting_payment' end,updated_at=now() where id=p_intent_id;
    return jsonb_build_object('intent_id',p_intent_id,'status',case when v_paid>0 then 'partially_paid' else 'awaiting_payment' end,'paid_agorot',v_paid,'due_agorot',v_intent.total_agorot-v_paid,'replayed',false);
  end if;
  v_number:='MIRO-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,5,'0');
  insert into public.orders(order_number,status,currency,customer_name,customer_email,customer_phone,user_id,recorded_by,source,subtotal,vat_total,total,net_total,shipping_cost,notes,created_at,updated_at,commerce_intent_id,idempotency_key)
  values(v_number,'paid','ILS',nullif(v_intent.customer_snapshot->>'name',''),nullif(v_intent.customer_snapshot->>'email',''),nullif(v_intent.customer_snapshot->>'phone',''),v_intent.customer_id,v_intent.actor_id,case when v_intent.channel='pos' then 'pos' else 'website' end,v_intent.subtotal_agorot/100.0,v_intent.vat_agorot/100.0,v_intent.total_agorot/100.0,v_intent.subtotal_agorot/100.0,0,null,now(),now(),v_intent.id,'commerce:'||v_intent.id) returning id into v_order;
  for v_item in select * from public.commerce_intent_items where intent_id=p_intent_id order by line_no loop
    insert into public.order_items(order_id,product_id,variant_id,quantity,unit_price,total_price,sku_snapshot,product_name_he,product_name_en,unit_cost,vat_rate,vat_amount,discount_amount,net_amount)
    values(v_order,v_item.product_id,v_item.variant_id,v_item.quantity,v_item.unit_price_agorot/100.0,v_item.gross_agorot/100.0,v_item.sku_snapshot,v_item.product_name_he,v_item.product_name_en,v_item.unit_cost_agorot/100.0,v_item.vat_rate,v_item.vat_agorot/100.0,v_item.discount_agorot/100.0,v_item.net_agorot/100.0);
    update public.stock_reservations set state='consumed',consumed_order_id=v_order,updated_at=now() where intent_id=p_intent_id and variant_id=v_item.variant_id and state='active';
    if exists(select 1 from public.product_variants pv join public.products p on p.id=pv.product_id where pv.id=v_item.variant_id and p.tracking_mode<>'none') then
      perform public.record_stock_movement(v_item.variant_id,-v_item.quantity,'sale',v_number,'Commerce intent finalized',v_item.unit_cost_agorot/100.0);
    end if;
  end loop;
  for v_attempt in select * from public.payment_attempts where intent_id=p_intent_id and state='captured' order by created_at loop
    insert into public.order_payments(order_id,payment_method,amount,currency,installments,payment_status,external_reference,recorded_by,paid_at,commerce_attempt_id,collection_kind,provider,provider_transaction_uid)
    values(v_order,v_attempt.method,v_attempt.amount_agorot/100.0,'ILS',v_attempt.installments,'paid',v_attempt.transaction_uid,v_intent.actor_id,coalesce(v_attempt.updated_at,now()),v_attempt.id,v_attempt.collection_kind,v_attempt.provider,v_attempt.transaction_uid);
  end loop;
  update public.commerce_intents set status='paid',finalized_order_id=v_order,updated_at=now() where id=p_intent_id;
  insert into public.audit_events(action,user_id,details,entity_type,entity_id) values('commerce_intent_finalized',v_intent.actor_id,jsonb_build_object('intent_id',p_intent_id,'order_id',v_order,'total_agorot',v_intent.total_agorot,'channel',v_intent.channel),'sale_order',v_order);
  insert into public.commerce_outbox(effect_type,aggregate_type,aggregate_id,effect_key,payload) values('document.create','order',v_order,'document:create:'||v_order,jsonb_build_object('order_id',v_order)) on conflict(effect_key) do nothing;
  return jsonb_build_object('order_id',v_order,'order_number',v_number,'status','paid','replayed',false);
end $$;
revoke all on function public.commerce_finalize_intent(uuid) from public,anon,authenticated;
grant execute on function public.commerce_finalize_intent(uuid) to service_role;

create or replace function public.commerce_provider_result(p_attempt_id uuid,p_event_key text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts%rowtype; i public.commerce_intents%rowtype; ev uuid; v_state text; v_hash text; v_order uuid;
begin
  if auth.role() is distinct from 'service_role' or coalesce((p_result->>'verified')::boolean,false) is not true then raise exception 'Verified service result required' using errcode='42501'; end if;
  if p_result->>'verification_source' is distinct from 'server_query' then raise exception 'Authoritative server status query required' using errcode='42501'; end if;
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if not found or a.collection_kind<>'provider_collected' then raise exception 'Attempt unavailable' using errcode='22023'; end if;
  if p_result->>'provider' is distinct from a.provider or p_result->>'environment' is distinct from a.environment or p_result->>'merchant_ref' is distinct from a.merchant_ref or p_result->>'currency' is distinct from a.currency or (p_result->>'amount_agorot')::bigint is distinct from a.amount_agorot then raise exception 'Provider binding mismatch' using errcode='PT409'; end if;
  if p_result->>'state'='captured' and nullif(p_result->>'transaction_uid','') is null then raise exception 'Captured payment requires provider transaction UID' using errcode='22023'; end if;
  if nullif(p_result->>'transaction_uid','') is not null and a.transaction_uid is not null and p_result->>'transaction_uid'<>a.transaction_uid then raise exception 'Provider transaction UID is immutable' using errcode='PT409'; end if;
  v_hash:=encode(public.commerce_digest(p_result::text,'sha256'),'hex');
  insert into public.payment_events(provider,environment,merchant_ref,event_key,attempt_id,verified_at,payload_hash,safe_metadata,processing_state,result_state)
  values(a.provider,a.environment,a.merchant_ref,p_event_key,a.id,now(),v_hash,coalesce(p_result->'safe_metadata','{}'::jsonb),'received',p_result->>'state') on conflict(provider,environment,merchant_ref,event_key) do nothing returning id into ev;
  if ev is null then
    if (select payload_hash from public.payment_events where provider=a.provider and environment=a.environment and merchant_ref=a.merchant_ref and event_key=p_event_key) is distinct from v_hash then raise exception 'Provider event key payload conflict' using errcode='PT409'; end if;
    return jsonb_build_object('attempt_id',a.id,'state',a.state,'order_id',(select finalized_order_id from public.commerce_intents where id=a.intent_id),'replayed',true);
  end if;
  v_state:=p_result->>'state';
  if v_state not in ('pending','authorized','captured','declined','voided','unknown') then raise exception 'Invalid provider state' using errcode='22023'; end if;
  if a.state='authorized' and v_state not in ('authorized','captured','voided','unknown') then raise exception 'Non-monotonic provider result' using errcode='PT409'; end if;
  if v_state='captured' and p_result->>'transaction_kind' is distinct from 'charge' then raise exception 'Only a verified charge can finalize an order' using errcode='PT409'; end if;
  if a.state in ('captured','refunded','partially_refunded') and v_state<>'captured' then raise exception 'Non-monotonic provider result' using errcode='PT409'; end if;
  if a.state in ('declined','voided') and v_state not in (a.state) then raise exception 'Non-monotonic provider result' using errcode='PT409'; end if;
  update public.payment_attempts set state=case when a.state in ('refunded','partially_refunded') and v_state='captured' then a.state else v_state end,verified_collection_state=v_state,transaction_uid=coalesce(nullif(p_result->>'transaction_uid',''),transaction_uid),safe_metadata=coalesce(p_result->'safe_metadata','{}'::jsonb),updated_at=now() where id=a.id;
  update public.payment_events set processing_state='applied' where id=ev;
  if v_state='captured' then
    begin
      v_order:= (public.commerce_finalize_intent(a.intent_id)->>'order_id')::uuid;
    exception when sqlstate 'PT409' or sqlstate '22023' then
      update public.payment_attempts set state='exception',safe_metadata=jsonb_set(coalesce(safe_metadata,'{}'::jsonb),'{fulfillment_exception}',to_jsonb('captured_without_order'),true),updated_at=now() where id=a.id;
      update public.commerce_intents set status='exception',updated_at=now() where id=a.intent_id;
      update public.payment_events set processing_state='exception' where id=ev;
      insert into public.commerce_outbox(effect_type,aggregate_type,aggregate_id,effect_key,payload) values('payment.capture_exception','payment_attempt',a.id,'capture-exception:'||a.id,jsonb_build_object('attempt_id',a.id,'intent_id',a.intent_id,'transaction_uid',p_result->>'transaction_uid')) on conflict(effect_key) do nothing;
    end;
  end if;
  return jsonb_build_object('attempt_id',a.id,'state',v_state,'order_id',v_order,'replayed',false);
end $$;
revoke all on function public.commerce_provider_result(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_provider_result(uuid,text,jsonb) to service_role;

create or replace function public.commerce_guest_status(p_intent_id uuid,p_capability text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.commerce_intents%rowtype;
begin
  select * into i from public.commerce_intents where id=p_intent_id;
  if not found or i.expires_at<=now() or i.guest_capability_digest is null or encode(public.commerce_digest(coalesce(p_capability,''),'sha256'),'hex')<>i.guest_capability_digest then raise exception 'Not found' using errcode='42501'; end if;
  return jsonb_build_object('intent_id',i.id,'state',i.status,'order_id',i.finalized_order_id,'total_agorot',i.total_agorot,'currency',i.currency,'updated_at',i.updated_at);
end $$;
revoke all on function public.commerce_guest_status(uuid,text) from public;
grant execute on function public.commerce_guest_status(uuid,text) to anon,authenticated;

-- Records only manually confirmed tender or provider attempts, never implies provider verification.
create or replace function public.commerce_read(p_section text,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text:=public.active_app_role(); v_rows jsonb:='[]'::jsonb; v_count bigint:=0; v_page integer:=greatest(0,coalesce((p_filters->>'offset')::integer,0)); v_lim integer:=least(200,greatest(1,coalesce((p_filters->>'limit')::integer,50))); v_summary jsonb:='{}'::jsonb;
begin
  if coalesce(v_role,'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_section='intents' then select coalesce(jsonb_agg(to_jsonb(x)),'[]'),count(*) into v_rows,v_count from (select id,channel,status,revision,customer_snapshot,total_agorot,currency,expires_at,finalized_order_id,created_at from public.commerce_intents order by created_at desc offset v_page limit v_lim) x;
  elsif p_section='payments' then select coalesce(jsonb_agg(to_jsonb(x)),'[]'),count(*) into v_rows,v_count from (select id,intent_id,method,collection_kind,provider,environment,request_uid,transaction_uid,amount_agorot,currency,state,created_at,updated_at from public.payment_attempts order by created_at desc offset v_page limit v_lim) x;
  elsif p_section='integrations' then v_rows:=jsonb_build_array(jsonb_build_object('provider','payplus','status','not_configured','mode','sandbox','capabilities',jsonb_build_object('card',false,'bit',false,'recurring',false,'refunds',false),'official_issuance_enabled',false));v_count:=1;
  elsif p_section='settings' then select jsonb_build_object('revision',coalesce((select (value->>'revision')::int from public.business_settings where key='commerce.identity'),0),'identity',coalesce((select value->'identity' from public.business_settings where key='commerce.identity'),'{}'::jsonb),'readiness',jsonb_build_object('official_issuance_enabled',false,'blockers',jsonb_build_array('business_identity_unapproved','provider_readiness_unverified','signing_or_allocation_not_configured'))) into v_summary; v_rows:=jsonb_build_array(v_summary);v_count:=1;
  else raise exception 'Unsupported commerce section' using errcode='22023'; end if;
  return jsonb_build_object('section',p_section,'rows',v_rows,'total_count',v_count,'summary',v_summary,'revision',coalesce((v_summary->>'revision')::int,0),'readiness',case when p_section in ('settings','integrations') then v_summary->'readiness' else null end);
end $$;
revoke all on function public.commerce_read(text,jsonb) from public,anon;
grant execute on function public.commerce_read(text,jsonb) to authenticated;

create or replace function public.commerce_bind_attempt(p_attempt_id uuid,p_request_uid text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  if nullif(btrim(p_request_uid),'') is null or length(p_request_uid)>255 or jsonb_typeof(p_metadata)<>'object' then raise exception 'Invalid provider binding' using errcode='22023'; end if;
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if not found or a.collection_kind<>'provider_collected' then raise exception 'Attempt unavailable' using errcode='22023'; end if;
  if a.request_uid is not null and a.request_uid<>p_request_uid then raise exception 'Attempt request UID conflict' using errcode='PT409'; end if;
  update public.payment_attempts set request_uid=p_request_uid,safe_metadata=coalesce(safe_metadata,'{}'::jsonb)||p_metadata,state=case when state in ('created','pending') then 'pending' else state end,updated_at=now() where id=a.id returning * into a;
  return jsonb_build_object('attempt_id',a.id,'state',a.state,'request_uid',a.request_uid);
end $$;
revoke all on function public.commerce_bind_attempt(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_bind_attempt(uuid,text,jsonb) to service_role;

create or replace function public.commerce_mark_attempt_unknown(p_attempt_id uuid,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Attempt not found' using errcode='22023'; end if;
  if a.state not in ('created','pending','unknown') then raise exception 'Attempt is already definitive' using errcode='PT409'; end if;
  update public.payment_attempts set state='unknown',safe_metadata=jsonb_set(coalesce(safe_metadata,'{}'::jsonb),'{last_error_code}',to_jsonb(left(coalesce(p_error_code,'timeout'),80)),true),updated_at=now() where id=a.id;
  update public.commerce_intents set status='exception',updated_at=now() where id=a.intent_id and status in ('reserved','awaiting_payment');
  return jsonb_build_object('attempt_id',a.id,'state','unknown','intent_id',a.intent_id,'reconcile_required',true);
end $$;
revoke all on function public.commerce_mark_attempt_unknown(uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_mark_attempt_unknown(uuid,text) to service_role;

create or replace function public.commerce_cancel_intent(p_intent_id uuid,p_capability text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.commerce_intents%rowtype; v_role text:=public.active_app_role();
begin
  select * into i from public.commerce_intents where id=p_intent_id for update;
  if not found then raise exception 'Intent not found' using errcode='22023'; end if;
  if auth.uid() is not null and v_role is null then raise exception 'Active actor required' using errcode='42501'; end if;
  if i.channel='pos' and (coalesce(v_role,'') not in ('admin','ceo') or i.actor_id is distinct from auth.uid()) then raise exception 'Forbidden' using errcode='42501'; end if;
  if i.channel='website' and i.customer_id is not null and i.customer_id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
  if i.channel='website' and i.customer_id is null and (i.expires_at<=now() or i.guest_capability_digest is null or encode(public.commerce_digest(coalesce(p_capability,''),'sha256'),'hex')<>i.guest_capability_digest) then raise exception 'Not found' using errcode='42501'; end if;
  if i.finalized_order_id is not null or i.status='paid' then raise exception 'Paid intent cannot be cancelled' using errcode='PT409'; end if;
  if exists(select 1 from public.payment_attempts where intent_id=i.id and state in ('captured','unknown','pending','authorized')) then raise exception 'Payment reconciliation required before release' using errcode='PT409'; end if;
  update public.stock_reservations set state='released',updated_at=now() where intent_id=i.id and state='active';
  update public.commerce_intents set status='cancelled',revision=revision+1,updated_at=now() where id=i.id;
  return jsonb_build_object('intent_id',i.id,'status','cancelled','revision',i.revision+1);
end $$;
revoke all on function public.commerce_cancel_intent(uuid,text) from public;
grant execute on function public.commerce_cancel_intent(uuid,text) to anon,authenticated;

create or replace function public.commerce_claim_outbox(p_worker_id text,p_limit integer default 20,p_lease_seconds integer default 60)
returns setof public.commerce_outbox language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  if length(coalesce(p_worker_id,'')) not between 1 and 120 then raise exception 'Invalid worker' using errcode='22023'; end if;
  return query with picked as (select id from public.commerce_outbox where (state='pending' and available_at<=now()) or (state='leased' and leased_until<now()) order by available_at,created_at for update skip locked limit least(100,greatest(1,coalesce(p_limit,20))))
    update public.commerce_outbox o set state='leased',lease_token=gen_random_uuid(),leased_until=now()+make_interval(secs=>least(900,greatest(10,coalesce(p_lease_seconds,60)))),attempts=o.attempts+1,updated_at=now() from picked where o.id=picked.id returning o.*;
end $$;
revoke all on function public.commerce_claim_outbox(text,integer,integer) from public,anon,authenticated;
grant execute on function public.commerce_claim_outbox(text,integer,integer) to service_role;

create or replace function public.commerce_finish_outbox(p_outbox_id uuid,p_lease_token uuid,p_success boolean,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.commerce_outbox%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select * into o from public.commerce_outbox where id=p_outbox_id for update;
  if not found or o.state<>'leased' or o.lease_token is distinct from p_lease_token or o.leased_until<now() then raise exception 'Outbox lease lost' using errcode='PT409'; end if;
  if p_success then update public.commerce_outbox set state='done',completed_at=now(),lease_token=null,leased_until=null,updated_at=now() where id=o.id;
  elsif o.attempts>=o.max_attempts then update public.commerce_outbox set state='quarantined',last_error_code=left(p_error_code,80),lease_token=null,leased_until=null,updated_at=now() where id=o.id;
  else update public.commerce_outbox set state='pending',available_at=now()+make_interval(secs=>least(3600,5*(2^least(attempts,9))::integer)),last_error_code=left(p_error_code,80),lease_token=null,leased_until=null,updated_at=now() where id=o.id; end if;
  return jsonb_build_object('id',o.id,'state',(select state from public.commerce_outbox where id=o.id));
end $$;
revoke all on function public.commerce_finish_outbox(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.commerce_finish_outbox(uuid,uuid,boolean,text) to service_role;

-- A valid webhook signature is an enqueue signal only; settlement truth comes from a later provider query.
create or replace function public.commerce_queue_notification(p_attempt_id uuid,p_event_key text,p_reference jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts%rowtype; v_event uuid; v_outbox uuid; v_provider_event text; v_safe jsonb; v_hash text; v_key text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  if length(coalesce(p_event_key,'')) not between 1 and 255 or coalesce((p_reference->>'signature_verified')::boolean,false) is not true then raise exception 'Verified notification required' using errcode='42501'; end if;
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if not found or a.collection_kind<>'provider_collected' then raise exception 'Attempt not found' using errcode='22023'; end if;
  if p_reference->>'provider' is distinct from a.provider or p_reference->>'environment' is distinct from a.environment or (nullif(p_reference->>'merchant_ref','') is not null and p_reference->>'merchant_ref' is distinct from a.merchant_ref) then raise exception 'Notification binding mismatch' using errcode='PT409'; end if;
  v_provider_event:='notify:'||p_event_key;
  v_safe:=jsonb_build_object('event_type',left(coalesce(p_reference->>'event_type','payment.notification'),80),'received_at',now(),'verification_source','signature');
  v_hash:=encode(public.commerce_digest(coalesce(p_reference->>'raw_body_hash',p_event_key),'sha256'),'hex');
  insert into public.payment_events(provider,environment,merchant_ref,event_key,attempt_id,verified_at,payload_hash,safe_metadata,processing_state,result_state)
  values(a.provider,a.environment,a.merchant_ref,v_provider_event,a.id,now(),v_hash,v_safe,'received','query_queued')
  on conflict(provider,environment,merchant_ref,event_key) do nothing returning id into v_event;
  if v_event is null then select id into v_event from public.payment_events where provider=a.provider and environment=a.environment and merchant_ref=a.merchant_ref and event_key=v_provider_event; end if;
  v_key:='payment-query:'||a.id||':'||v_provider_event;
  insert into public.commerce_outbox(effect_type,aggregate_type,aggregate_id,effect_key,payload)
  values('payment.query','payment_attempt',a.id,v_key,jsonb_build_object('attempt_id',a.id,'event_key',v_provider_event))
  on conflict(effect_key) do nothing returning id into v_outbox;
  if v_outbox is null then select id into v_outbox from public.commerce_outbox where effect_key=v_key; end if;
  return jsonb_build_object('event_id',v_event,'outbox_id',v_outbox,'attempt_id',a.id,'state',a.state,'replayed',(select created_at<now()-interval '1 second' from public.payment_events where id=v_event));
end $$;
revoke all on function public.commerce_queue_notification(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_queue_notification(uuid,text,jsonb) to service_role;

-- Service-only entry for provider attempts. The application validates the actor and supplies only server-resolved provider binding fields.
create or replace function public.commerce_start_provider_attempt(p_payload jsonb,p_actor_id uuid default null,p_capability text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.commerce_intents%rowtype; v_role text; p jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select * into i from public.commerce_intents where id=(p_payload->>'intent_id')::uuid;
  if not found or i.expires_at<=now() then raise exception 'Intent unavailable' using errcode='PT409'; end if;
  if i.channel='pos' then
    if p_actor_id is null then
      if i.guest_capability_digest is null or encode(public.commerce_digest(coalesce(p_capability,''),'sha256'),'hex') is distinct from i.guest_capability_digest or not exists(select 1 from public.commerce_payment_links l where l.intent_id=i.id and l.capability_digest=i.guest_capability_digest and l.claimed_at is not null and l.expires_at>now()) then raise exception 'Remote payment capability invalid' using errcode='42501'; end if;
    else
      select r.role into v_role from public.user_roles r join public.profiles pr on pr.id=r.user_id where r.user_id=p_actor_id and pr.account_status='active';
      if coalesce(v_role,'') not in ('admin','ceo') or i.actor_id is distinct from p_actor_id then raise exception 'POS actor forbidden' using errcode='42501'; end if;
    end if;
  elsif i.customer_id is not null then
    if p_actor_id is null or p_actor_id<>i.customer_id then raise exception 'Customer binding mismatch' using errcode='42501'; end if;
  else
    if i.guest_capability_digest is null or encode(public.commerce_digest(coalesce(p_capability,''),'sha256'),'hex')<>i.guest_capability_digest then raise exception 'Guest capability invalid' using errcode='42501'; end if;
  end if;
  p:=p_payload||jsonb_build_object('collection_kind','provider_collected','actor_id',p_actor_id,'_guest_capability',p_capability);
  return public.commerce_start_attempt(p);
end $$;
revoke all on function public.commerce_start_provider_attempt(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_start_provider_attempt(jsonb,uuid,text) to service_role;

create or replace function public.commerce_start_guest_attempt(p_payload jsonb,p_capability text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  return public.commerce_start_provider_attempt(p_payload,null,p_capability);
end $$;
revoke all on function public.commerce_start_guest_attempt(jsonb,text) from public,anon,authenticated;
grant execute on function public.commerce_start_guest_attempt(jsonb,text) to service_role;

create or replace function public.commerce_cancel_guest_intent(p_intent_id uuid,p_capability text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  return public.commerce_cancel_intent(p_intent_id,p_capability);
end $$;
revoke all on function public.commerce_cancel_guest_intent(uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_cancel_guest_intent(uuid,text) to service_role;

create or replace function public.commerce_queue_reconciliation(p_attempt_id uuid,p_effect_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts%rowtype; e uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if not found or a.collection_kind<>'provider_collected' or a.state not in ('unknown','pending','created','exception') then raise exception 'Reconciliation not applicable' using errcode='PT409'; end if;
  if length(coalesce(p_effect_key,'')) not between 8 and 255 then raise exception 'Invalid effect key' using errcode='22023'; end if;
  insert into public.commerce_outbox(effect_type,aggregate_type,aggregate_id,effect_key,payload) values('payment.query','payment_attempt',a.id,'payment-reconcile:'||p_effect_key,jsonb_build_object('attempt_id',a.id,'request_uid',a.request_uid,'provider',a.provider,'environment',a.environment,'merchant_ref',a.merchant_ref)) on conflict(effect_key) do nothing returning id into e;
  if e is null then select id into e from public.commerce_outbox where effect_key='payment-reconcile:'||p_effect_key; end if;
  return jsonb_build_object('attempt_id',a.id,'outbox_id',e,'state',a.state,'replayed',(select state<>'pending' from public.commerce_outbox where id=e));
end $$;
revoke all on function public.commerce_queue_reconciliation(uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_queue_reconciliation(uuid,text) to service_role;

create or replace function public.commerce_expire_intents(p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  update public.stock_reservations r set state='expired',updated_at=now()
  where r.state='active' and r.expires_at<=now() and exists(select 1 from public.commerce_intents i where i.id=r.intent_id and i.status in ('reserved','cancelled','expired'));
  with expiring as (
    select i.id from public.commerce_intents i where i.status in ('reserved','awaiting_payment','partially_paid') and i.expires_at<=now()
      and not exists(select 1 from public.payment_attempts a where a.intent_id=i.id and a.state in ('created','pending','authorized','unknown','exception'))
    order by i.expires_at for update skip locked limit least(2000,greatest(1,coalesce(p_limit,500)))
  )
  update public.commerce_intents i set status='expired',revision=revision+1,updated_at=now() from expiring e where i.id=e.id;
  get diagnostics v_count=row_count;
  update public.stock_reservations r set state='expired',updated_at=now() where r.intent_id in (select id from public.commerce_intents where status='expired') and r.state='active';
  return jsonb_build_object('expired_intents',v_count,'processed_at',now());
end $$;
revoke all on function public.commerce_expire_intents(integer) from public,anon,authenticated;
grant execute on function public.commerce_expire_intents(integer) to service_role;

create or replace function public.commerce_request_refund(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts%rowtype; v_actor uuid:=auth.uid(); v_role text:=public.active_app_role(); v_amount bigint; v_key text; v_hash text; r public.payment_refunds%rowtype; v_captured bigint; v_reserved bigint;
begin
  if v_role is distinct from 'ceo' then raise exception 'CEO refund permission required' using errcode='42501'; end if;
  select * into a from public.payment_attempts where id=(p_payload->>'attempt_id')::uuid for update;
  if not found then raise exception 'Payment attempt not found' using errcode='22023'; end if;
  v_amount:=(p_payload->>'amount_agorot')::bigint;v_key:=p_payload->>'idempotency_key';
  if v_amount<=0 or length(coalesce(v_key,''))<8 then raise exception 'Invalid refund' using errcode='22023'; end if;
  v_hash:=encode(public.commerce_digest(jsonb_build_object('attempt_id',a.id,'amount_agorot',v_amount,'reason',p_payload->>'reason')::text,'sha256'),'hex');
  select * into r from public.payment_refunds where idempotency_actor_id=v_actor and idempotency_key=v_key for update;
  if found then if r.payload_hash<>v_hash then raise exception 'Refund idempotency conflict' using errcode='PT409'; end if; return jsonb_build_object('refund_id',r.id,'state',r.state,'amount_agorot',r.amount_agorot,'replayed',true); end if;
  if a.collection_kind<>'provider_collected' or a.state not in ('captured','partially_refunded') then raise exception 'Captured provider payment required' using errcode='PT409'; end if;
  v_captured:=a.amount_agorot;select coalesce(sum(amount_agorot),0) into v_reserved from public.payment_refunds where attempt_id=a.id and state in ('requested','pending','succeeded','unknown');
  if v_reserved+v_amount>v_captured then raise exception 'Refund exceeds remaining captured balance' using errcode='PT409'; end if;
  insert into public.payment_refunds(attempt_id,amount_agorot,reason,idempotency_actor_id,idempotency_key,payload_hash,effect_key,requested_by) values(a.id,v_amount,left(coalesce(p_payload->>'reason',''),1000),v_actor,v_key,v_hash,'refund:'||a.id||':'||v_key,v_actor) returning * into r;
  insert into public.commerce_outbox(effect_type,aggregate_type,aggregate_id,effect_key,payload,state,last_error_code) values('payment.refund.reconcile','payment_refund',r.id,r.effect_key,jsonb_build_object('refund_id',r.id,'attempt_id',a.id,'amount_agorot',v_amount,'provider',a.provider,'environment',a.environment,'merchant_ref',a.merchant_ref,'transaction_uid',a.transaction_uid),'quarantined','operator_api_submission_required');
  insert into public.audit_events(action,user_id,details,entity_type,entity_id) values('payment_refund_requested',v_actor,jsonb_build_object('attempt_id',a.id,'refund_id',r.id,'amount_agorot',v_amount),'payment_refund',r.id);
  return jsonb_build_object('refund_id',r.id,'state',r.state,'amount_agorot',r.amount_agorot,'replayed',false);
end $$;
revoke all on function public.commerce_request_refund(jsonb) from public,anon;
grant execute on function public.commerce_request_refund(jsonb) to authenticated;

create or replace function public.commerce_refund_result(p_refund_id uuid,p_event_key text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.payment_refunds%rowtype; a public.payment_attempts%rowtype; v_state text; v_hash text; v_event uuid; v_succeeded bigint;
begin
  if auth.role() is distinct from 'service_role' or (p_result->>'verified')::boolean is not true or p_result->>'verification_source' not in ('server_query','server_response') then raise exception 'Verified server result required' using errcode='42501'; end if;
  select * into r from public.payment_refunds where id=p_refund_id for update; if not found then raise exception 'Refund not found' using errcode='22023'; end if;
  select * into a from public.payment_attempts where id=r.attempt_id for update;
  if p_result->>'provider' is distinct from a.provider or p_result->>'environment' is distinct from a.environment or p_result->>'merchant_ref' is distinct from a.merchant_ref or (p_result->>'amount_agorot')::bigint is distinct from r.amount_agorot then raise exception 'Refund binding mismatch' using errcode='PT409'; end if;
  v_state:=p_result->>'state'; if v_state not in ('pending','succeeded','failed','unknown') then raise exception 'Invalid refund result' using errcode='22023'; end if;
  if p_result->>'verification_source'='server_response' and (v_state<>'succeeded' or length(coalesce(p_result->>'refund_uid',''))=0) then raise exception 'Server response may confirm only a uniquely identified success' using errcode='PT409'; end if;
  if v_state='succeeded' and length(coalesce(p_result->>'refund_uid',''))=0 then raise exception 'Provider refund UID required' using errcode='PT409'; end if;
  v_hash:=encode(public.commerce_digest(p_result::text,'sha256'),'hex');
  insert into public.payment_events(provider,environment,merchant_ref,event_key,attempt_id,verified_at,payload_hash,safe_metadata,processing_state,result_state)
  values(a.provider,a.environment,a.merchant_ref,'refund:'||p_event_key,a.id,now(),v_hash,jsonb_build_object('refund_id',r.id,'refund_uid',p_result->>'refund_uid'),'received',v_state)
  on conflict(provider,environment,merchant_ref,event_key) do nothing returning id into v_event;
  if v_event is null then
    select id into v_event from public.payment_events where provider=a.provider and environment=a.environment and merchant_ref=a.merchant_ref and event_key='refund:'||p_event_key;
    if (select payload_hash from public.payment_events where id=v_event) is distinct from v_hash then raise exception 'Refund event key payload conflict' using errcode='PT409'; end if;
    if r.state=v_state and (p_result->>'refund_uid' is null or r.provider_refund_uid=p_result->>'refund_uid') then return jsonb_build_object('refund_id',r.id,'attempt_id',a.id,'state',r.state,'replayed',true); end if;
  end if;
  if r.state='succeeded' and v_state<>'succeeded' then raise exception 'Refund state regression' using errcode='PT409'; end if;
  if r.provider_refund_uid is not null and nullif(p_result->>'refund_uid','') is not null and r.provider_refund_uid is distinct from p_result->>'refund_uid' then raise exception 'Refund UID is immutable' using errcode='PT409'; end if;
  update public.payment_refunds set state=v_state,provider_refund_uid=coalesce(nullif(p_result->>'refund_uid',''),provider_refund_uid),updated_at=now() where id=r.id;
  select coalesce(sum(amount_agorot),0) into v_succeeded from public.payment_refunds where attempt_id=a.id and state='succeeded';
  if v_state='succeeded' then
    if v_succeeded>=a.amount_agorot then update public.payment_attempts set state='refunded',updated_at=now() where id=a.id;
    else update public.payment_attempts set state='partially_refunded',updated_at=now() where id=a.id; end if;
  end if;
  update public.payment_events set processing_state='applied' where id=v_event;
  if v_state in ('succeeded','failed') then
    update public.commerce_outbox set state='done',completed_at=now(),last_error_code=null,updated_at=now()
      where effect_type='payment.refund.reconcile' and aggregate_id=r.id and state<>'leased';
  end if;
  return jsonb_build_object('refund_id',r.id,'attempt_id',a.id,'state',v_state,'replayed',false);
end $$;
revoke all on function public.commerce_refund_result(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_refund_result(uuid,text,jsonb) to service_role;

create or replace function public.commerce_add_settlement(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.settlement_entries%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  insert into public.settlement_entries(provider,environment,merchant_ref,settlement_uid,transaction_uid,attempt_id,gross_agorot,fee_agorot,net_agorot,currency,settled_at,bank_reference,safe_metadata)
  values(p_payload->>'provider',p_payload->>'environment',p_payload->>'merchant_ref',p_payload->>'settlement_uid',nullif(p_payload->>'transaction_uid',''),nullif(p_payload->>'attempt_id','')::uuid,(p_payload->>'gross_agorot')::bigint,coalesce((p_payload->>'fee_agorot')::bigint,0),(p_payload->>'net_agorot')::bigint,'ILS',nullif(p_payload->>'settled_at','')::timestamptz,p_payload->>'bank_reference',coalesce(p_payload->'safe_metadata','{}'::jsonb))
  on conflict(provider,environment,merchant_ref,settlement_uid,transaction_uid) do update set safe_metadata=settlement_entries.safe_metadata returning * into s;
  return jsonb_build_object('id',s.id,'settlement_uid',s.settlement_uid,'gross_agorot',s.gross_agorot,'fee_agorot',s.fee_agorot,'net_agorot',s.net_agorot,'currency',s.currency,'settled_at',s.settled_at);
end $$;
revoke all on function public.commerce_add_settlement(jsonb) from public,anon,authenticated;
grant execute on function public.commerce_add_settlement(jsonb) to service_role;
