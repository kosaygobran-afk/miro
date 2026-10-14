-- Operations domain: expenses, resumable POS drafts, cash shifts, recurring schedules and MASAV.
create table if not exists public.commerce_expenses (
  id uuid primary key default gen_random_uuid(),
  revision integer not null default 1 check(revision>0),
  state text not null default 'draft' check(state in ('draft','submitted','approved','rejected','partially_paid','paid','void','corrected')),
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_snapshot jsonb not null default '{}'::jsonb,
  source_document_reference text,
  document_date date,
  expense_date date not null,
  category text not null,
  description text,
  currency text not null default 'ILS' check(currency='ILS'),
  net_agorot bigint not null default 0 check(net_agorot>=0),
  vat_agorot bigint not null default 0 check(vat_agorot>=0),
  gross_agorot bigint not null default 0 check(gross_agorot=net_agorot+vat_agorot),
  deductibility text not null default 'pending' check(deductibility in ('pending','allowed','disallowed','partial')),
  duplicate_review boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists commerce_expenses_date_state_idx on public.commerce_expenses(expense_date desc,state);
create index if not exists commerce_expenses_duplicate_signal_idx on public.commerce_expenses(source_document_reference,expense_date,gross_agorot);

create table if not exists public.commerce_expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.commerce_expenses(id) on delete restrict,
  line_no integer not null check(line_no>0),
  description text not null,
  quantity numeric(12,3) not null default 1 check(quantity>0),
  net_agorot bigint not null check(net_agorot>=0),
  vat_agorot bigint not null check(vat_agorot>=0),
  gross_agorot bigint not null check(gross_agorot=net_agorot+vat_agorot),
  unique(expense_id,line_no)
);
create table if not exists public.commerce_expense_attachments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.commerce_expenses(id) on delete restrict,
  storage_key text not null unique,
  original_name text not null,
  detected_mime text not null,
  byte_size bigint not null check(byte_size between 1 and 10485760),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.commerce_expense_approvals (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.commerce_expenses(id) on delete restrict,
  decision text not null check(decision in ('approved','rejected','reversed')),
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.commerce_expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.commerce_expenses(id) on delete restrict,
  amount_agorot bigint not null check(amount_agorot>0),
  method text not null check(method in ('cash','bank_transfer','credit_card','check','other')),
  reference text,
  effect_key text not null unique,
  actor_id uuid references auth.users(id) on delete set null,
  paid_at timestamptz not null default now()
);

create table if not exists public.pos_parked_drafts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  name text not null check(length(btrim(name)) between 1 and 100),
  revision integer not null default 1 check(revision>0),
  customer_snapshot jsonb not null default '{}'::jsonb,
  items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=100),
  expires_at timestamptz not null default now()+interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pos_parked_drafts_actor_idx on public.pos_parked_drafts(actor_id,updated_at desc);

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  state text not null default 'open' check(state in ('open','closed','reconciled')),
  opening_float_agorot bigint not null check(opening_float_agorot>=0),
  expected_cash_agorot bigint,
  counted_cash_agorot bigint,
  variance_agorot bigint,
  note text,
  revision integer not null default 1 check(revision>0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists cash_sessions_one_open_per_actor on public.cash_sessions(actor_id) where state='open';
create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id) on delete restrict,
  kind text not null check(kind in ('sale_cash','cash_in','cash_out','refund_cash','correction')),
  signed_amount_agorot bigint not null check(signed_amount_agorot<>0),
  reason text not null,
  order_id uuid references public.orders(id) on delete set null,
  effect_key text not null unique,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id) on delete restrict,
  counted_cash_agorot bigint not null check(counted_cash_agorot>=0),
  expected_cash_agorot bigint not null,
  variance_agorot bigint not null,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  counted_at timestamptz not null default now()
);

