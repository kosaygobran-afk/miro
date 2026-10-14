-- Internal fiscal-document engine. Official issuance remains disabled until reviewed readiness is explicitly added.
create table if not exists public.document_business_versions (
  id uuid primary key default gen_random_uuid(),
  revision integer not null unique check(revision>0),
  entity_kind text check(entity_kind is null or entity_kind in ('exempt','registered','company')),
  identity_snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create or replace function public.commerce_prevent_identity_version_change()
returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'Business identity versions are immutable' using errcode='42501'; end $$;
create trigger document_business_versions_no_update before update or delete on public.document_business_versions for each row execute function public.commerce_prevent_identity_version_change();

create or replace function public.commerce_snapshot_business_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_rev integer; v_identity jsonb;
begin
  if new.key='commerce.identity' then
    v_rev:=coalesce((new.value->>'revision')::integer,1);
    v_identity:=coalesce(new.value->'identity','{}'::jsonb);
    insert into public.document_business_versions(revision,entity_kind,identity_snapshot,created_by)
    values(v_rev,nullif(v_identity->>'entity_kind','')::text,v_identity,new.updated_by)
    on conflict(revision) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists commerce_snapshot_business_identity_trigger on public.business_settings;
create trigger commerce_snapshot_business_identity_trigger after insert or update of value on public.business_settings
for each row execute function public.commerce_snapshot_business_identity();
insert into public.document_business_versions(revision,entity_kind,identity_snapshot,created_by)
select coalesce((value->>'revision')::integer,1),nullif(value->'identity'->>'entity_kind',''),coalesce(value->'identity','{}'::jsonb),updated_by
from public.business_settings where key='commerce.identity'
on conflict(revision) do nothing;

create table if not exists public.document_number_series (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check(document_type in ('quote','proforma','receipt','invoice','tax_invoice','invoice_receipt','credit_note','correction')),
  fiscal_year integer not null check(fiscal_year between 2000 and 2200),
  prefix text not null,
  next_number bigint not null default 1 check(next_number>0),
  revision integer not null default 1 check(revision>0),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(document_type,fiscal_year)
);

create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check(document_type in ('quote','proforma','receipt','invoice','tax_invoice','invoice_receipt','credit_note','correction')),
  state text not null default 'draft' check(state in ('draft','numbered_draft','issued','failed','unknown','void','corrected')),
  order_id uuid references public.orders(id) on delete set null,
  intent_id uuid references public.commerce_intents(id) on delete set null,
  payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
  refund_id uuid references public.payment_refunds(id) on delete set null,
  correction_of_id uuid references public.fiscal_documents(id) on delete restrict,
  business_version_id uuid references public.document_business_versions(id) on delete restrict,
  business_snapshot jsonb not null,
  customer_snapshot jsonb not null,
  currency text not null default 'ILS' check(currency='ILS'),
  subtotal_agorot bigint not null check(subtotal_agorot>=0),
  vat_agorot bigint not null check(vat_agorot>=0),
  total_agorot bigint not null check(total_agorot=subtotal_agorot+vat_agorot),
  document_snapshot jsonb not null,
  series_id uuid references public.document_number_series(id) on delete restrict,
  number bigint,
  display_number text,
  idempotency_effect_key text not null unique,
  issued_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(series_id,number)
);
create index if not exists fiscal_documents_order_idx on public.fiscal_documents(order_id,created_at desc);
create index if not exists fiscal_documents_state_idx on public.fiscal_documents(state,created_at);

create table if not exists public.fiscal_document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.fiscal_documents(id) on delete restrict,
  line_no integer not null check(line_no>0),
  item_snapshot jsonb not null,
  net_agorot bigint not null check(net_agorot>=0),
  vat_agorot bigint not null check(vat_agorot>=0),
  gross_agorot bigint not null check(gross_agorot=net_agorot+vat_agorot),
  unique(document_id,line_no)
);

create table if not exists public.fiscal_document_artifacts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.fiscal_documents(id) on delete restrict,
  artifact_kind text not null check(artifact_kind in ('preview_pdf','issued_pdf','signed_pdf','xml','uniform_export')),
  storage_key text not null unique,
  mime_type text not null,
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check(byte_size between 1 and 52428800),
  signer_state text not null default 'not_requested' check(signer_state in ('not_requested','pending','signed','failed','unknown')),
  signer_reference text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.document_allocation_operations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.fiscal_documents(id) on delete restrict,
  operation_key text not null unique,
  state text not null default 'pending' check(state in ('pending','approved','rejected','failed','unknown')),
  request_snapshot jsonb not null,
  allocation_number text,
  provider_reference text,
  safe_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Preserve historical legacy rows and provenance; auth account deletion must not delete invoices.
