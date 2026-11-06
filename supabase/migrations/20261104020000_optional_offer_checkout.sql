-- Additive website offer checkout. Existing catalog, intent, payment and
-- finalization implementations remain intact behind this scoped extension.
create function public.optional_offer_variant_visible(p_variant_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_product uuid; allowed boolean;
begin
  select v.product_id into v_product from public.product_variants v join public.products p on p.id=v.product_id
    join public.categories c on c.id=p.category_id where v.id=p_variant_id and v.is_active and p.status='active' and c.is_active;
  if not found then return false; end if;
  if to_regprocedure('public.catalog_product_visible(uuid)') is not null then
    execute 'select public.catalog_product_visible($1)' into allowed using v_product;
    if allowed is not true then return false; end if;
  end if;
  if to_regprocedure('public.catalog_variant_visible(uuid)') is not null then
    execute 'select public.catalog_variant_visible($1)' into allowed using p_variant_id;
    if allowed is not true then return false; end if;
  end if;
  return true;
end $$;
revoke all on function public.optional_offer_variant_visible(uuid) from public,anon,authenticated,service_role;

-- This narrow scalar is safe to call publicly: visibility is checked before
-- any price is resolved, role comes from the authenticated actor, never input,
-- and no costs/supplier data are returned. Invoker offer projections need this
-- execute grant; private financial code calls exactly the same implementation.
create function public.optional_offer_catalog_price_agorot(p_variant_id uuid)
returns bigint language plpgsql stable security definer set search_path='' as $$
declare v_product uuid; v_price numeric; v_role text:=public.active_app_role(); promo record; query text;
begin
  if not public.optional_offer_variant_visible(p_variant_id) then return null; end if;
  select v.product_id,coalesce(v.price_override,
    (select pp.price from public.product_prices pp where pp.product_id=v.product_id and pp.role=v_role),p.price)
    into v_product,v_price from public.product_variants v join public.products p on p.id=v.product_id where v.id=p_variant_id;
  if v_price is null or v_price<=0 then return null; end if;
  query:='select pr.promotion_type,pr.value from public.product_public_promotions pr where pr.product_id=$1 and pr.is_active and (pr.scheduled_from is null or pr.scheduled_from<=now()) and (pr.scheduled_until is null or pr.scheduled_until>=now())';
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='product_public_promotions' and column_name='variant_id') then
    query:=query||' and (pr.variant_id is null or pr.variant_id=$2)';
  end if;
  if to_regclass('public.product_promotion_audiences') is not null then
    query:=query||' and exists(select 1 from public.product_promotion_audiences a where a.promotion_id=pr.id and a.role=$3)';
  end if;
  query:=query||' order by ';
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='product_public_promotions' and column_name='variant_id') then
    query:=query||'case when pr.variant_id=$2 then 0 else 1 end,';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='product_public_promotions' and column_name='priority') then
    query:=query||'pr.priority desc nulls last,';
  end if;
  query:=query||'pr.id limit 1';
  execute query into promo using v_product,p_variant_id,coalesce(v_role,'customer');
  if promo.promotion_type is not null then
    v_price:=case promo.promotion_type when 'percent' then v_price*(1-promo.value/100)
      when 'fixed' then v_price-promo.value when 'final_price' then promo.value else v_price end;
  end if;
  if v_price<=0 or round(v_price*100)<1 or round(v_price*100)>100000000 then return null; end if;
  return round(v_price*100)::bigint;
end $$;
revoke all on function public.optional_offer_catalog_price_agorot(uuid) from public;
grant execute on function public.optional_offer_catalog_price_agorot(uuid) to anon,authenticated;

create function public.optional_offer_effective_price_agorot(p_catalog bigint,p_mode text,p_bps integer,p_fixed bigint)
returns bigint language sql immutable security invoker set search_path='' as $$
  select case when p_catalog is null or p_catalog<1 then null
    when p_mode='catalog' then p_catalog
    when p_mode='percent' and p_bps between 1 and 9500 then nullif(round(p_catalog::numeric*(10000-p_bps)/10000)::bigint,0)
    when p_mode='fixed' and p_fixed between 1 and 100000000 then p_fixed end;