create table if not exists public.recurring_agreements (
  id uuid primary key default gen_random_uuid(),
  revision integer not null default 1 check(revision>0),
  state text not null default 'draft' check(state in ('draft','active','paused','cancelled','exception')),
  customer_id uuid references auth.users(id) on delete set null,
  customer_snapshot jsonb not null default '{}'::jsonb,
  amount_agorot bigint not null check(amount_agorot between 1 and 100000000000),
  currency text not null default 'ILS' check(currency='ILS'),
  interval_unit text not null check(interval_unit in ('day','month')),
  interval_count integer not null check(interval_count between 1 and 36),
  next_charge_at timestamptz,
  consent_reference text not null,
  consented_at timestamptz not null,
  provider text,
  environment text check(environment is null or environment in ('sandbox','production')),
  merchant_ref text,
  provider_token_reference text,
  no_obligo_capability_ref text,
  capability_verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.recurring_runs (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.recurring_agreements(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  effect_key text not null unique,
  amount_agorot bigint not null check(amount_agorot>0),
  state text not null default 'queued' check(state in ('queued','pending','succeeded','failed','unknown','cancelled')),
  attempt_id uuid references public.payment_attempts(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(agreement_id,period_start)
);

create table if not exists public.masav_batches (
  id uuid primary key default gen_random_uuid(),
  state text not null default 'draft' check(state in ('draft','approved','submitted','acknowledged','settled','rejected','unknown','cancelled')),
  batch_reference text not null unique,
  control_count integer not null default 0 check(control_count>=0),
  control_total_agorot bigint not null default 0 check(control_total_agorot>=0),
  file_sha256 text,
  provider_reference text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.masav_entries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.masav_batches(id) on delete restrict,
  recurring_agreement_id uuid references public.recurring_agreements(id) on delete restrict,
  customer_snapshot jsonb not null,
  amount_agorot bigint not null check(amount_agorot>0),
  currency text not null default 'ILS' check(currency='ILS'),
  bank_instruction_reference text not null,
  state text not null default 'draft' check(state in ('draft','submitted','accepted','rejected','settled','returned','unknown')),
  response_code text,
  created_at timestamptz not null default now(),
  unique(batch_id,bank_instruction_reference)
);

-- Private evidence bucket; API validates bytes and authorizes signed downloads.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('commerce-private','commerce-private',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

-- RPC-only access for finance/operations evidence.
do $$ declare t text; begin
  foreach t in array array['commerce_expenses','commerce_expense_items','commerce_expense_attachments','commerce_expense_approvals','commerce_expense_payments','pos_parked_drafts','cash_sessions','cash_movements','cash_counts','recurring_agreements','recurring_runs','masav_batches','masav_entries'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

create or replace function public.commerce_document_action(p_action text,p_payload jsonb,p_actor uuid,p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception 'Document workflow is unavailable' using errcode='PT409'; end $$;
revoke all on function public.commerce_document_action(text,jsonb,uuid,text) from public,anon,authenticated;

create or replace function public.commerce_write(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_role text:=public.active_app_role(); v_id uuid; v_expected integer; v_rev integer;
  v_item jsonb; v_line integer; v_net bigint; v_vat bigint; v_gross bigint; v_n bigint:=0; v_v bigint:=0; v_g bigint:=0;
  v_row jsonb; v_state text; v_effect text; v_sum bigint; v_expected_cash bigint; v_draft public.pos_parked_drafts%rowtype; v_exp public.commerce_expenses%rowtype; v_session public.cash_sessions%rowtype;
begin
  if v_actor is null or coalesce(v_role,'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then raise exception 'Invalid payload' using errcode='22023'; end if;
  if p_action='settings_save' then
    if v_role is distinct from 'ceo' then raise exception 'CEO required' using errcode='42501'; end if;
    v_expected:=coalesce((p_payload->>'expected_revision')::integer,0);
    select coalesce((value->>'revision')::integer,0) into v_rev from public.business_settings where key='commerce.identity' for update;
    v_rev:=coalesce(v_rev,0);
    if v_rev<>v_expected then raise exception 'Revision conflict' using errcode='PT409'; end if;
    if jsonb_typeof(p_payload->'patch')<>'object' then raise exception 'Identity patch required' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(p_payload->'patch') k where k not in ('legal_name','trade_name','entity_kind','registration_number','vat_number','address','phone','email','logo_storage_key','document_language','prices_include_vat','document_policy_version')) then raise exception 'Unsupported identity field' using errcode='22023'; end if;
    if coalesce(length(p_payload->'patch'->>'legal_name'),0)>160 or coalesce(length(p_payload->'patch'->>'trade_name'),0)>160 then raise exception 'Business name too long' using errcode='22023'; end if;
    if p_payload->'patch' ? 'entity_kind' and p_payload->'patch'->>'entity_kind' not in ('exempt','registered','company') then raise exception 'Invalid entity kind' using errcode='22023'; end if;
    if p_payload->'patch' ? 'document_language' and p_payload->'patch'->>'document_language' not in ('he','en') then raise exception 'Invalid document language' using errcode='22023'; end if;
    if p_payload->'patch' ? 'address' and jsonb_typeof(p_payload->'patch'->'address')<>'object' then raise exception 'Invalid address' using errcode='22023'; end if;
    v_row:=coalesce((select value from public.business_settings where key='commerce.identity'),'{}'::jsonb);
    v_row:=jsonb_build_object('revision',v_rev+1,'identity',jsonb_build_object('legal_name',null,'trade_name',null,'entity_kind',null,'registration_number',null,'vat_number',null,'address',jsonb_build_object('street',null,'city',null,'postal_code',null,'country','IL'),'phone',null,'email',null,'logo_storage_key',null,'document_language','he','prices_include_vat',true,'document_policy_version',null)||coalesce(v_row->'identity','{}'::jsonb)||p_payload->'patch');
    insert into public.business_settings(key,value,updated_by) values('commerce.identity',v_row,v_actor)
    on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
    insert into public.audit_events(action,user_id,details,entity_type) values('commerce_identity_updated',v_actor,jsonb_build_object('revision',v_rev+1,'changed_fields',(select jsonb_agg(k) from jsonb_object_keys(p_payload->'patch') k)),'business_setting');
    return jsonb_build_object('ok',true,'action',p_action,'data',jsonb_build_object('revision',v_rev+1,'identity',v_row->'identity','readiness',jsonb_build_object('official_issuance_enabled',false,'blockers',jsonb_build_array('owner_identity_approval','accountant_document_policy','signing_and_allocation_readiness'))),'revision',v_rev+1);
  elsif p_action='expense_save' then
    v_id:=nullif(p_payload->>'id','')::uuid; v_expected:=coalesce((p_payload->>'expected_revision')::integer,0);
    if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then raise exception 'Expense items required' using errcode='22023'; end if;
    if p_payload->'document'->>'currency' is distinct from 'ILS' then raise exception 'Only ILS expenses are supported' using errcode='22023'; end if;
    if p_payload->'document'->>'deductibility' not in ('pending','allowed','disallowed','partial') then raise exception 'Invalid deductibility' using errcode='22023'; end if;
    v_n:=0;v_v:=0;v_g:=0;v_line:=0;
    for v_item in select value from jsonb_array_elements(p_payload->'items') loop
      v_line:=v_line+1;v_net:=(v_item->>'net_agorot')::bigint;v_vat:=(v_item->>'vat_agorot')::bigint;v_gross:=(v_item->>'gross_agorot')::bigint;
      if v_net<0 or v_vat<0 or v_gross<>v_net+v_vat or nullif(btrim(v_item->>'description'),'') is null then raise exception 'Invalid expense line totals' using errcode='22023'; end if;
      v_n:=v_n+v_net;v_v:=v_v+v_vat;v_g:=v_g+v_gross;
    end loop;
    if v_id is null then
      insert into public.commerce_expenses(supplier_id,supplier_snapshot,source_document_reference,document_date,expense_date,category,description,currency,net_agorot,vat_agorot,gross_agorot,deductibility,notes,created_by,updated_by)
      values(nullif(p_payload->'supplier'->>'id','')::uuid,coalesce(p_payload->'supplier','{}'::jsonb),nullif(p_payload->'document'->>'reference',''),nullif(p_payload->'document'->>'document_date','')::date,(p_payload->'document'->>'expense_date')::date,p_payload->'document'->>'category',p_payload->'document'->>'description','ILS',v_n,v_v,v_g,p_payload->'document'->>'deductibility',p_payload->'document'->>'notes',v_actor,v_actor) returning id into v_id;
    else
      select * into v_exp from public.commerce_expenses where id=v_id for update;
      if not found or v_exp.state<>'draft' then raise exception 'Only draft expense can be edited' using errcode='PT409'; end if;
      if v_exp.revision<>v_expected then raise exception 'Revision conflict' using errcode='PT409'; end if;
      update public.commerce_expenses set supplier_id=nullif(p_payload->'supplier'->>'id','')::uuid,supplier_snapshot=coalesce(p_payload->'supplier','{}'::jsonb),source_document_reference=nullif(p_payload->'document'->>'reference',''),document_date=nullif(p_payload->'document'->>'document_date','')::date,expense_date=(p_payload->'document'->>'expense_date')::date,category=p_payload->'document'->>'category',description=p_payload->'document'->>'description',net_agorot=v_n,vat_agorot=v_v,gross_agorot=v_g,deductibility=p_payload->'document'->>'deductibility',notes=p_payload->'document'->>'notes',revision=revision+1,updated_by=v_actor,updated_at=now() where id=v_id;
      delete from public.commerce_expense_items where expense_id=v_id;
    end if;
    v_line:=0;
    for v_item in select value from jsonb_array_elements(p_payload->'items') loop
      v_line:=v_line+1; insert into public.commerce_expense_items(expense_id,line_no,description,quantity,net_agorot,vat_agorot,gross_agorot) values(v_id,v_line,v_item->>'description',coalesce((v_item->>'quantity')::numeric,1),(v_item->>'net_agorot')::bigint,(v_item->>'vat_agorot')::bigint,(v_item->>'gross_agorot')::bigint);
    end loop;
    -- Attachments must already be uploaded to the private bucket; filenames/content are byte-validated by the API.
    if jsonb_typeof(p_payload->'attachments')='array' then
      for v_item in select value from jsonb_array_elements(p_payload->'attachments') loop
        if (v_item->>'storage_key') not like v_actor::text||'/%' then raise exception 'Attachment path must be actor-scoped' using errcode='42501'; end if;
        insert into public.commerce_expense_attachments(expense_id,storage_key,original_name,detected_mime,byte_size,sha256,uploaded_by)
        values(v_id,v_item->>'storage_key',left(v_item->>'original_name',255),v_item->>'detected_mime',(v_item->>'byte_size')::bigint,v_item->>'sha256',v_actor)
        on conflict(storage_key) do nothing;
      end loop;
    end if;
    update public.commerce_expenses set duplicate_review=exists(select 1 from public.commerce_expenses e where e.id<>v_id and e.source_document_reference=(select source_document_reference from public.commerce_expenses where id=v_id) and e.expense_date=(select expense_date from public.commerce_expenses where id=v_id) and e.gross_agorot=v_g and nullif(e.source_document_reference,'') is not null) where id=v_id;
    return jsonb_build_object('ok',true,'action',p_action,'data',(select to_jsonb(e) from public.commerce_expenses e where e.id=v_id),'revision',(select revision from public.commerce_expenses where id=v_id));
  elsif p_action in ('expense_submit','expense_approve','expense_pay','expense_void') then
    v_id:=(p_payload->>'expense_id')::uuid;
    select * into v_exp from public.commerce_expenses where id=v_id for update;
    if not found then raise exception 'Expense not found' using errcode='22023'; end if;
    if p_action='expense_submit' then
      if v_exp.state<>'draft' or v_exp.gross_agorot<=0 then raise exception 'Expense not ready to submit' using errcode='PT409'; end if;
      update public.commerce_expenses set state='submitted',revision=revision+1,updated_by=v_actor,updated_at=now() where id=v_id;
    elsif p_action='expense_approve' then
      if v_role is distinct from 'ceo' then raise exception 'CEO approval required' using errcode='42501'; end if;
      if v_exp.revision<>(p_payload->>'expected_revision')::integer or v_exp.state<>'submitted' then raise exception 'Expense revision/state conflict' using errcode='PT409'; end if;
      v_state:=p_payload->>'decision'; if v_state not in ('approved','rejected') then raise exception 'Invalid decision' using errcode='22023'; end if;
      update public.commerce_expenses set state=v_state,revision=revision+1,updated_by=v_actor,updated_at=now() where id=v_id;
      insert into public.commerce_expense_approvals(expense_id,decision,note,actor_id) values(v_id,v_state,p_payload->>'note',v_actor);
    elsif p_action='expense_pay' then
      if v_exp.state not in ('approved','partially_paid') then raise exception 'Expense must be approved' using errcode='PT409'; end if;
      v_g:=(p_payload->>'amount_agorot')::bigint; v_effect:=p_payload->>'effect_key';
      if v_g<=0 or v_effect is null then raise exception 'Invalid payment' using errcode='22023'; end if;
      if v_g+coalesce((select sum(amount_agorot) from public.commerce_expense_payments where expense_id=v_id),0)>v_exp.gross_agorot then raise exception 'Overpayment' using errcode='PT409'; end if;
      insert into public.commerce_expense_payments(expense_id,amount_agorot,method,reference,effect_key,actor_id) values(v_id,v_g,p_payload->>'method',p_payload->>'reference',v_effect,v_actor);
      v_state:=case when coalesce((select sum(amount_agorot) from public.commerce_expense_payments where expense_id=v_id),0)=v_exp.gross_agorot then 'paid' else 'partially_paid' end;
      update public.commerce_expenses set state=v_state,revision=revision+1,updated_by=v_actor,updated_at=now() where id=v_id;
    else
      if v_exp.state in ('paid','void','corrected') then raise exception 'Posted expense requires reversal workflow' using errcode='PT409'; end if;
      update public.commerce_expenses set state='void',revision=revision+1,updated_by=v_actor,updated_at=now() where id=v_id;
    end if;
    insert into public.audit_events(action,user_id,details,entity_type,entity_id) values('commerce_'||p_action,v_actor,jsonb_build_object('expense_id',v_id,'state',(select state from public.commerce_expenses where id=v_id)),'expense',v_id);
    return jsonb_build_object('ok',true,'action',p_action,'data',(select to_jsonb(e) from public.commerce_expenses e where e.id=v_id),'revision',(select revision from public.commerce_expenses where id=v_id));
  elsif p_action='draft_save' then
    v_id:=nullif(p_payload->>'id','')::uuid; v_expected:=coalesce((p_payload->>'expected_revision')::integer,0);
    if nullif(btrim(p_payload->>'name'),'') is null or jsonb_typeof(p_payload->'items')<>'array' then raise exception 'Draft name and items required' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_payload->'items') as x(value) where jsonb_typeof(value)<>'object' or coalesce((value->>'quantity')::integer,0)<1 or (value->>'unit_price_agorot') is not null) then raise exception 'Invalid draft items; client prices are forbidden' using errcode='22023'; end if;
    if v_id is null then insert into public.pos_parked_drafts(actor_id,name,customer_snapshot,items) values(v_actor,left(btrim(p_payload->>'name'),100),coalesce(p_payload->'customer_snapshot','{}'::jsonb),p_payload->'items') returning id into v_id;
    else select * into v_draft from public.pos_parked_drafts where id=v_id and actor_id=v_actor for update; if not found or v_draft.revision<>v_expected then raise exception 'Draft revision conflict' using errcode='PT409'; end if; update public.pos_parked_drafts set name=left(btrim(p_payload->>'name'),100),customer_snapshot=coalesce(p_payload->'customer_snapshot','{}'::jsonb),items=p_payload->'items',revision=revision+1,updated_at=now() where id=v_id; end if;
    return jsonb_build_object('ok',true,'action',p_action,'data',(select to_jsonb(d) from public.pos_parked_drafts d where d.id=v_id),'revision',(select revision from public.pos_parked_drafts where id=v_id));
  elsif p_action='draft_delete' then
    v_id:=(p_payload->>'id')::uuid; delete from public.pos_parked_drafts where id=v_id and actor_id=v_actor and revision=(p_payload->>'expected_revision')::integer;
    if not found then raise exception 'Draft not found or revision conflict' using errcode='PT409'; end if;
    return jsonb_build_object('ok',true,'action',p_action,'data',jsonb_build_object('id',v_id,'deleted',true));
  elsif p_action='cash_open' then
    insert into public.cash_sessions(actor_id,opening_float_agorot,note) values(v_actor,(p_payload->>'opening_float_agorot')::bigint,p_payload->>'note') returning id into v_id;
    return jsonb_build_object('ok',true,'action',p_action,'data',(select to_jsonb(s) from public.cash_sessions s where s.id=v_id),'revision',1);
  elsif p_action='cash_movement' then
    v_id:=(p_payload->>'session_id')::uuid; select * into v_session from public.cash_sessions where id=v_id for update;
    if not found or v_session.actor_id<>v_actor or v_session.state<>'open' then raise exception 'Open owned cash session required' using errcode='42501'; end if;
    v_state:=p_payload->>'kind';
    if nullif(p_payload->>'reason','') is null then raise exception 'Reason required' using errcode='22023'; end if;
    if v_state in ('cash_in','cash_out') then
      v_g:=(p_payload->>'amount_agorot')::bigint;
      if v_g<=0 then raise exception 'Positive amount required' using errcode='22023'; end if;
      v_g:=case when v_state='cash_in' then v_g else -v_g end;
    elsif v_state='correction' then
      v_g:=(p_payload->>'signed_amount_agorot')::bigint;
      if v_g=0 then raise exception 'Non-zero signed correction required' using errcode='22023'; end if;
    else raise exception 'Cash kind is internal-only' using errcode='42501'; end if;
    v_effect:=coalesce(nullif(p_payload->>'effect_key',''),gen_random_uuid()::text);
    insert into public.cash_movements(session_id,kind,signed_amount_agorot,reason,order_id,effect_key,actor_id) values(v_id,v_state,v_g,left(p_payload->>'reason',240),nullif(p_payload->>'order_id','')::uuid,v_effect,v_actor) on conflict(effect_key) do nothing;
    update public.cash_sessions set revision=revision+1 where id=v_id;
    return jsonb_build_object('ok',true,'action',p_action,'data',(select to_jsonb(s) from public.cash_sessions s where s.id=v_id),'revision',(select revision from public.cash_sessions where id=v_id));
  elsif p_action='cash_close' then
    v_id:=(p_payload->>'session_id')::uuid; select * into v_session from public.cash_sessions where id=v_id for update;
    if not found or v_session.actor_id<>v_actor or v_session.state<>'open' or v_session.revision<>(p_payload->>'expected_revision')::integer then raise exception 'Cash session revision/state conflict' using errcode='PT409'; end if;
    select v_session.opening_float_agorot+coalesce(sum(signed_amount_agorot),0) into v_expected_cash from public.cash_movements where session_id=v_id;
    v_g:=(p_payload->>'counted_cash_agorot')::bigint;
    insert into public.cash_counts(session_id,counted_cash_agorot,expected_cash_agorot,variance_agorot,note,actor_id) values(v_id,v_g,v_expected_cash,v_g-v_expected_cash,p_payload->>'note',v_actor);
    update public.cash_sessions set state='closed',expected_cash_agorot=v_expected_cash,counted_cash_agorot=v_g,variance_agorot=v_g-v_expected_cash,closed_at=now(),closed_by=v_actor,revision=revision+1 where id=v_id;
    insert into public.audit_events(action,user_id,details,entity_type,entity_id) values('cash_session_closed',v_actor,jsonb_build_object('expected_agorot',v_expected_cash,'counted_agorot',v_g,'variance_agorot',v_g-v_expected_cash),'cash_session',v_id);
    return jsonb_build_object('ok',true,'action',p_action,'data',(select to_jsonb(s) from public.cash_sessions s where s.id=v_id),'revision',(select revision from public.cash_sessions where id=v_id));
  elsif p_action='recurring_save' then
    if v_role is distinct from 'ceo' then raise exception 'CEO required' using errcode='42501'; end if;
    v_id:=nullif(p_payload->>'id','')::uuid; v_expected:=coalesce((p_payload->>'expected_revision')::integer,0);
    if coalesce((p_payload->>'amount_agorot')::bigint,0)<=0 or nullif(p_payload->>'consent_reference','') is null or nullif(p_payload->>'consented_at','') is null then raise exception 'Recurring consent and amount required' using errcode='22023'; end if;
    if nullif(p_payload->>'provider_token_reference','') is not null and auth.role()<>'service_role' then raise exception 'Token reference is server-owned' using errcode='42501'; end if;
    if v_id is null then insert into public.recurring_agreements(customer_id,customer_snapshot,amount_agorot,interval_unit,interval_count,next_charge_at,consent_reference,consented_at,provider,environment,merchant_ref,provider_token_reference,no_obligo_capability_ref,created_by) values(nullif(p_payload->>'customer_id','')::uuid,coalesce(p_payload->'customer_snapshot','{}'::jsonb),(p_payload->>'amount_agorot')::bigint,p_payload->>'interval_unit',(p_payload->>'interval_count')::integer,nullif(p_payload->>'next_charge_at','')::timestamptz,p_payload->>'consent_reference',(p_payload->>'consented_at')::timestamptz,p_payload->>'provider',p_payload->>'environment',p_payload->>'merchant_ref',p_payload->>'provider_token_reference',p_payload->>'no_obligo_capability_ref',v_actor) returning id into v_id;
    else if not exists(select 1 from public.recurring_agreements where id=v_id and revision=v_expected and state in ('draft','paused')) then raise exception 'Recurring revision/state conflict' using errcode='PT409'; end if;
      update public.recurring_agreements set customer_id=nullif(p_payload->>'customer_id','')::uuid,customer_snapshot=coalesce(p_payload->'customer_snapshot','{}'::jsonb),amount_agorot=(p_payload->>'amount_agorot')::bigint,interval_unit=p_payload->>'interval_unit',interval_count=(p_payload->>'interval_count')::integer,next_charge_at=nullif(p_payload->>'next_charge_at','')::timestamptz,consent_reference=p_payload->>'consent_reference',consented_at=(p_payload->>'consented_at')::timestamptz,revision=revision+1,updated_at=now() where id=v_id;
    end if;
    return jsonb_build_object('ok',true,'action',p_action,'data',(select jsonb_build_object('id',id,'revision',revision,'state',state,'amount_agorot',amount_agorot,'currency',currency,'interval_unit',interval_unit,'interval_count',interval_count,'next_charge_at',next_charge_at,'provider',provider,'environment',environment,'consent_reference',consent_reference) from public.recurring_agreements where id=v_id),'revision',(select revision from public.recurring_agreements where id=v_id));
  elsif p_action in ('recurring_pause','recurring_resume','recurring_cancel') then
    if v_role is distinct from 'ceo' then raise exception 'CEO required' using errcode='42501'; end if;
    v_id:=(p_payload->>'id')::uuid; v_expected:=(p_payload->>'expected_revision')::integer;
    if not exists(select 1 from public.recurring_agreements where id=v_id and revision=v_expected for update) then raise exception 'Recurring revision conflict' using errcode='PT409'; end if;
    if p_action='recurring_resume' then raise exception 'Recurring provider capability is not verified; activation disabled' using errcode='PT409'; end if;
    v_state:=case p_action when 'recurring_pause' then 'paused' else 'cancelled' end;
    update public.recurring_agreements set state=v_state,revision=revision+1,updated_at=now() where id=v_id;
    return jsonb_build_object('ok',true,'action',p_action,'data',(select jsonb_build_object('id',id,'state',state,'revision',revision) from public.recurring_agreements where id=v_id),'revision',(select revision from public.recurring_agreements where id=v_id));
  elsif p_action='masav_batch_save' then
    if v_role is distinct from 'ceo' then raise exception 'CEO required' using errcode='42501'; end if;
    if jsonb_typeof(p_payload->'entries')<>'array' or jsonb_array_length(p_payload->'entries')=0 or jsonb_array_length(p_payload->'entries')>1000 then raise exception 'MASAV entries required' using errcode='22023'; end if;
    v_id:=gen_random_uuid(); insert into public.masav_batches(id,batch_reference,created_by) values(v_id,coalesce(nullif(p_payload->>'batch_reference',''),'MASAV-'||replace(v_id::text,'-','')),v_actor);
    for v_item in select value from jsonb_array_elements(p_payload->'entries') loop
      v_g:=(v_item->>'amount_agorot')::bigint; if v_g<=0 then raise exception 'Invalid MASAV amount' using errcode='22023'; end if;
      insert into public.masav_entries(batch_id,recurring_agreement_id,customer_snapshot,amount_agorot,bank_instruction_reference) values(v_id,nullif(v_item->>'recurring_agreement_id','')::uuid,coalesce(v_item->'customer_snapshot','{}'::jsonb),v_g,coalesce(nullif(v_item->>'reference',''),gen_random_uuid()::text));
      v_n:=v_n+v_g;
    end loop;
    update public.masav_batches set control_count=jsonb_array_length(p_payload->'entries'),control_total_agorot=v_n where id=v_id;
    return jsonb_build_object('ok',true,'action',p_action,'data',(select to_jsonb(b) from public.masav_batches b where b.id=v_id));
  else return public.commerce_document_action(p_action,p_payload,v_actor,v_role);
  end if;
end $$;
revoke all on function public.commerce_write(text,jsonb) from public,anon;
grant execute on function public.commerce_write(text,jsonb) to authenticated;

create or replace function public.commerce_read(p_section text,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text:=public.active_app_role(); v_rows jsonb:='[]'::jsonb; v_count bigint:=0; v_offset integer:=greatest(0,coalesce((p_filters->>'offset')::integer,0)); v_limit integer:=least(200,greatest(1,coalesce((p_filters->>'limit')::integer,50))); v_summary jsonb:='{}'::jsonb; v_from date; v_to date;
begin
  if coalesce(v_role,'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_section='settings' then
    v_summary:=(select jsonb_build_object('revision',coalesce((value->>'revision')::int,0),'identity',jsonb_build_object('legal_name',null,'trade_name',null,'entity_kind',null,'registration_number',null,'vat_number',null,'address',jsonb_build_object('street',null,'city',null,'postal_code',null,'country','IL'),'phone',null,'email',null,'logo_storage_key',null,'document_language','he','prices_include_vat',true,'document_policy_version',null)||coalesce(value->'identity','{}'::jsonb)) from public.business_settings where key='commerce.identity');
    v_summary:=coalesce(v_summary,jsonb_build_object('revision',0,'identity',jsonb_build_object('legal_name',null,'trade_name',null,'entity_kind',null,'registration_number',null,'vat_number',null,'address',jsonb_build_object('street',null,'city',null,'postal_code',null,'country','IL'),'phone',null,'email',null,'logo_storage_key',null,'document_language','he','prices_include_vat',true,'document_policy_version',null)));
    v_rows:=jsonb_build_array(v_summary||jsonb_build_object('readiness',jsonb_build_object('official_issuance_enabled',false,'blockers',jsonb_build_array('business_identity_unapproved','accountant_document_policy','signing_or_allocation_not_configured'))));v_count:=1;
  elsif p_section='integrations' then
    v_rows:=jsonb_build_array(jsonb_build_object('provider','payplus','status','not_configured','mode','sandbox','capabilities',jsonb_build_object('card',false,'bit',false,'refunds',false,'recurring',false,'no_obligo',false),'official_issuance_enabled',false));v_count:=1;
  elsif p_section='expenses' then
    v_from:=nullif(p_filters->>'from','')::date; v_to:=nullif(p_filters->>'to','')::date;
    v_rows:=(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('attachments',coalesce(att.rows,'[]'::jsonb),'items',coalesce(items.rows,'[]'::jsonb),'paid_agorot',coalesce(pay.paid_agorot,0))),'[]'::jsonb) from (select * from public.commerce_expenses where (nullif(p_filters->>'id','') is null or id=(p_filters->>'id')::uuid) and (nullif(p_filters->>'status','') is null or state=p_filters->>'status') and (v_from is null or expense_date>=v_from) and (v_to is null or expense_date<=v_to) and (nullif(p_filters->>'supplier','') is null or supplier_snapshot->>'name' ilike ('%'||(p_filters->>'supplier')||'%')) and (nullif(p_filters->>'category','') is null or category=p_filters->>'category') and (nullif(p_filters->>'search','') is null or coalesce(description,'') ilike ('%'||(p_filters->>'search')||'%') or coalesce(source_document_reference,'') ilike ('%'||(p_filters->>'search')||'%') or coalesce(supplier_snapshot->>'name','') ilike ('%'||(p_filters->>'search')||'%')) order by expense_date desc,created_at desc offset v_offset limit v_limit) e left join lateral (select jsonb_agg(jsonb_build_object('id',a.id,'storage_key',a.storage_key,'original_name',a.original_name,'detected_mime',a.detected_mime,'byte_size',a.byte_size,'sha256',a.sha256,'created_at',a.created_at)) as rows from public.commerce_expense_attachments a where a.expense_id=e.id) att on true left join lateral (select jsonb_agg(to_jsonb(i) order by i.line_no) as rows from public.commerce_expense_items i where i.expense_id=e.id) items on true left join lateral (select coalesce(sum(p.amount_agorot),0) as paid_agorot from public.commerce_expense_payments p where p.expense_id=e.id) pay on true);
    v_count:=(select count(*) from public.commerce_expenses where (nullif(p_filters->>'id','') is null or id=(p_filters->>'id')::uuid) and (nullif(p_filters->>'status','') is null or state=p_filters->>'status') and (v_from is null or expense_date>=v_from) and (v_to is null or expense_date<=v_to) and (nullif(p_filters->>'supplier','') is null or supplier_snapshot->>'name' ilike ('%'||(p_filters->>'supplier')||'%')) and (nullif(p_filters->>'category','') is null or category=p_filters->>'category') and (nullif(p_filters->>'search','') is null or coalesce(description,'') ilike ('%'||(p_filters->>'search')||'%') or coalesce(source_document_reference,'') ilike ('%'||(p_filters->>'search')||'%') or coalesce(supplier_snapshot->>'name','') ilike ('%'||(p_filters->>'search')||'%')));
    v_summary:=(select jsonb_build_object('gross_agorot',coalesce(sum(gross_agorot),0),'net_agorot',coalesce(sum(net_agorot),0),'vat_agorot',coalesce(sum(vat_agorot),0),'scope','recorded expenses; tax deductibility requires review') from public.commerce_expenses where state not in ('void','corrected'));
  elsif p_section='documents' then
    v_rows:=(select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('items',coalesce(it.rows,'[]'::jsonb),'artifacts',coalesce(ar.rows,'[]'::jsonb))),'[]'::jsonb) from (select * from public.fiscal_documents where (nullif(p_filters->>'id','') is null or id=(p_filters->>'id')::uuid) order by created_at desc offset v_offset limit v_limit) d left join lateral (select jsonb_agg(jsonb_build_object('line_no',i.line_no,'item_snapshot',i.item_snapshot,'net_agorot',i.net_agorot,'vat_agorot',i.vat_agorot,'gross_agorot',i.gross_agorot) order by i.line_no) rows from public.fiscal_document_items i where i.document_id=d.id) it on true left join lateral (select jsonb_agg(jsonb_build_object('id',a.id,'artifact_kind',a.artifact_kind,'storage_key',a.storage_key,'mime_type',a.mime_type,'sha256',a.sha256,'byte_size',a.byte_size,'signer_state',a.signer_state) order by a.created_at) rows from public.fiscal_document_artifacts a where a.document_id=d.id) ar on true);
    v_count:=(select count(*) from public.fiscal_documents where (nullif(p_filters->>'id','') is null or id=(p_filters->>'id')::uuid));
    v_summary:=jsonb_build_object('revision',(select coalesce(max(revision),0) from public.document_business_versions),'business_revision',(select coalesce(max(revision),0) from public.document_business_versions));
  elsif p_section='drafts' then
    v_rows:=(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from (select * from public.pos_parked_drafts where actor_id=auth.uid() and expires_at>now() order by updated_at desc offset v_offset limit v_limit) d);
    v_count:=(select count(*) from public.pos_parked_drafts where actor_id=auth.uid() and expires_at>now());
  elsif p_section='cash' then
    v_rows:=(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('movements',coalesce(mv.rows,'[]'::jsonb))),'[]'::jsonb) from (select * from public.cash_sessions order by opened_at desc offset v_offset limit v_limit) s left join lateral (select jsonb_agg(to_jsonb(m) order by m.created_at) as rows from public.cash_movements m where m.session_id=s.id) mv on true);
    v_count:=(select count(*) from public.cash_sessions);
  elsif p_section='recurring' then
    v_rows:=(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'revision',r.revision,'state',r.state,'customer_snapshot',r.customer_snapshot,'amount_agorot',r.amount_agorot,'currency',r.currency,'interval_unit',r.interval_unit,'interval_count',r.interval_count,'next_charge_at',r.next_charge_at,'provider',r.provider,'environment',r.environment,'consent_reference',r.consent_reference)),'[]'::jsonb) from (select * from public.recurring_agreements order by created_at desc offset v_offset limit v_limit) r);
    v_count:=(select count(*) from public.recurring_agreements);
  elsif p_section='intents' then
    v_rows:=(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,channel,status,revision,customer_snapshot,total_agorot,currency,expires_at,finalized_order_id,created_at from public.commerce_intents order by created_at desc offset v_offset limit v_limit) x);
    v_count:=(select count(*) from public.commerce_intents);
  elsif p_section='payments' then
    v_rows:=(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,intent_id,method,collection_kind,provider,environment,request_uid,transaction_uid,amount_agorot,currency,state,created_at,updated_at from public.payment_attempts order by created_at desc offset v_offset limit v_limit) x);
    v_count:=(select count(*) from public.payment_attempts);
  elsif p_section='report' then
    v_from:=coalesce(nullif(p_filters->>'from','')::date,current_date-30);v_to:=coalesce(nullif(p_filters->>'to','')::date,current_date);
    v_summary:=(select jsonb_build_object('from',v_from,'to',v_to,'timezone','Asia/Jerusalem','orders_total_agorot',coalesce((select sum(round(o.total*100)::bigint) from public.orders o where timezone('Asia/Jerusalem',o.created_at)::date between v_from and v_to and o.status not in ('cancelled','refunded')),0),'expenses_gross_agorot',coalesce((select sum(e.gross_agorot) from public.commerce_expenses e where e.expense_date between v_from and v_to and e.state not in ('void','corrected')),0),'scope','order-backed sales and recorded expenses; excludes settlement reconciliation, tax filing and other accounting adjustments'));
    v_rows:=jsonb_build_array(v_summary);v_count:=1;
  else raise exception 'Unsupported commerce section' using errcode='22023'; end if;
  return jsonb_build_object('section',p_section,'rows',v_rows,'total_count',v_count,'summary',v_summary,'revision',coalesce((v_summary->>'revision')::int,0),'readiness',case when p_section='settings' then jsonb_build_object('official_issuance_enabled',false,'blockers',jsonb_build_array('identity_and_accountant_approval','signing_and_allocation_not_configured')) when p_section='integrations' then jsonb_build_object('configured',false,'live_enabled',false) else null end);