do $$ declare c record; begin
  alter table public.invoices alter column user_id drop not null;
  for c in select conname from pg_constraint where conrelid='public.invoices'::regclass and contype='f' and confrelid='auth.users'::regclass and pg_get_constraintdef(oid) like '%user_id%' loop
    execute format('alter table public.invoices drop constraint %I',c.conname);
  end loop;
  alter table public.invoices add constraint invoices_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null not valid;
  alter table public.invoices validate constraint invoices_user_id_fkey;
end $$;
alter table public.invoices add column if not exists legacy_provenance text not null default 'legacy_unverified';
alter table public.invoices add column if not exists customer_snapshot jsonb not null default '{}'::jsonb;

-- Protected rows are service/RPC only.
do $$ declare t text; begin
  foreach t in array array['document_business_versions','document_number_series','fiscal_documents','fiscal_document_items','fiscal_document_artifacts','document_allocation_operations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

create or replace function public.commerce_guard_document_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.document_type,new.order_id,new.intent_id,new.payment_attempt_id,new.refund_id,new.correction_of_id,new.business_version_id,new.business_snapshot,new.customer_snapshot,new.currency,new.subtotal_agorot,new.vat_agorot,new.total_agorot,new.document_snapshot,new.series_id,new.number,new.display_number,new.idempotency_effect_key)
     is distinct from row(old.document_type,old.order_id,old.intent_id,old.payment_attempt_id,old.refund_id,old.correction_of_id,old.business_version_id,old.business_snapshot,old.customer_snapshot,old.currency,old.subtotal_agorot,old.vat_agorot,old.total_agorot,old.document_snapshot,old.series_id,old.number,old.display_number,old.idempotency_effect_key) then
    raise exception 'Fiscal document snapshots are immutable' using errcode='42501';
  end if;
  if old.state in ('issued','void','corrected') and (new.state is distinct from old.state or new.issued_at is distinct from old.issued_at) then raise exception 'Issued fiscal state/time is immutable; use correction document' using errcode='42501'; end if;
  return new;
end $$;
create trigger fiscal_documents_snapshot_guard before update on public.fiscal_documents
for each row execute function public.commerce_guard_document_snapshot();
create or replace function public.commerce_guard_fiscal_child_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Fiscal child evidence is immutable' using errcode='42501';
end $$;
create trigger fiscal_items_no_update before update on public.fiscal_document_items for each row execute function public.commerce_guard_fiscal_child_update();
create trigger fiscal_artifacts_no_update before update on public.fiscal_document_artifacts for each row execute function public.commerce_guard_fiscal_child_update();
create or replace function public.commerce_prevent_fiscal_delete()
returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'Fiscal evidence cannot be deleted' using errcode='42501'; end $$;
create trigger fiscal_documents_no_delete before delete on public.fiscal_documents for each row execute function public.commerce_prevent_fiscal_delete();
create trigger fiscal_items_no_delete before delete on public.fiscal_document_items for each row execute function public.commerce_prevent_fiscal_delete();
create trigger fiscal_artifacts_no_delete before delete on public.fiscal_document_artifacts for each row execute function public.commerce_prevent_fiscal_delete();