$$;
revoke all on function public.optional_offer_effective_price_agorot(bigint,text,integer,bigint) from public;
grant execute on function public.optional_offer_effective_price_agorot(bigint,text,integer,bigint) to anon,authenticated;

create or replace function public.get_public_product_optional_offers(p_product_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'revision',coalesce((select s.revision from public.product_optional_offer_sets s where s.parent_product_id=p_product_id),0),
    'offers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'parent_product_id',o.parent_product_id,'target_product_id',o.target_product_id,
      'target_variant_id',o.target_variant_id,'kind',o.kind,'label_he',o.label_he,'label_en',o.label_en,
      'pricing_mode',o.pricing_mode,'discount_bps',o.discount_bps,'fixed_price_agorot',o.fixed_price_agorot,
      'is_active',o.is_active,'sort_order',o.sort_order,'catalog_price_agorot',p.catalog_price,
      'effective_price_agorot',public.optional_offer_effective_price_agorot(p.catalog_price,o.pricing_mode,o.discount_bps,o.fixed_price_agorot)
    ) order by case o.kind when 'complementary' then 0 else 1 end,o.sort_order,o.id)
    from public.product_optional_offers o cross join lateral(select public.optional_offer_catalog_price_agorot(o.target_variant_id) as catalog_price)p
    where o.parent_product_id=p_product_id),'[]'::jsonb)
  );
$$;

alter table public.commerce_intent_items
  add column line_id text check (line_id is null or length(line_id) between 1 and 160),
  add column offer_id uuid references public.product_optional_offers(id) on delete restrict,
  add column parent_line_id text,
  add column offer_revision integer,
  add column offer_snapshot jsonb;
alter table public.order_items
  add column line_id text,
  add column offer_id uuid references public.product_optional_offers(id) on delete restrict,
  add column parent_line_id text,
  add column offer_revision integer,
  add column offer_snapshot jsonb;
create unique index commerce_intent_items_context_line_unique on public.commerce_intent_items(intent_id,line_id) where line_id is not null;
create unique index order_items_context_line_unique on public.order_items(order_id,line_id) where line_id is not null;
grant select(line_id,offer_id,parent_line_id,offer_revision,offer_snapshot) on public.order_items to authenticated;

create table public.commerce_optional_offer_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete restrict,
  idempotency_key text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  intent_id uuid not null unique references public.commerce_intents(id) on delete restrict,
  core_payload jsonb not null,
  created_at timestamptz not null default now()
);
create unique index commerce_optional_offer_requests_actor_key on public.commerce_optional_offer_requests
  (coalesce(actor_id,'00000000-0000-0000-0000-000000000000'::uuid),idempotency_key);
alter table public.commerce_optional_offer_requests enable row level security;
revoke all on public.commerce_optional_offer_requests from public,anon,authenticated,service_role;

create function public.commerce_optional_offer_response(p_intent uuid,p_capability text,p_replayed boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('intent',jsonb_build_object('id',i.id,'status',i.status,'channel',i.channel,
    'total_agorot',i.total_agorot,'currency',i.currency,'expires_at',i.expires_at,'revision',i.revision),
    'items',coalesce((select jsonb_agg(jsonb_build_object('line_no',c.line_no,'product_id',c.product_id,'variant_id',c.variant_id,
      'quantity',c.quantity,'unit_price_agorot',c.unit_price_agorot,'discount_per_unit_agorot',c.discount_per_unit_agorot,
      'discount_agorot',c.discount_agorot,'gross_agorot',c.gross_agorot,'net_agorot',c.net_agorot,'vat_agorot',c.vat_agorot,
      'vat_rate',c.vat_rate,'sku_snapshot',c.sku_snapshot,'product_name_he',c.product_name_he,'product_name_en',c.product_name_en,
      'line_id',c.line_id,'offer_id',c.offer_id,'parent_line_id',c.parent_line_id,'offer_revision',c.offer_revision,'offer_snapshot',c.offer_snapshot)
      order by c.line_no) from public.commerce_intent_items c where c.intent_id=i.id),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(jsonb_build_object('variant_id',r.variant_id,'quantity',r.quantity,'expires_at',r.expires_at))
      from public.stock_reservations r where r.intent_id=i.id),'[]'::jsonb),'guest_capability',p_capability,'replayed',p_replayed)
  from public.commerce_intents i where i.id=p_intent;