end $$;
revoke all on function public.commerce_read(text,jsonb) from public,anon;
grant execute on function public.commerce_read(text,jsonb) to authenticated;

-- Reusable remote-payment links for POS. Tokens are one-time capabilities stored only as digests.
create table if not exists public.commerce_payment_links (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.commerce_intents(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  effect_key text not null unique,
  token_digest text not null,
  capability_digest text,
  amount_agorot bigint not null check(amount_agorot>0),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists commerce_payment_links_intent_idx on public.commerce_payment_links(intent_id,expires_at);
alter table public.commerce_payment_links enable row level security;
revoke all on public.commerce_payment_links from public,anon,authenticated;
grant all on public.commerce_payment_links to service_role;

create or replace function public.commerce_create_payment_link(p_intent_id uuid,p_actor_id uuid,p_effect_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.commerce_intents%rowtype; r public.commerce_payment_links%rowtype; v_role text; v_token text; v_amount bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select ur.role into v_role from public.user_roles ur join public.profiles p on p.id=ur.user_id where ur.user_id=p_actor_id and p.account_status='active';
  if coalesce(v_role,'') not in ('admin','ceo') then raise exception 'Active POS manager required' using errcode='42501'; end if;
  select * into i from public.commerce_intents where id=p_intent_id for update;
  if not found or i.channel<>'pos' or i.actor_id is distinct from p_actor_id or i.status not in ('reserved','awaiting_payment','partially_paid') or i.expires_at<=now() then raise exception 'POS intent unavailable' using errcode='PT409'; end if;
  if length(coalesce(p_effect_key,'')) not between 8 and 255 then raise exception 'Effect key required' using errcode='22023'; end if;
  select * into r from public.commerce_payment_links where effect_key=p_effect_key for update;
  if found then
    if r.intent_id<>i.id or r.created_by<>p_actor_id then raise exception 'Payment link idempotency binding conflict' using errcode='PT409'; end if;
    return jsonb_build_object('id',r.id,'intent_id',r.intent_id,'amount_agorot',r.amount_agorot,'currency','ILS','expires_at',r.expires_at,'token',null,'url_fragment_token',null,'replayed',true,'recovery_required',true);
  end if;
  if exists(select 1 from public.payment_attempts a where a.intent_id=i.id and a.collection_kind='provider_collected' and a.state in ('created','pending','authorized','unknown','exception')) then raise exception 'Existing payment attempt must be reconciled before another link' using errcode='PT409'; end if;
  select i.total_agorot-coalesce(sum(a.amount_agorot) filter(where a.state not in ('declined','voided','refunded')),0) into v_amount from public.payment_attempts a where a.intent_id=i.id;
  if v_amount<=0 then raise exception 'Intent is already fully allocated' using errcode='PT409'; end if;
  v_token:=public.commerce_random_token();
  update public.commerce_payment_links set expires_at=now() where intent_id=i.id and completed_at is null and claimed_at is null;
  insert into public.commerce_payment_links(intent_id,created_by,effect_key,token_digest,amount_agorot,expires_at)
  values(i.id,p_actor_id,p_effect_key,encode(public.commerce_digest(v_token,'sha256'),'hex'),v_amount,least(i.expires_at,now()+interval '30 minutes'))
  returning * into r;
  return jsonb_build_object('id',r.id,'intent_id',r.intent_id,'amount_agorot',r.amount_agorot,'currency','ILS','expires_at',r.expires_at,'token',v_token,'url_fragment_token',v_token,'replayed',false);
end $$;
revoke all on function public.commerce_create_payment_link(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_create_payment_link(uuid,uuid,text) to service_role;

create or replace function public.commerce_claim_payment_link(p_intent_id uuid,p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.commerce_payment_links%rowtype; i public.commerce_intents%rowtype; v_cap text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select * into l from public.commerce_payment_links where intent_id=p_intent_id and token_digest=encode(public.commerce_digest(coalesce(p_token,''),'sha256'),'hex') and claimed_at is null and expires_at>now() for update;
  if not found then raise exception 'Payment link expired or already claimed' using errcode='42501'; end if;
  select * into i from public.commerce_intents where id=p_intent_id for update;
  if i.status not in ('reserved','awaiting_payment','partially_paid') or i.expires_at<=now() then raise exception 'Intent unavailable' using errcode='PT409'; end if;
  v_cap:=public.commerce_random_token();
  update public.commerce_payment_links set claimed_at=now(),capability_digest=encode(public.commerce_digest(v_cap,'sha256'),'hex') where id=l.id;
  update public.commerce_intents set guest_capability_digest=encode(public.commerce_digest(v_cap,'sha256'),'hex'),updated_at=now() where id=i.id;
  return jsonb_build_object('link_id',l.id,'intent_id',i.id,'amount_agorot',l.amount_agorot,'currency','ILS','guest_capability',v_cap,'expires_at',l.expires_at);
end $$;
revoke all on function public.commerce_claim_payment_link(uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_claim_payment_link(uuid,text) to service_role;

create or replace function public.commerce_expense_attachment_add(p_expense_id uuid,p_actor_id uuid,p_metadata jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.commerce_expenses%rowtype; r public.commerce_expense_attachments%rowtype; v_role text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select role into v_role from public.user_roles ur join public.profiles p on p.id=ur.user_id where ur.user_id=p_actor_id and p.account_status='active';
  if coalesce(v_role,'') not in ('admin','ceo') then raise exception 'Active management actor required' using errcode='42501'; end if;
  select * into e from public.commerce_expenses where id=p_expense_id for update;
  if not found or e.state in ('paid','void','corrected') then raise exception 'Expense unavailable for attachment' using errcode='PT409'; end if;
  if (p_metadata->>'storage_key') not like p_actor_id::text||'/%' or (p_metadata->>'byte_size')::bigint not between 1 and 5242880 or p_metadata->>'detected_mime' not in ('application/pdf','image/jpeg','image/png','image/webp') or (p_metadata->>'sha256') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid private attachment metadata' using errcode='22023'; end if;
  insert into public.commerce_expense_attachments(expense_id,storage_key,original_name,detected_mime,byte_size,sha256,uploaded_by)
  values(p_expense_id,p_metadata->>'storage_key',left(p_metadata->>'original_name',255),p_metadata->>'detected_mime',(p_metadata->>'byte_size')::bigint,p_metadata->>'sha256',p_actor_id) returning * into r;
  return jsonb_build_object('id',r.id,'expense_id',r.expense_id,'storage_key',r.storage_key,'original_name',r.original_name,'detected_mime',r.detected_mime,'byte_size',r.byte_size,'sha256',r.sha256,'created_at',r.created_at);
end $$;
revoke all on function public.commerce_expense_attachment_add(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_expense_attachment_add(uuid,uuid,jsonb) to service_role;

create or replace function public.commerce_expense_attachment_remove(p_attachment_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.commerce_expense_attachments%rowtype; e public.commerce_expenses%rowtype; v_role text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service caller required' using errcode='42501'; end if;
  select role into v_role from public.user_roles ur join public.profiles p on p.id=ur.user_id where ur.user_id=p_actor_id and p.account_status='active';
  if coalesce(v_role,'') not in ('admin','ceo') then raise exception 'Active management actor required' using errcode='42501'; end if;
  select * into a from public.commerce_expense_attachments where id=p_attachment_id for update;
  if not found then raise exception 'Attachment not found' using errcode='22023'; end if;
  select * into e from public.commerce_expenses where id=a.expense_id for update;
  if e.state in ('paid','void','corrected') then raise exception 'Posted evidence is immutable' using errcode='PT409'; end if;
  delete from public.commerce_expense_attachments where id=a.id;
  return jsonb_build_object('id',a.id,'storage_key',a.storage_key,'deleted',true);
end $$;
revoke all on function public.commerce_expense_attachment_remove(uuid,uuid) from public,anon,authenticated;
grant execute on function public.commerce_expense_attachment_remove(uuid,uuid) to service_role;

create or replace function public.commerce_guard_sales_channel_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.sales_channel is distinct from old.sales_channel and public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required to change sales channel' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists commerce_sales_channel_guard on public.products;
create trigger commerce_sales_channel_guard before update of sales_channel on public.products for each row execute function public.commerce_guard_sales_channel_update();

create or replace function public.commerce_set_product_channel(p_product_id uuid,p_channel text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.products%rowtype; v_ineligible integer;
begin
  if public.active_app_role() is distinct from 'ceo' then raise exception 'CEO required to enable sales channels' using errcode='42501'; end if;
  if p_channel not in ('contact_only','pos_only','online_checkout','pos_and_online') then raise exception 'Invalid sales channel' using errcode='22023'; end if;
  select * into p from public.products where id=p_product_id for update;
  if not found or p.updated_at is distinct from p_expected_updated_at then raise exception 'Product revision conflict' using errcode='PT409'; end if;
  if p_channel in ('online_checkout','pos_and_online') then
    if p.status<>'active' then raise exception 'Public checkout requires active product' using errcode='PT409'; end if;
    select count(*) into v_ineligible from public.product_variants pv where pv.product_id=p.id and pv.is_active and coalesce(pv.price_override,p.sale_price,(select pp.price from public.product_prices pp where pp.product_id=p.id and pp.role='customer'),p.price) is null;
    if v_ineligible>0 or not exists(select 1 from public.product_variants pv where pv.product_id=p.id and pv.is_active) then raise exception 'Every active variant needs an approved customer price' using errcode='PT409'; end if;
  end if;
  update public.products set sales_channel=p_channel,updated_at=now() where id=p.id;
  insert into public.audit_events(action,user_id,details,entity_type,entity_id) values('product_sales_channel_changed',auth.uid(),jsonb_build_object('channel',p_channel),'product',p.id);
  return jsonb_build_object('product_id',p.id,'sales_channel',p_channel,'updated_at',(select updated_at from public.products where id=p.id));
end $$;
revoke all on function public.commerce_set_product_channel(uuid,text,timestamptz) from public,anon;
grant execute on function public.commerce_set_product_channel(uuid,text,timestamptz) to authenticated;
