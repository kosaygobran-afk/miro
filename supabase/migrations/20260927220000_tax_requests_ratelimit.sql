-- Ticket DB-2: VAT scheduling fix, requests assignment unification, rate limiter.
--
-- 1. VAT scheduling: set_tax_rate no longer deactivates the current rate when a
--    FUTURE rate is scheduled. Instead it schedules non-overlapping validity
--    windows:
--      - a new rate starting at/after an open-ended enabled rate truncates that
--        rate's valid_until to new_valid_from - 1 day;
--      - a new windowed rate inserted inside an existing window splits it into
--        [old_from, new_from-1] and [new_until+1, old_until];
--      - any residual overlap is rejected (22023 at RPC level, plus a table-level
--        exclusion constraint over enabled rows as backstop).
--    is_active is re-interpreted as enabled/not-cancelled and no longer toggled
--    by scheduling. current_tax_rate() picks the ENABLED row whose
--    [valid_from, valid_until] window covers the date (now parameterizable, so
--    a future date can be probed). Because scheduling only truncates/splits and
--    never deactivates, there is no gap where today's rate would report 0%.
--    record_sale already snapshots the rate via the same window logic
--    (valid_from <= current_date, valid_until is null or >= current_date,
--    is_active = true, latest valid_from), so no rewrite is needed there.
-- 2. service_requests: the dual assignment columns (assigned_worker_id +
--    assigned_to) are unified into the canonical assigned_to. Legacy values are
--    migrated first, the guard trigger / RLS policies / update_service_request
--    are rewritten to assigned_to, then the old column is dropped.
--    variant_id must belong to product_id when both are set (22023 via trigger).
--    New index on created_at desc for queue views.
-- 3. Rate limiter: public.rate_limit_events(key, occurred_at) +
--    public.check_rate_limit(p_key, p_limit, p_window) security definer;
--    counts in-window events, inserts opportunistically, prunes old rows
--    probabilistically. Executable by anon + authenticated (the app uses it for
--    /api/enquiries); the table itself has no client table grants and RLS with
--    no client policies.

-- ============================================================
-- 1. VAT SCHEDULING
-- ============================================================

create extension if not exists btree_gist;

-- A window must not end before it starts.
alter table public.tax_rates
  drop constraint if exists tax_rates_window_valid;
alter table public.tax_rates
  add constraint tax_rates_window_valid
  check (valid_until is null or valid_until >= valid_from);

-- Enabled rate windows may never overlap (table-level backstop; covers direct
-- service_role writes too). [valid_from, valid_until] both inclusive.
alter table public.tax_rates
  drop constraint if exists tax_rates_no_overlap;
alter table public.tax_rates
  add constraint tax_rates_no_overlap exclude using gist (
    daterange(valid_from, coalesce(valid_until, date 'infinity'), '[]') with &&
  ) where (is_active);

comment on column public.tax_rates.is_active is
  'Enabled / not-cancelled flag. Scheduling only adjusts [valid_from, valid_until]; is_active=false means the row was cancelled and never applies.';