create or replace function public.commerce_document_action(p_action text,p_payload jsonb,p_actor uuid,p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_doc uuid; v_order uuid; v_intent uuid; v_effect text; v_type text; v_total bigint; v_net bigint; v_vat bigint; v_business jsonb; v_customer jsonb; v_snapshot jsonb; v_version uuid; v_number bigint; v_series uuid; v_year integer; v_original public.fiscal_documents%rowtype; v_payment_refs jsonb; v_business_revision integer;
begin
  if p_action='document_draft' then
    if coalesce(p_role,'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
    v_order:=nullif(p_payload->>'order_id','')::uuid; v_intent:=nullif(p_payload->>'intent_id','')::uuid;v_type:=coalesce(nullif(p_payload->>'document_type',''),nullif(p_payload->>'type',''),'receipt');
    v_type:=case v_type when 'transaction_invoice' then 'invoice' when 'tax_invoice_receipt' then 'invoice_receipt' else v_type end;
    if (v_order is null)=(v_intent is null) then raise exception 'Exactly one order or intent required' using errcode='22023'; end if;
    if v_type not in ('quote','proforma','receipt','invoice','tax_invoice','invoice_receipt','credit_note','correction') then raise exception 'Invalid document type' using errcode='22023'; end if;
    v_effect:='document:draft:'||coalesce(v_order::text,v_intent::text)||':'||v_type;
    if v_order is not null then
      select round(total*100)::bigint,round(net_total*100)::bigint,round(vat_total*100)::bigint,jsonb_build_object('name',customer_name,'email',customer_email,'phone',customer_phone,'user_id',user_id) into v_total,v_net,v_vat,v_customer from public.orders where id=v_order;
      if not found then raise exception 'Order not found' using errcode='22023'; end if;
      v_customer:=v_customer||coalesce((select i.customer_snapshot from public.commerce_intents i join public.orders o on o.commerce_intent_id=i.id where o.id=v_order),'{}'::jsonb);
      select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'variant_id',variant_id,'quantity',quantity,'sku',sku_snapshot,'name_he',product_name_he,'name_en',product_name_en,'unit_price_agorot',round(unit_price*100)::bigint,'discount_agorot',round(discount_amount*100)::bigint,'net_agorot',round(net_amount*100)::bigint,'vat_agorot',round(vat_amount*100)::bigint,'gross_agorot',round(total_price*100)::bigint) order by id),'[]'::jsonb) into v_snapshot from public.order_items where order_id=v_order;
      select coalesce(jsonb_agg(jsonb_build_object('method',payment_method,'amount_agorot',round(amount*100)::bigint,'reference',external_reference,'collection_kind',collection_kind,'provider',provider,'status',payment_status,'paid_at',paid_at) order by created_at),'[]'::jsonb) into v_payment_refs from public.order_payments where order_id=v_order and payment_status='paid';
    else
      select total_agorot,subtotal_agorot,vat_agorot,customer_snapshot into v_total,v_net,v_vat,v_customer from public.commerce_intents where id=v_intent;
      if not found then raise exception 'Intent not found' using errcode='22023'; end if;
      select coalesce(jsonb_agg(to_jsonb(i)-'id'-'intent_id' order by line_no),'[]'::jsonb) into v_snapshot from public.commerce_intent_items i where intent_id=v_intent;
      select coalesce(jsonb_agg(jsonb_build_object('method',method,'amount_agorot',amount_agorot,'reference',transaction_uid,'collection_kind',collection_kind,'provider',provider,'status',state,'paid_at',updated_at) order by created_at),'[]'::jsonb) into v_payment_refs from public.payment_attempts where intent_id=v_intent and state in ('captured','partially_refunded','refunded');
    end if;
    select id,identity_snapshot into v_version,v_business from public.document_business_versions order by revision desc limit 1;
    v_business_revision:=coalesce((select revision from public.document_business_versions where id=v_version),0);
    if p_payload ? 'expected_business_revision' and coalesce((p_payload->>'expected_business_revision')::integer,-1)<>v_business_revision then raise exception 'Business identity revision conflict' using errcode='PT409'; end if;
    v_business:=coalesce(v_business,jsonb_build_object('legal_name',null,'trade_name',null,'entity_kind',null,'registration_number',null,'vat_number',null,'address',jsonb_build_object('street',null,'city',null,'postal_code',null,'country','IL'),'phone',null,'email',null,'document_language','he'));
    v_effect:='document:draft:'||coalesce(v_order::text,v_intent::text)||':'||v_type||':'||coalesce(nullif(p_payload->>'idempotency_key',''),'default');
    insert into public.fiscal_documents(document_type,state,order_id,intent_id,business_version_id,business_snapshot,customer_snapshot,currency,subtotal_agorot,vat_agorot,total_agorot,document_snapshot,idempotency_effect_key,created_by)
    values(v_type,'draft',v_order,v_intent,v_version,v_business,coalesce(v_customer,'{}'::jsonb),'ILS',v_net,v_vat,v_total,jsonb_build_object('items',v_snapshot,'payment_references',coalesce(v_payment_refs,'[]'::jsonb),'document_policy_version',v_business->>'document_policy_version','preview_only',true),v_effect,p_actor)
    on conflict(idempotency_effect_key) do nothing returning id into v_doc;
    if v_doc is null then select id into v_doc from public.fiscal_documents where idempotency_effect_key=v_effect; end if;
    if not exists(select 1 from public.fiscal_document_items where document_id=v_doc) then
      insert into public.fiscal_document_items(document_id,line_no,item_snapshot,net_agorot,vat_agorot,gross_agorot)
      select v_doc,(e.ordinality)::int,e.value,coalesce((e.value->>'net_agorot')::bigint,0),coalesce((e.value->>'vat_agorot')::bigint,0),coalesce((e.value->>'gross_agorot')::bigint,coalesce((e.value->>'net_agorot')::bigint,0)+coalesce((e.value->>'vat_agorot')::bigint,0)) from jsonb_array_elements(coalesce(v_snapshot,'[]'::jsonb)) with ordinality e(value,ordinality);
    end if;
    insert into public.commerce_outbox(effect_type,aggregate_type,aggregate_id,effect_key,payload) values('document.create','fiscal_document',v_doc,'document-preview:'||v_doc,jsonb_build_object('document_id',v_doc,'preview_only',true)) on conflict(effect_key) do nothing;
    return jsonb_build_object('ok',true,'action',p_action,'data',(select jsonb_build_object('id',id,'document_type',document_type,'state',state,'order_id',order_id,'intent_id',intent_id,'business_snapshot',business_snapshot,'customer_snapshot',customer_snapshot,'subtotal_agorot',subtotal_agorot,'vat_agorot',vat_agorot,'total_agorot',total_agorot,'document_snapshot',document_snapshot,'created_at',created_at) from public.fiscal_documents where id=v_doc),'revision',1);
  elsif p_action='document_series_save' then
    if p_role is distinct from 'ceo' then raise exception 'CEO required' using errcode='42501'; end if;
    v_type:=p_payload->>'document_type';v_year:=(p_payload->>'fiscal_year')::integer;
    if v_type not in ('quote','proforma','receipt','invoice','tax_invoice','invoice_receipt','credit_note','correction') or v_year not between 2000 and 2200 or length(coalesce(p_payload->>'prefix',''))>24 then raise exception 'Invalid document series' using errcode='22023'; end if;
    insert into public.document_number_series(document_type,fiscal_year,prefix,next_number,created_by) values(v_type,v_year,p_payload->>'prefix',coalesce((p_payload->>'next_number')::bigint,1),p_actor)
    on conflict(document_type,fiscal_year) do update set prefix=excluded.prefix,next_number=greatest(document_number_series.next_number,excluded.next_number),revision=document_number_series.revision+1,updated_at=now() returning id into v_series;
    insert into public.audit_events(action,user_id,details,entity_type,entity_id) values('document_series_updated',p_actor,jsonb_build_object('document_type',v_type,'fiscal_year',v_year),'document_series',v_series);
    return jsonb_build_object('ok',true,'action',p_action,'data',(select jsonb_build_object('id',id,'document_type',document_type,'fiscal_year',fiscal_year,'prefix',prefix,'next_number',next_number,'revision',revision) from public.document_number_series where id=v_series));
  elsif p_action='document_reserve' then
    if p_role is distinct from 'ceo' then raise exception 'CEO required' using errcode='42501'; end if;
    raise exception 'Official issuance is disabled pending owner identity, accountant policy, signing and allocation readiness' using errcode='PT409';
  elsif p_action='document_correct' then
    if p_role is distinct from 'ceo' then raise exception 'CEO required' using errcode='42501'; end if;
    v_doc:=(p_payload->>'document_id')::uuid;
    select * into v_original from public.fiscal_documents where id=v_doc for update;
    if not found or v_original.state<>'issued' then raise exception 'Only an issued original can be corrected' using errcode='PT409'; end if;
    v_effect:='document:correction:'||v_doc||':'||encode(public.commerce_digest(coalesce(p_payload->>'reason',''),'sha256'),'hex');
    insert into public.fiscal_documents(document_type,state,order_id,intent_id,payment_attempt_id,refund_id,correction_of_id,business_version_id,business_snapshot,customer_snapshot,currency,subtotal_agorot,vat_agorot,total_agorot,document_snapshot,idempotency_effect_key,created_by)
    values('correction','draft',v_original.order_id,v_original.intent_id,v_original.payment_attempt_id,v_original.refund_id,v_doc,v_original.business_version_id,v_original.business_snapshot,v_original.customer_snapshot,v_original.currency,0,0,0,jsonb_build_object('reason',left(coalesce(p_payload->>'reason',''),1000),'original_document_id',v_doc),'effect:'||v_effect,p_actor) returning id into v_doc;
    return jsonb_build_object('ok',true,'action',p_action,'data',(select jsonb_build_object('id',id,'state',state,'correction_of_id',correction_of_id,'document_snapshot',document_snapshot) from public.fiscal_documents where id=v_doc),'revision',1);
  else raise exception 'Unsupported commerce action' using errcode='22023';
  end if;
