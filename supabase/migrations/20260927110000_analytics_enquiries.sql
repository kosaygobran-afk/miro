-- Analytics hardening, trusted management aggregation RPCs and enquiry intake.
--
-- 1. analytics_events: client INSERT policy no longer admits 'sale' / 'return'.
--    The table CHECK list is kept unchanged so service_role inserts (which bypass
--    RLS) remain the trusted path for commerce events.
-- 2. Trusted aggregation RPCs (security definer, search_path='', authorized via
--    public.active_app_role() in ('admin','ceo'), revoked from public, execute
--    granted to authenticated only):
--      management_sales_summary(p_from, p_to) -> current + previous equivalent
--        period aggregates sourced ONLY from orders/order_items, mirroring the
--        filtering of src/app/api/management/finance/route.ts (orders with
--        status not in ('cancelled','refunded'); order_items in range that belong
--        to those orders; revenue net falls back to subtotal when net_total is
--        null; COGS = sum(unit_cost * quantity)).
--      management_analytics_overview(p_from, p_to) -> real count(distinct
--        session_id), product_view/product_impression kept separate,
--        contact-click breakdown, top_products (top 10 by product_view with
--        product labels), top_categories with labels, top_searches top 10,
--        inquiry counts.
--      management_inventory_list(p_search, p_status, p_page, p_page_size) ->
--        DB-side search/filter/pagination; p_page_size hard-capped at 100;
--        status computed in SQL ('out' = qty <= 0, 'low' = 0 < qty <= threshold,
--        else 'in').
--      get_public_contact_config() -> ONLY whitelisted public contact fields;
--        executable by anon and authenticated.
-- 3. service_requests: locale/source/product_id/variant_id/assigned_to/metadata
--    columns; status check widened with 'waiting_customer'; anonymous INSERT
--    allowed with length caps; a BEFORE INSERT guard (security definer, so
--    active_app_role() is callable for anon) forces status='new' and NULL
--    assigned_to/assigned_worker_id for any non-management inserter.
--    Rationale for the trigger over WITH CHECK alone: fail-closed normalization
--    keeps legacy clients working while making it impossible for anonymous
--    traffic to self-assign or self-triage.

-- ============================================================
-- 1. analytics_events INSERT policy excludes commerce events
-- ============================================================

drop policy if exists "Anyone can insert analytics events" on public.analytics_events;
create policy "Anyone can insert analytics events" on public.analytics_events
  for insert to anon, authenticated
  with check (
    event_type in (
      'product_view','product_impression','product_search','search_no_result',
      'category_view','product_contact_click','product_phone_click',
      'product_whatsapp_click','product_inquiry'
    )
    and (search_query is null or length(search_query) <= 200)
    and (session_id is null or length(session_id) <= 64)
    and (locale is null or locale in ('he','en'))
  );

-- ============================================================
-- 2. Trusted management RPCs
-- ============================================================