-- current_tax_rate(p_on): enabled rate whose window covers p_on (default today).
-- Returns NULL only when genuinely no enabled rate covers the date; scheduling
-- keeps windows contiguous, so an early-deactivated row can never produce a
-- spurious 0-rate day.
drop function if exists public.current_tax_rate();
create or replace function public.current_tax_rate(p_on date default current_date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select tr.rate
  from public.tax_rates tr
  where tr.is_active = true
    and tr.valid_from <= p_on
    and (tr.valid_until is null or tr.valid_until >= p_on)
  order by tr.valid_from desc
  limit 1;
$$;

revoke all on function public.current_tax_rate(date) from public;
grant execute on function public.current_tax_rate(date) to authenticated;

comment on function public.current_tax_rate is
  'Returns the ENABLED VAT rate whose [valid_from, valid_until] window covers p_on (default today). NULL when no enabled row covers the date.';

-- set_tax_rate: CEO only. Schedules/ splits validity windows; never deactivates
-- an existing rate to make room for a new one (that created 0% gaps).
drop function if exists public.set_tax_rate(text, numeric, date);
create or replace function public.set_tax_rate(
  p_name text,
  p_rate numeric,
  p_valid_from date,
  p_valid_until date default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_id uuid;
  v_row record;
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode = '42501';
  end if;

  if p_rate is null or p_rate < 0 or p_rate >= 100 then
    raise exception 'Invalid rate' using errcode = '22023';
  end if;
  if p_valid_from is null then
    raise exception 'valid_from is required' using errcode = '22023';
  end if;
  if p_valid_until is not null and p_valid_until < p_valid_from then
    raise exception 'valid_until must not precede valid_from' using errcode = '22023';
  end if;

  -- Serialize scheduling (matches the lock key used historically for tax rates)
  perform pg_advisory_xact_lock(2026092501);

  -- Resolve overlaps against existing enabled windows
  for v_row in
    select tr.id, tr.name, tr.rate, tr.valid_from, tr.valid_until
    from public.tax_rates tr
    where tr.is_active
      and tr.valid_from <= coalesce(p_valid_until, date 'infinity')
      and coalesce(tr.valid_until, date 'infinity') >= p_valid_from
    order by tr.valid_from
    for update
  loop
    if v_row.valid_from < p_valid_from then
      -- Existing window starts before the new one: cut its tail off at the
      -- day before the new window begins.
      update public.tax_rates
      set valid_until = p_valid_from - 1
      where id = v_row.id;

      -- If the old window continues past the new one, re-open the tail
      -- ([new_until+1, old_until]) so there is no uncovered gap afterwards.
      -- An open-ended old window re-opens as an open-ended tail.
      if p_valid_until is not null
         and (v_row.valid_until is null or v_row.valid_until > p_valid_until) then
        insert into public.tax_rates (name, rate, valid_from, valid_until, is_active, created_by)
        values (v_row.name, v_row.rate, p_valid_until + 1, v_row.valid_until, true, auth.uid());
      end if;
    else
      -- An enabled window starting at/after the new start still overlaps:
      -- that is a genuine conflict, not something we may silently rewrite.
      raise exception 'Overlapping tax rate window' using errcode = '22023';
    end if;
  end loop;

  insert into public.tax_rates (name, rate, valid_from, valid_until, is_active, created_by)
  values (p_name, p_rate, p_valid_from, p_valid_until, true, auth.uid())
  returning id into v_new_id;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('tax_rate_changed', auth.uid(),
    jsonb_build_object(
      'tax_rate_id', v_new_id,
      'name', p_name,
      'rate', p_rate,
      'valid_from', p_valid_from,
      'valid_until', p_valid_until
    ),
    'tax_rate', v_new_id
  );

  return v_new_id;
end;
$$;

revoke all on function public.set_tax_rate(text, numeric, date, date) from public;
grant execute on function public.set_tax_rate(text, numeric, date, date) to authenticated;

comment on function public.set_tax_rate is
  'CEO only. Schedules a tax rate window: truncates an open-ended current rate at new_valid_from-1, splits a containing window around a windowed rate, rejects residual overlap (22023). Never deactivates the current rate. Audited.';

-- ============================================================
-- 2. SERVICE_REQUESTS: unified assigned_to
-- ============================================================

-- (a) migrate legacy worker assignments into the canonical column
update public.service_requests
set assigned_to = assigned_worker_id
where assigned_to is null and assigned_worker_id is not null;

-- (b) intake guard no longer references the legacy column (it still forces
-- status='new' and assigned_to=NULL for non-management inserters)
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
  end if;
  return new;
end;
$$;

-- (c) recreate RLS policies that referenced assigned_worker_id against
-- assigned_to, BEFORE dropping the column (policies depend on it).
drop policy if exists "Authenticated users can create requests" on public.service_requests;
create policy "Authenticated users can create requests" on public.service_requests
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and public.active_app_role() is not null
    and status = 'new'
    and assigned_to is null
  );

drop policy if exists "Staff reads requests" on public.service_requests;
create policy "Staff reads requests" on public.service_requests
  for select to authenticated
  using (
    public.active_app_role() in ('admin','ceo')
    or (public.active_app_role() = 'worker' and assigned_to = auth.uid())
  );

-- (d) update_service_request: canonical assigned_to. Third argument is the
-- assignee (kept named `worker` for RPC signature compatibility); accepts any
-- ACTIVE staff account (worker/admin/ceo). Workers may set
-- in_progress/waiting_customer/closed on their assigned requests and may not
-- (re)assign. Status list includes 'waiting_customer'.
create or replace function public.update_service_request(target uuid, new_status text, worker uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text; assigned uuid;
begin
  actor_role := public.active_app_role();
  select assigned_to into assigned from public.service_requests where id = target for update;
  if not found then raise exception 'Unknown request' using errcode = '22023'; end if;
  if actor_role is null or not (actor_role in ('admin','ceo') or (actor_role = 'worker' and assigned is not null and assigned = auth.uid())) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if new_status not in ('new','in_progress','waiting_customer','closed','spam') or new_status is null then raise exception 'Invalid status' using errcode = '22023'; end if;
  if actor_role = 'worker' and (worker is not null or new_status not in ('in_progress','waiting_customer','closed')) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if worker is not null and not exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id where r.user_id = worker and r.role in ('worker','admin','ceo') and p.account_status = 'active') then raise exception 'Invalid assignee' using errcode = '22023'; end if;
  update public.service_requests set status = new_status, assigned_to = case when actor_role = 'worker' then assigned else worker end where id = target;
  insert into public.audit_events(action,user_id,details) values ('request_update',auth.uid(),jsonb_build_object('request_id',target,'status',new_status,'assigned_to',worker));
end;
$$;
revoke all on function public.update_service_request(uuid,text,uuid) from public;
grant execute on function public.update_service_request(uuid,text,uuid) to authenticated;

comment on function public.update_service_request is
  'Requests workflow. Admin/CEO may set any status and assign to any active staff account (worker/admin/ceo); the assigned worker may move their assigned request through in_progress/waiting_customer/closed without reassigning. Audited.';

-- (e) drop the superseded column and its index (data already migrated above)
drop index if exists public.service_requests_assigned_worker_idx;
alter table public.service_requests drop column if exists assigned_worker_id;

comment on column public.service_requests.assigned_to is
  'Canonical staff assignment (worker/admin/ceo). Set by management only; forced NULL for public/anonymous inserts. Supersedes the dropped assigned_worker_id column.';

-- (f) variant must belong to the referenced product when both are set.
-- SECURITY DEFINER because anonymous inserters hold no product_variants grant.
create or replace function public.service_requests_guard_product_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_id is not null and new.variant_id is not null then
    if not exists (
      select 1
      from public.product_variants v
      where v.id = new.variant_id and v.product_id = new.product_id
    ) then
      raise exception 'Variant does not belong to the referenced product' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists service_requests_guard_product_variant_trg on public.service_requests;
create trigger service_requests_guard_product_variant_trg
  before insert or update of product_id, variant_id on public.service_requests
  for each row execute function public.service_requests_guard_product_variant();

-- (g) queue indexes (status and assigned_to already exist; add recency sort)
create index if not exists service_requests_status_idx on public.service_requests(status);
create index if not exists service_requests_assigned_to_idx on public.service_requests(assigned_to);
create index if not exists service_requests_created_at_idx on public.service_requests(created_at desc);

-- ============================================================
-- 3. RATE LIMITER
-- ============================================================

create table if not exists public.rate_limit_events (
  key text not null check (length(key) between 1 and 200),
  occurred_at timestamptz not null default clock_timestamp(),
  primary key (key, occurred_at)
);

create index if not exists rate_limit_events_occurred_at_idx
  on public.rate_limit_events(occurred_at);

alter table public.rate_limit_events enable row level security;

-- No client table access at all: the function below is the only way in.
revoke all on public.rate_limit_events from public;
revoke all on public.rate_limit_events from anon, authenticated;
grant all on public.rate_limit_events to service_role;

comment on table public.rate_limit_events is
  'Event log backing check_rate_limit(). Append-only via the RPC; clients have no table grants (RLS, no policies).';

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window interval
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    raise exception 'Invalid rate limit key' using errcode = '22023';
  end if;
  if p_limit is null or p_limit <= 0 then
    raise exception 'Rate limit must be positive' using errcode = '22023';
  end if;
  if p_window is null or p_window <= interval '0' then
    raise exception 'Rate limit window must be positive' using errcode = '22023';
  end if;

  select count(*) into v_count
  from public.rate_limit_events e
  where e.key = p_key
    and e.occurred_at > clock_timestamp() - p_window;

  if v_count >= p_limit then
    return false;
  end if;

  -- Opportunistic insert (duplicate (key, occurred_at) micro-collisions are
  -- simply not counted)
  insert into public.rate_limit_events (key) values (p_key)
  on conflict do nothing;

  -- Probabilistic pruning keeps the table bounded without a scheduler
  if random() < 0.05 then
    delete from public.rate_limit_events
    where occurred_at < clock_timestamp() - greatest(p_window * 3, interval '1 day');
  end if;

  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, interval) from public;
grant execute on function public.check_rate_limit(text, integer, interval) to anon, authenticated;

comment on function public.check_rate_limit is
  'Sliding-window rate limiter: returns false when p_limit events already exist for p_key within p_window, else records one event and returns true. Intent: public endpoints such as /api/enquiries.';