end $$;
revoke all on function public.commerce_document_action(text,jsonb,uuid,text) from public,anon,authenticated;

-- Durable preview renderer interface: jobs consume only frozen rows and register immutable private artifacts.
create or replace function public.commerce_create_document_draft_for_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_role text; v_rev integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select recorded_by into v_actor from public.orders where id=p_order_id;
  if not found then raise exception 'Order not found' using errcode='22023'; end if;
  select role into v_role from public.user_roles where user_id=v_actor;
  if coalesce(v_role,'') not in ('admin','ceo') then v_role:='ceo'; end if;
  select coalesce(max(revision),0) into v_rev from public.document_business_versions;
  return public.commerce_document_action('document_draft',jsonb_build_object('order_id',p_order_id,'document_type','receipt','expected_business_revision',v_rev),v_actor,v_role);
end $$;
revoke all on function public.commerce_create_document_draft_for_order(uuid) from public,anon,authenticated;
grant execute on function public.commerce_create_document_draft_for_order(uuid) to service_role;

create or replace function public.commerce_document_job_snapshot(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.fiscal_documents%rowtype; v_items jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select * into d from public.fiscal_documents where id=p_document_id;
  if not found then raise exception 'Document not found' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('line_no',line_no,'item_snapshot',item_snapshot,'net_agorot',net_agorot,'vat_agorot',vat_agorot,'gross_agorot',gross_agorot) order by line_no),'[]'::jsonb) into v_items from public.fiscal_document_items where document_id=d.id;
  return jsonb_build_object('id',d.id,'document_type',d.document_type,'state',d.state,'order_id',d.order_id,'intent_id',d.intent_id,'business_snapshot',d.business_snapshot,'customer_snapshot',d.customer_snapshot,'currency',d.currency,'subtotal_agorot',d.subtotal_agorot,'vat_agorot',d.vat_agorot,'total_agorot',d.total_agorot,'document_snapshot',d.document_snapshot,'items',v_items,'issued_at',d.issued_at,'preview_only',d.state<>'issued');