-- Private helper: aggregates one sales window. Not granted to any API role;
-- only reachable from management_sales_summary (which runs as its owner).
create or replace function public._management_sales_window(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ord as (
    select o.id, o.total, coalesce(o.net_total, o.subtotal) as net, coalesce(o.vat_total, 0) as vat
    from public.orders o
    where o.created_at >= p_from and o.created_at <= p_to
      and o.status not in ('cancelled','refunded')
  ),
  it as (
    select oi.quantity, coalesce(oi.unit_cost, 0) as unit_cost
    from public.order_items oi
    join ord on ord.id = oi.order_id
    where oi.created_at >= p_from and oi.created_at <= p_to
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'gross_total', round(coalesce((select sum(total) from ord), 0), 2),
    'net_total', round(coalesce((select sum(net) from ord), 0), 2),
    'vat_total', round(coalesce((select sum(vat) from ord), 0), 2),
    'orders_count', (select count(*) from ord),
    'items_count', coalesce((select sum(quantity) from it), 0),
    'cogs_total', round(coalesce((select sum(unit_cost * quantity) from it), 0), 2),
    'gross_profit', round(coalesce((select sum(net) from ord), 0) - coalesce((select sum(unit_cost * quantity) from it), 0), 2),
    'gross_margin_pct', case
      when coalesce((select sum(net) from ord), 0) > 0
      then round((coalesce((select sum(net) from ord), 0) - coalesce((select sum(unit_cost * quantity) from it), 0)) / (select sum(net) from ord) * 100, 2)
      else 0
    end
  );
$$;

revoke all on function public._management_sales_window(timestamptz,timestamptz) from public;
revoke all on function public._management_sales_window(timestamptz,timestamptz) from anon, authenticated;

create or replace function public.management_sales_summary(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid range' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'current', public._management_sales_window(p_from, p_to),
    'previous', public._management_sales_window(p_from - (p_to - p_from), p_from),
    'generated_at', timezone('utc'::text, now())
  );
end;
$$;

revoke all on function public.management_sales_summary(timestamptz,timestamptz) from public;
grant execute on function public.management_sales_summary(timestamptz,timestamptz) to authenticated;

comment on function public.management_sales_summary is
'Admin/CEO. Sales totals for [p_from,p_to] plus the equivalent-length period immediately before p_from. Mirrors the finance route: orders excluding cancelled/refunded; net falls back to subtotal; COGS = sum(unit_cost*quantity) over in-range line items of included orders.';

create or replace function public.management_analytics_overview(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unique_sessions bigint;
  v_views bigint;
  v_impressions bigint;
  v_searches bigint;
  v_no_results bigint;
  v_click_contact bigint;
  v_click_phone bigint;
  v_click_whatsapp bigint;
  v_inquiries bigint;
  v_service_requests bigint;
  v_top_products jsonb;
  v_top_categories jsonb;
  v_top_searches jsonb;
begin
  if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid range' using errcode = '22023';
  end if;

  -- Real distinct count in SQL; no app-memory row cap
  select count(distinct session_id) into v_unique_sessions
  from public.analytics_events
  where created_at >= p_from and created_at <= p_to
    and session_id is not null;

  select
    count(*) filter (where event_type = 'product_view'),
    count(*) filter (where event_type = 'product_impression'),
    count(*) filter (where event_type = 'product_search'),
    count(*) filter (where event_type = 'search_no_result'),
    count(*) filter (where event_type = 'product_contact_click'),
    count(*) filter (where event_type = 'product_phone_click'),
    count(*) filter (where event_type = 'product_whatsapp_click'),
    count(*) filter (where event_type = 'product_inquiry')
  into v_views, v_impressions, v_searches, v_no_results,
       v_click_contact, v_click_phone, v_click_whatsapp, v_inquiries
  from public.analytics_events
  where created_at >= p_from and created_at <= p_to;

  select count(*) into v_service_requests
  from public.service_requests
  where created_at >= p_from and created_at <= p_to;

  -- Top 10 products by product_view, labeled (product_id kept for linking)
  select coalesce(jsonb_agg(to_jsonb(t) order by t.views desc, t.product_id), '[]'::jsonb)
  into v_top_products
  from (
    select ae.product_id, p.slug, p.name_he, p.name_en, count(*) as views
    from public.analytics_events ae
    left join public.products p on p.id = ae.product_id
    where ae.event_type = 'product_view'
      and ae.product_id is not null
      and ae.created_at >= p_from and ae.created_at <= p_to
    group by ae.product_id, p.slug, p.name_he, p.name_en
    order by views desc, ae.product_id
    limit 10
  ) t;

  -- Top 10 categories by category_view, labeled
  select coalesce(jsonb_agg(to_jsonb(t) order by t.views desc, t.category_id), '[]'::jsonb)
  into v_top_categories
  from (
    select ae.category_id, c.slug, c.name_he, c.name_en, count(*) as views
    from public.analytics_events ae
    left join public.categories c on c.id = ae.category_id
    where ae.event_type = 'category_view'
      and ae.category_id is not null
      and ae.created_at >= p_from and ae.created_at <= p_to
    group by ae.category_id, c.slug, c.name_he, c.name_en
    order by views desc, ae.category_id
    limit 10
  ) t;

  -- Top 10 search terms
  select coalesce(jsonb_agg(to_jsonb(t) order by t.searches desc, t.query), '[]'::jsonb)
  into v_top_searches
  from (
    select coalesce(nullif(btrim(ae.search_query), ''), '(empty)') as query, count(*) as searches
    from public.analytics_events ae
    where ae.event_type = 'product_search'
      and ae.created_at >= p_from and ae.created_at <= p_to
    group by 1
    order by searches desc, query
    limit 10
  ) t;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'generated_at', timezone('utc'::text, now()),
    'totals', jsonb_build_object(
      'unique_sessions', v_unique_sessions,
      'product_views', v_views,
      'product_impressions', v_impressions,
      'searches', v_searches,
      'no_result_searches', v_no_results,
      'contact_clicks', jsonb_build_object(
        'contact', v_click_contact,
        'phone', v_click_phone,
        'whatsapp', v_click_whatsapp,
        'total', v_click_contact + v_click_phone + v_click_whatsapp
      ),
      'product_inquiries', v_inquiries,
      'service_requests', v_service_requests
    ),
    'top_products', v_top_products,
    'top_categories', v_top_categories,
    'top_searches', v_top_searches
  );
end;
$$;

revoke all on function public.management_analytics_overview(timestamptz,timestamptz) from public;
grant execute on function public.management_analytics_overview(timestamptz,timestamptz) to authenticated;

comment on function public.management_analytics_overview is
'Admin/CEO. Analytics totals (real distinct sessions, split view/impression counts, contact-click breakdown, inquiries) plus labeled top-10 products/categories/searches for [p_from,p_to].';

create or replace function public.management_inventory_list(
  p_search text default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 25
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100); -- hard cap
  v_total bigint;
  v_items jsonb;
begin
  if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('in','low','out') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  select count(*) into v_total
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where (v_search is null
    or pv.sku ilike '%' || v_search || '%'
    or pv.barcode ilike '%' || v_search || '%'
    or p.name_he ilike '%' || v_search || '%'
    or p.name_en ilike '%' || v_search || '%')
    and (p_status is null or case
      when pv.stock_qty <= 0 then 'out'
      when pv.stock_qty <= pv.low_stock_threshold then 'low'
      else 'in' end = p_status);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.sku, t.variant_id), '[]'::jsonb)
  into v_items
  from (
    select
      pv.id as variant_id,
      pv.sku,
      pv.barcode,
      pv.stock_qty,
      pv.low_stock_threshold,
      pv.reorder_point,
      pv.reorder_qty,
      s.company_name as supplier_company_name,
      p.id as product_id,
      p.slug as product_slug,
      p.name_he as product_name_he,
      p.name_en as product_name_en,
      case
        when pv.stock_qty <= 0 then 'out'
        when pv.stock_qty <= pv.low_stock_threshold then 'low'
        else 'in'
      end as status
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    left join public.suppliers s on s.id = pv.supplier_id
    where (v_search is null
      or pv.sku ilike '%' || v_search || '%'
      or pv.barcode ilike '%' || v_search || '%'
      or p.name_he ilike '%' || v_search || '%'
      or p.name_en ilike '%' || v_search || '%')
      and (p_status is null or case
        when pv.stock_qty <= 0 then 'out'
        when pv.stock_qty <= pv.low_stock_threshold then 'low'
        else 'in' end = p_status)
    order by pv.sku, pv.id
    limit v_page_size offset (v_page - 1) * v_page_size
  ) t;

  return jsonb_build_object(
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size,
    'items', v_items
  );