$$;
revoke all on function public.commerce_optional_offer_response(uuid,text,boolean) from public,anon,authenticated,service_role;

create function public.commerce_create_optional_offers_intent_impl(p_payload jsonb,p_guest boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_key text; v_hash text; v_existing public.commerce_optional_offer_requests;
  item jsonb; field text; parent jsonb; v_items jsonb; v_lines text[]:='{}'; v_line text; v_qty integer;
  v_variant uuid; v_offer uuid; offer public.product_optional_offers; v_revision integer; v_product uuid;
  v_core jsonb; v_result jsonb; v_intent uuid; v_baselines jsonb; baseline jsonb; v_rows jsonb:='[]';
  v_catalog bigint; v_effective bigint; v_unit bigint; v_discount bigint; v_snapshot jsonb; v_rate numeric;
  v_gross bigint; v_net bigint; v_vat bigint; v_total bigint:=0; v_subtotal bigint:=0; v_vat_total bigint:=0; v_discounts bigint:=0;
  v_no integer:=0; v_any_offer boolean:=false;
begin
  if p_guest then
    if auth.role() is distinct from 'service_role' or v_actor is not null then raise exception 'Service guest caller required' using errcode='42501'; end if;
  elsif v_actor is null or public.active_app_role() is distinct from 'customer' then raise exception 'Customer required' using errcode='42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid optional checkout' using errcode='22023'; end if;
  for field in select jsonb_object_keys(p_payload) loop
    if field<>all(array['channel','idempotency_key','customer_snapshot','items','expected_revision']) then raise exception 'Unknown optional checkout field' using errcode='22023'; end if;
  end loop;
  if p_payload ? 'channel' and p_payload->>'channel' is distinct from 'website' then raise exception 'Website checkout required' using errcode='42501'; end if;
  if p_payload ? 'expected_revision' and (jsonb_typeof(p_payload->'expected_revision')<>'number'
    or (p_payload->>'expected_revision')::numeric<>trunc((p_payload->>'expected_revision')::numeric)
    or (p_payload->>'expected_revision')::numeric<0) then raise exception 'Invalid checkout revision' using errcode='22023'; end if;
  v_key:=p_payload->>'idempotency_key';
  if jsonb_typeof(p_payload->'idempotency_key') is distinct from 'string' or length(v_key) not between 16 and 120 or v_key !~ '^[A-Za-z0-9_-]+$' then raise exception 'Invalid idempotency key' using errcode='22023'; end if;
  v_items:=p_payload->'items';
  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) not between 1 and 100 then raise exception 'Invalid items' using errcode='22023'; end if;
  -- Bind ORIGINAL context before any catalog/offer re-evaluation. A lost
  -- acknowledgement remains recoverable after configuration or prices change.
  v_hash:=encode(public.commerce_digest(p_payload::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('optional-offer-intent:'||coalesce(v_actor::text,'guest')||':'||v_key,0));
  select * into v_existing from public.commerce_optional_offer_requests where actor_id is not distinct from v_actor and idempotency_key=v_key;
  if found then
    if v_existing.request_hash<>v_hash then raise exception 'Idempotency payload conflict' using errcode='PT409'; end if;
    v_result:=case when p_guest then public.commerce_create_guest_intent(v_existing.core_payload) else public.commerce_create_intent(v_existing.core_payload) end;
    if (v_result->'intent'->>'id')::uuid is distinct from v_existing.intent_id or (v_result->>'replayed')::boolean is not true then raise exception 'Optional checkout replay conflict' using errcode='PT409'; end if;
    return public.commerce_optional_offer_response(v_existing.intent_id,v_result->>'guest_capability',true);
  end if;
  if jsonb_typeof(p_payload->'customer_snapshot') is distinct from 'object' then raise exception 'Invalid customer snapshot' using errcode='22023'; end if;
  for field in select jsonb_object_keys(p_payload->'customer_snapshot') loop
    if field<>all(array['name','email','phone','business_number','address']) then raise exception 'Unknown customer snapshot field' using errcode='22023'; end if;
    if jsonb_typeof(p_payload->'customer_snapshot'->field)<>'string' or length(p_payload->'customer_snapshot'->>field)>(case field when 'name' then 200 when 'email' then 254 when 'address' then 500 else 30 end) then raise exception 'Invalid customer snapshot field' using errcode='22023'; end if;
  end loop;
  if nullif(btrim(p_payload->'customer_snapshot'->>'name'),'') is null then raise exception 'Customer name required' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(item)<>'object' then raise exception 'Invalid item' using errcode='22023'; end if;
    for field in select jsonb_object_keys(item) loop
      if field<>all(array['line_id','variant_id','quantity','offer_id','parent_line_id','offer_revision']) then raise exception 'Unknown checkout item field' using errcode='22023'; end if;
    end loop;
    if jsonb_typeof(item->'line_id') is distinct from 'string' or length(item->>'line_id') not between 1 and 160 or nullif(btrim(item->>'line_id'),'') is null
       or jsonb_typeof(item->'variant_id') is distinct from 'string' or jsonb_typeof(item->'quantity') is distinct from 'number'
       or (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric) or (item->>'quantity')::numeric not between 1 and 99 then
      raise exception 'Invalid checkout line' using errcode='22023';
    end if;
    v_line:=item->>'line_id'; v_variant:=(item->>'variant_id')::uuid;
    if v_line=any(v_lines) then raise exception 'Duplicate checkout line identity' using errcode='22023'; end if;
    v_lines:=array_append(v_lines,v_line);
    if not public.optional_offer_variant_visible(v_variant) then raise exception 'Variant unavailable' using errcode='22023'; end if;
    if item ? 'offer_id' then
      v_any_offer:=true;
      if jsonb_typeof(item->'offer_id')<>'string' or jsonb_typeof(item->'parent_line_id') is distinct from 'string'
         or length(item->>'parent_line_id') not between 1 and 160 or jsonb_typeof(item->'offer_revision') is distinct from 'number'
         or (item->>'offer_revision')::numeric<>trunc((item->>'offer_revision')::numeric) or (item->>'offer_revision')::numeric<0 then
        raise exception 'Invalid offer context' using errcode='22023';
      end if;
      v_offer:=(item->>'offer_id')::uuid;
    elsif item ? 'parent_line_id' or item ? 'offer_revision' then raise exception 'Orphan offer context' using errcode='22023'; end if;
  end loop;
  if not v_any_offer then raise exception 'Optional offer selection required' using errcode='22023'; end if;
  -- Core inserts acquire product FK KEY SHARE locks. Take those before set
  -- locks, in stable order, to match catalog save's product -> offer-set order.
  -- Otherwise a concurrent admin save can hold the parent product while waiting
  -- for our set lock, and our later FK insert would wait for that same product.
  for v_product in select distinct v.product_id from jsonb_array_elements(v_items)x
    join public.product_variants v on v.id=(x->>'variant_id')::uuid order by 1 loop
    perform 1 from public.products where id=v_product for key share;
  end loop;
  -- Relevant set revisions precede the existing core's distinct variant ledger
  -- locks. Replacement cannot race a resolved offer configuration.
  for v_product in select distinct o.parent_product_id from jsonb_array_elements(v_items)x
    join public.product_optional_offers o on o.id=(x->>'offer_id')::uuid where x ? 'offer_id' order by 1 loop
    perform 1 from public.product_optional_offer_sets where parent_product_id=v_product for share;
  end loop;
  for item in select value from jsonb_array_elements(v_items) where value ? 'offer_id' loop
    select * into offer from public.product_optional_offers where id=(item->>'offer_id')::uuid and deleted_at is null and is_active;
    if not found then raise exception 'Optional offer unavailable' using errcode='PT409'; end if;
    select revision into v_revision from public.product_optional_offer_sets where parent_product_id=offer.parent_product_id;
    if v_revision is distinct from (item->>'offer_revision')::integer then raise exception 'Optional offer changed; review selection' using errcode='PT409'; end if;
    select value into parent from jsonb_array_elements(v_items) where value->>'line_id'=item->>'parent_line_id';
    if parent is null or parent ? 'offer_id' or parent->>'line_id'=item->>'line_id'
       or (parent->>'quantity')::integer<>(item->>'quantity')::integer
       or (item->>'variant_id')::uuid<>offer.target_variant_id then raise exception 'Invalid qualifying parent or offer quantity' using errcode='22023'; end if;
    if not exists(select 1 from public.product_variants where id=(parent->>'variant_id')::uuid and product_id=offer.parent_product_id) then raise exception 'Offer parent product mismatch' using errcode='22023'; end if;
    if (select count(*) from jsonb_array_elements(v_items)x where x->>'offer_id'=item->>'offer_id' and x->>'parent_line_id'=item->>'parent_line_id')<>1 then raise exception 'Duplicate optional offer selection' using errcode='22023'; end if;
  end loop;
  select jsonb_build_object('channel','website','idempotency_key','optional-'||encode(public.commerce_digest(coalesce(v_actor::text,'guest')||':'||v_key||':'||v_hash,'sha256'),'hex'),
    'customer_snapshot',p_payload->'customer_snapshot','items',jsonb_agg(jsonb_build_object('variant_id',variant,'quantity',qty) order by variant))
    into v_core from(select (x->>'variant_id')::uuid variant,sum((x->>'quantity')::integer)::integer qty from jsonb_array_elements(v_items)x group by 1)aggregated;
  v_result:=case when p_guest then public.commerce_create_guest_intent(v_core) else public.commerce_create_intent(v_core) end;
  if (v_result->>'replayed')::boolean is not false then raise exception 'Optional checkout baseline key conflict' using errcode='PT409'; end if;
  v_intent:=(v_result->'intent'->>'id')::uuid;
  select jsonb_agg(to_jsonb(c)) into v_baselines from public.commerce_intent_items c where intent_id=v_intent;
  select vat_rate into v_rate from public.commerce_intents where id=v_intent;
  for item in select value from jsonb_array_elements(v_items) loop
    select value into baseline from jsonb_array_elements(v_baselines) where value->>'variant_id'=item->>'variant_id';
    if baseline is null then raise exception 'Canonical quote unavailable' using errcode='PT409'; end if;
    v_qty:=(item->>'quantity')::integer; v_unit:=(baseline->>'unit_price_agorot')::bigint; v_discount:=(baseline->>'discount_per_unit_agorot')::bigint;
    v_snapshot:=null;
    if item ? 'offer_id' then
      select * into offer from public.product_optional_offers where id=(item->>'offer_id')::uuid;
      v_catalog:=public.optional_offer_catalog_price_agorot(offer.target_variant_id);
      v_effective:=public.optional_offer_effective_price_agorot(v_catalog,offer.pricing_mode,offer.discount_bps,offer.fixed_price_agorot);
      if v_catalog is null or v_effective is null then raise exception 'Quote-only product cannot be checked out' using errcode='22023'; end if;
      v_unit:=greatest(v_catalog,v_effective); v_discount:=v_unit-v_effective;
      v_snapshot:=jsonb_build_object('id',offer.id,'kind',offer.kind,'label_he',offer.label_he,'label_en',offer.label_en,
        'pricing_mode',offer.pricing_mode,'discount_bps',offer.discount_bps,'fixed_price_agorot',offer.fixed_price_agorot,
        'catalog_price_agorot',v_catalog,'effective_price_agorot',v_effective,'parent_product_id',offer.parent_product_id,
        'target_product_id',offer.target_product_id,'target_variant_id',offer.target_variant_id,'revision',(item->>'offer_revision')::integer);
    end if;
    v_gross:=(v_unit-v_discount)*v_qty; v_net:=round(v_gross/(1+v_rate/100)); v_vat:=v_gross-v_net;
    v_total:=v_total+v_gross; v_subtotal:=v_subtotal+v_net; v_vat_total:=v_vat_total+v_vat; v_discounts:=v_discounts+v_discount*v_qty;
    v_rows:=v_rows||jsonb_build_array(baseline||jsonb_build_object('line_id',item->>'line_id','quantity',v_qty,'unit_price_agorot',v_unit,
      'discount_per_unit_agorot',v_discount,'discount_agorot',v_discount*v_qty,'gross_agorot',v_gross,'net_agorot',v_net,'vat_agorot',v_vat,
      'offer_id',item->>'offer_id','parent_line_id',item->>'parent_line_id','offer_revision',(item->>'offer_revision')::integer,'offer_snapshot',v_snapshot));
  end loop;
  delete from public.commerce_intent_items where intent_id=v_intent;
  for item in select value from jsonb_array_elements(v_rows) loop
    v_no:=v_no+1;
    insert into public.commerce_intent_items(intent_id,line_no,product_id,variant_id,quantity,unit_price_agorot,discount_per_unit_agorot,
      discount_agorot,gross_agorot,net_agorot,vat_agorot,vat_rate,unit_cost_agorot,sku_snapshot,product_name_he,product_name_en,
      line_id,offer_id,parent_line_id,offer_revision,offer_snapshot)
    values(v_intent,v_no,(item->>'product_id')::uuid,(item->>'variant_id')::uuid,(item->>'quantity')::integer,(item->>'unit_price_agorot')::bigint,
      (item->>'discount_per_unit_agorot')::bigint,(item->>'discount_agorot')::bigint,(item->>'gross_agorot')::bigint,(item->>'net_agorot')::bigint,
      (item->>'vat_agorot')::bigint,(item->>'vat_rate')::numeric,(item->>'unit_cost_agorot')::bigint,item->>'sku_snapshot',item->>'product_name_he',item->>'product_name_en',
      item->>'line_id',(item->>'offer_id')::uuid,item->>'parent_line_id',(item->>'offer_revision')::integer,nullif(item->'offer_snapshot','null'::jsonb));
  end loop;
  update public.commerce_intents set subtotal_agorot=v_subtotal,discount_agorot=v_discounts,vat_agorot=v_vat_total,total_agorot=v_total where id=v_intent;
  insert into public.commerce_optional_offer_requests(actor_id,idempotency_key,request_hash,intent_id,core_payload) values(v_actor,v_key,v_hash,v_intent,v_core);
  return public.commerce_optional_offer_response(v_intent,v_result->>'guest_capability',false);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid optional checkout value' using errcode='22023';
end $$;
revoke all on function public.commerce_create_optional_offers_intent_impl(jsonb,boolean) from public,anon,authenticated,service_role;

create function public.commerce_create_optional_offers_intent(p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$ select public.commerce_create_optional_offers_intent_impl(p_payload,false); $$;
revoke all on function public.commerce_create_optional_offers_intent(jsonb) from public,anon,service_role;
grant execute on function public.commerce_create_optional_offers_intent(jsonb) to authenticated;
create function public.commerce_create_guest_optional_offers_intent(p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$ select public.commerce_create_optional_offers_intent_impl(p_payload,true); $$;
revoke all on function public.commerce_create_guest_optional_offers_intent(jsonb) from public,anon,authenticated;
grant execute on function public.commerce_create_guest_optional_offers_intent(jsonb) to service_role;

-- Preserve installed finalization byte-for-byte. Its per-line stock decrement
-- is correct for contextual duplicates once the aggregate is validated under
-- the same variant locks; no averaged prices or changed VAT rounding are used.
alter function public.commerce_finalize_intent(uuid) rename to commerce_finalize_intent_before_optional_offers;
revoke all on function public.commerce_finalize_intent_before_optional_offers(uuid) from public,anon,authenticated,service_role;
create function public.commerce_finalize_intent(p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare intent public.commerce_intents; item record; result jsonb; v_order uuid; v_count integer; v_rows integer; v_stock integer; v_other bigint;
begin
  select * into intent from public.commerce_intents where id=p_intent_id for update;
  if not found or intent.finalized_order_id is not null or not exists(select 1 from public.commerce_optional_offer_requests where intent_id=p_intent_id) then
    return public.commerce_finalize_intent_before_optional_offers(p_intent_id);
  end if;
  for item in select c.variant_id,sum(c.quantity)::bigint qty from public.commerce_intent_items c
    where c.intent_id=p_intent_id group by c.variant_id order by c.variant_id loop
    perform pg_advisory_xact_lock(hashtext(item.variant_id::text));
    select stock_qty into v_stock from public.product_variants where id=item.variant_id for update;
    if exists(select 1 from public.stock_reservations where intent_id=p_intent_id and variant_id=item.variant_id) then
      if not exists(select 1 from public.stock_reservations where intent_id=p_intent_id and variant_id=item.variant_id and quantity=item.qty and state='active') then
        raise exception 'Optional checkout reservation mismatch' using errcode='PT409';
      end if;
      select coalesce(sum(quantity),0) into v_other from public.stock_reservations r where r.variant_id=item.variant_id
        and r.intent_id<>p_intent_id and r.state='active' and (r.expires_at>now() or public.commerce_has_unsettled_payment(r.intent_id));
      if v_stock-item.qty<v_other then raise exception 'Insufficient available stock' using errcode='PT409'; end if;
    end if;
  end loop;
  result:=public.commerce_finalize_intent_before_optional_offers(p_intent_id);
  v_order:=(result->>'order_id')::uuid;
  if v_order is not null then
    with source as (
      select c.*,row_number() over(partition by variant_id,quantity,unit_price_agorot,gross_agorot,discount_agorot,net_agorot,vat_agorot order by line_no) rn
      from public.commerce_intent_items c where intent_id=p_intent_id
    ), destination as (
      select o.*,row_number() over(partition by variant_id,quantity,round(unit_price*100)::bigint,round(total_price*100)::bigint,
        round(discount_amount*100)::bigint,round(net_amount*100)::bigint,round(vat_amount*100)::bigint order by created_at,id) rn
      from public.order_items o where order_id=v_order
    )
    update public.order_items o set line_id=s.line_id,offer_id=s.offer_id,parent_line_id=s.parent_line_id,offer_revision=s.offer_revision,offer_snapshot=s.offer_snapshot
      from source s join destination d on d.variant_id=s.variant_id and d.quantity=s.quantity and d.rn=s.rn
        and round(d.unit_price*100)::bigint=s.unit_price_agorot and round(d.total_price*100)::bigint=s.gross_agorot
        and round(d.discount_amount*100)::bigint=s.discount_agorot and round(d.net_amount*100)::bigint=s.net_agorot and round(d.vat_amount*100)::bigint=s.vat_agorot
      where o.id=d.id;
    get diagnostics v_rows=row_count;
    select count(*) into v_count from public.commerce_intent_items where intent_id=p_intent_id;
    if v_rows<>v_count then raise exception 'Optional order snapshot mismatch' using errcode='PT409'; end if;
  end if;
  return result;
end $$;
revoke all on function public.commerce_finalize_intent(uuid) from public,anon,authenticated,service_role;