end $$;
revoke all on function public.commerce_document_job_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.commerce_document_job_snapshot(uuid) to service_role;

create or replace function public.commerce_register_document_artifact(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.fiscal_documents%rowtype; a public.fiscal_document_artifacts%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select * into d from public.fiscal_documents where id=(p_payload->>'document_id')::uuid for update;
  if not found or d.state not in ('draft','numbered_draft') then raise exception 'Preview artifacts require a draft document' using errcode='PT409'; end if;
  if p_payload->>'artifact_kind'<>'preview_pdf' or p_payload->>'mime_type'<>'application/pdf' or (p_payload->>'byte_size')::bigint not between 1 and 20971520 or (p_payload->>'sha256') !~ '^[0-9a-f]{64}$' or (p_payload->>'storage_key') not like 'documents/'||d.id::text||'/%' then raise exception 'Invalid preview artifact' using errcode='22023'; end if;
  insert into public.fiscal_document_artifacts(document_id,artifact_kind,storage_key,mime_type,sha256,byte_size,created_by)
  values(d.id,'preview_pdf',p_payload->>'storage_key','application/pdf',p_payload->>'sha256',(p_payload->>'byte_size')::bigint,nullif(p_payload->>'actor_id','')::uuid)
  on conflict(storage_key) do nothing returning * into a;
  if a.id is null then select * into a from public.fiscal_document_artifacts where storage_key=p_payload->>'storage_key'; if a.document_id<>d.id or a.sha256<>p_payload->>'sha256' then raise exception 'Artifact key conflict' using errcode='PT409'; end if; end if;
  return jsonb_build_object('id',a.id,'document_id',a.document_id,'artifact_kind',a.artifact_kind,'storage_key',a.storage_key,'mime_type',a.mime_type,'sha256',a.sha256,'byte_size',a.byte_size,'signer_state',a.signer_state,'created_at',a.created_at);
end $$;
revoke all on function public.commerce_register_document_artifact(jsonb) from public,anon,authenticated;
grant execute on function public.commerce_register_document_artifact(jsonb) to service_role;