end;
$$;

revoke all on function public.management_inventory_list(text,text,integer,integer) from public;
grant execute on function public.management_inventory_list(text,text,integer,integer) to authenticated;

comment on function public.management_inventory_list is
'Admin/CEO. DB-side inventory search/filter/pagination over variants joined to products and suppliers. p_status in (in|low|out): out = qty<=0, low = 0<qty<=low_stock_threshold. p_page_size hard-capped at 100.';

-- Public contact configuration: whitelisted fields only, nulls allowed.
create or replace function public.get_public_contact_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  select coalesce(bs.value, '{}'::jsonb) into v_value
  from public.business_settings bs
  where bs.key = 'public_contact';

  v_value := coalesce(v_value, '{}'::jsonb);

  return jsonb_build_object(
    'phone', v_value->'phone',
    'whatsapp', v_value->'whatsapp',
    'email', v_value->'email',
    'address_he', v_value->'address_he',
    'address_en', v_value->'address_en',
    'hours_he', v_value->'hours_he',
    'hours_en', v_value->'hours_en'
  );
end;
$$;

revoke all on function public.get_public_contact_config() from public;
grant execute on function public.get_public_contact_config() to anon, authenticated;

comment on function public.get_public_contact_config is
'Public. Whitelisted storefront contact fields from business_settings key ''public_contact'' only; never exposes the full settings object. Missing values are null.';

-- ============================================================
-- 3. service_requests extension
-- ============================================================

alter table public.service_requests
  add column if not exists locale text
    constraint service_requests_locale_check check (locale is null or locale in ('he','en')),
  add column if not exists source text not null default 'contact_page',
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists service_requests_product_id_idx on public.service_requests(product_id);
create index if not exists service_requests_assigned_to_idx on public.service_requests(assigned_to);

alter table public.service_requests
  drop constraint if exists service_requests_status_check;
alter table public.service_requests
  add constraint service_requests_status_check
  check (status in ('new','in_progress','waiting_customer','closed','spam'));

comment on column public.service_requests.locale is 'Request locale (he/en); NULL for legacy rows.';
comment on column public.service_requests.source is 'Intake channel: contact_page (default), storefront product pages, management console, import.';
comment on column public.service_requests.product_id is 'Related product for product enquiries. SET NULL on product deletion.';
comment on column public.service_requests.variant_id is 'Related variant for product enquiries. SET NULL on variant deletion.';
comment on column public.service_requests.assigned_to is 'General staff assignment (admin/ceo/worker). Set by management only; forced NULL for public/anonymous inserts.';
comment on column public.service_requests.metadata is 'Free-form intake payload (page URL, UTM tags, etc.).';

-- Fail-closed intake guard: only admin/ceo may set triage fields on insert.
-- SECURITY DEFINER so active_app_role() (granted to authenticated only) is
-- callable when the statement runs as anon.
create or replace function public.service_requests_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.active_app_role(), '') not in ('admin','ceo') then
    new.status := 'new';
    new.assigned_to := null;
    new.assigned_worker_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists service_requests_guard_insert_trg on public.service_requests;
create trigger service_requests_guard_insert_trg
  before insert on public.service_requests
  for each row execute function public.service_requests_guard_insert();

-- Anonymous + authenticated intake with length caps. (The pre-existing
-- "Authenticated users can create requests" policy remains; policies OR together,
-- and for customers both require customer_id = auth.uid().)
grant insert on public.service_requests to anon;

-- RLS WITH CHECK below calls active_app_role() as the invoking user, including
-- anon (the trigger needed SECURITY DEFINER for the same reason). The function
-- only reveals the caller's own role, so granting anon is safe.
grant execute on function public.active_app_role() to anon;

drop policy if exists "Anyone can submit contact requests" on public.service_requests;
create policy "Anyone can submit contact requests" on public.service_requests
  for insert to anon, authenticated
  with check (
    (auth.uid() is null or public.active_app_role() is not null)
    and (customer_id is null or customer_id = auth.uid())
    and length(name) between 1 and 200
    and length(email) between 1 and 320
    and (phone is null or length(phone) <= 50)
    and length(message) between 1 and 5000
    and length(source) <= 64
    and (locale is null or locale in ('he','en'))
    and octet_length(metadata::text) <= 8192
  );

-- update_service_request accepts the widened status list; workers may also set
-- 'waiting_customer' on their assigned requests.
create or replace function public.update_service_request(target uuid, new_status text, worker uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text; assigned uuid;
begin
  actor_role := public.active_app_role();
  select assigned_worker_id into assigned from public.service_requests where id = target for update;
  if not found then raise exception 'Unknown request' using errcode = '22023'; end if;
  if actor_role is null or not (actor_role in ('admin','ceo') or (actor_role = 'worker' and assigned is not null and assigned = auth.uid())) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if new_status not in ('new','in_progress','waiting_customer','closed','spam') or new_status is null then raise exception 'Invalid status' using errcode = '22023'; end if;
  if actor_role = 'worker' and (worker is not null or new_status not in ('in_progress','waiting_customer','closed')) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if worker is not null and not exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id where r.user_id = worker and r.role = 'worker' and p.account_status = 'active') then raise exception 'Invalid worker' using errcode = '22023'; end if;
  update public.service_requests set status = new_status, assigned_worker_id = case when actor_role = 'worker' then assigned else worker end where id = target;
  insert into public.audit_events(action,user_id,details) values ('request_update',auth.uid(),jsonb_build_object('request_id',target,'status',new_status,'worker_id',worker));
end;
$$;
revoke all on function public.update_service_request(uuid,text,uuid) from public;
grant execute on function public.update_service_request(uuid,text,uuid) to authenticated;
