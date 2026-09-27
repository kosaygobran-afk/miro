-- Tests for 20260927220000_tax_requests_ratelimit.sql (ticket DB-2):
-- VAT scheduling windows, unified service_requests.assigned_to,
-- variant/product consistency, and the rate limiter.
-- Run against an isolated migrated database. All fixtures are rolled back.
begin;

-- ============================================================
-- Fixtures
-- ============================================================

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
('00000000-0000-0000-0000-000000000300', 'tr-customer@example.invalid', now(), '{"full_name":"Customer"}'),
('00000000-0000-0000-0000-000000000301', 'tr-admin@example.invalid', now(), '{"full_name":"Admin"}'),
('00000000-0000-0000-0000-000000000302', 'tr-ceo@example.invalid', now(), '{"full_name":"CEO"}'),
('00000000-0000-0000-0000-000000000303', 'tr-worker@example.invalid', now(), '{"full_name":"Worker"}');

update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000301';
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000302';
update public.user_roles set role='worker' where user_id='00000000-0000-0000-0000-000000000303';

insert into public.categories(id, slug, name_he, name_en, is_active) values
('aaaaaaaa-0000-0000-0000-0000000000aa', 'tr-cat', 'קטגוריה', 'TaxReq category', true);

insert into public.products(id, category_id, slug, name_he, name_en, price, tracking_mode) values
('bbbbbbbb-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000aa', 'tr-p1', 'מוצר א', 'Product 1', 118.00, 'none'),
('bbbbbbbb-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-0000000000aa', 'tr-p2', 'מוצר ב', 'Product 2', 10.00, 'none');

update public.products set status = 'active'
where id in ('bbbbbbbb-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a2');

insert into public.product_variants(id, product_id, sku, barcode, is_active, stock_qty) values
('cccccccc-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a1', 'TR-SKU-1', 'TR-BC-1', true, 5),
('cccccccc-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000a2', 'TR-SKU-2', 'TR-BC-2', true, 5);

-- ============================================================
-- 1. VAT scheduling
-- ============================================================

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000300',true); -- customer

-- Non-CEO cannot schedule rates
do $$ begin
  begin
    perform public.set_tax_rate('Hack VAT', 12.00, current_date + 7);
    raise exception 'Customer tax rate change allowed';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000302',true); -- CEO

do $$
declare
  v_seed uuid; v_future uuid; v_mid uuid;
begin
  -- Seeded 18% VAT (valid from 2025-01-01) is today's rate
  select id into v_seed from public.tax_rates where rate = 18.00 and valid_from = '2025-01-01';
  if public.current_tax_rate() <> 18.00 then raise exception 'Seeded VAT not current'; end if;

  -- Schedule a FUTURE 19% rate: today must keep 18%
  v_future := public.set_tax_rate('Future VAT', 19.00, current_date + 30);

  if public.current_tax_rate() <> 18.00 then
    raise exception 'Current VAT broke after scheduling a future rate';
  end if;
  if (select is_active from public.tax_rates where id = v_seed) <> true then
    raise exception 'Current rate was deactivated by scheduling';
  end if;
  if (select valid_until from public.tax_rates where id = v_seed) <> current_date + 29 then
    raise exception 'Truncated window must end the day before the new rate starts';
  end if;

  -- On the future date 19% wins; the day before still yields 18%
  if public.current_tax_rate(current_date + 30) <> 19.00 then
    raise exception 'Future rate not effective on its start date';
  end if;
  if public.current_tax_rate(current_date + 29) <> 18.00 then
    raise exception 'Day before the future rate resolves wrongly';
  end if;

  -- No zero-VAT / uncovered gap across the boundary
  if exists (
    select 1 from generate_series(current_date::timestamptz, (current_date + 60)::timestamptz, interval '1 day') as d(day)
    where public.current_tax_rate(d.day::date) is null or public.current_tax_rate(d.day::date) = 0
  ) then raise exception 'Zero-VAT gap across scheduled boundary'; end if;

  -- Overlapping window rejected: straddles the boundary between the 18%
  -- window and the already-scheduled 19% window (a residual overlap remains
  -- that must not be silently rewritten)
  begin
    perform public.set_tax_rate('Overlap', 21.00, current_date + 25, current_date + 35);
    raise exception 'Overlapping window accepted';
  exception when sqlstate '22023' then null; end;
  -- The failed insert must not have mutated the existing windows (atomicity)
  if (select valid_until from public.tax_rates where id = v_future) is not null then
    raise exception 'Rejected overlap still truncated the 19%% window';
  end if;
  if (select valid_until from public.tax_rates where id = v_seed) <> current_date + 29 then
    raise exception 'Rejected overlap still truncated the 18%% window';
  end if;

  -- Splitting: 20% for [today+60, today+70] inside the open-ended 19% window
  v_mid := public.set_tax_rate('Mid VAT', 20.00, current_date + 60, current_date + 70);
  if public.current_tax_rate(current_date + 35) <> 19.00 then raise exception 'Left side of split wrong'; end if;
  if public.current_tax_rate(current_date + 65) <> 20.00 then raise exception 'Inserted window rate wrong'; end if;
  if public.current_tax_rate(current_date + 80) <> 19.00 then raise exception 'Right side of split wrong'; end if;
  if (select valid_until from public.tax_rates where id = v_future) <> current_date + 59 then
    raise exception 'Split truncation wrong';
  end if;
  if not exists (
    select 1 from public.tax_rates
    where rate = 19.00 and valid_from = current_date + 71 and valid_until is null and is_active
  ) then raise exception 'Split tail copy missing'; end if;

  -- Invalid inputs rejected
  begin perform public.set_tax_rate('Bad', null, current_date + 100); raise exception 'Null rate accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.set_tax_rate('Bad', -1, current_date + 100); raise exception 'Negative rate accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.set_tax_rate('Bad', 100, current_date + 100); raise exception 'Rate >= 100 accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.set_tax_rate('Bad', 22.00, current_date + 100, current_date + 99); raise exception 'Inverted window accepted'; exception when sqlstate '22023' then null; end;

  -- Audit written in the same transaction as the schedule
  if not exists (
    select 1 from public.audit_events
    where action = 'tax_rate_changed' and entity_id = v_future
      and details->>'rate' = '19.00'
  ) then raise exception 'Tax rate audit missing'; end if;
end $$;

-- Table-level backstop: direct overlapping insert also rejected
reset role;
do $$ begin
  begin
    insert into public.tax_rates(name, rate, valid_from, valid_until, is_active)
    values ('Direct overlap', 5.00, current_date + 40, current_date + 50, true);
    raise exception 'Direct overlapping tax window accepted';
  exception when exclusion_violation then null; end;
  -- Inverted window blocked by CHECK as well
  begin
    insert into public.tax_rates(name, rate, valid_from, valid_until, is_active)
    values ('Direct inverted', 5.00, current_date + 50, current_date + 40, true);
    raise exception 'Direct inverted tax window accepted';
  exception when check_violation then null; end;
end $$;

-- record_sale snapshots the rate effective on the sale date (today: 18%,
-- even though 19% is already scheduled in the future)
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000302',true); -- CEO
do $$
declare v_order_id uuid; v_item record;
begin
  v_order_id := public.record_sale(
    '{"name": "VAT Probe"}'::jsonb,
    '[{"variant_id": "cccccccc-0000-0000-0000-0000000000a1", "quantity": 1, "unit_price": 118}]'::jsonb
  );
  select * into v_item from public.order_items where order_id = v_order_id;
  if v_item.vat_rate <> 18.00 then
    raise exception 'record_sale snapped the wrong VAT rate: %', v_item.vat_rate;
  end if;
  if v_item.vat_amount <> 18.00 or v_item.net_amount <> 100.00 then
    raise exception 'VAT math wrong: net %, vat %', v_item.net_amount, v_item.vat_amount;
  end if;
end $$;

-- ============================================================
-- 2. service_requests: unified assigned_to + variant consistency
-- ============================================================

reset role;
-- Direct inserts as the table owner bypass RLS; the intake guard still forces
-- status='new'/assigned_to=NULL because no JWT claim is set.
insert into public.service_requests(id, name, email, message, product_id, variant_id)
values
  ('dddddddd-0000-0000-0000-000000000001', 'Req One', 'r1@example.invalid', 'Need a quote',
   'bbbbbbbb-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000a1'),
  ('dddddddd-0000-0000-0000-000000000002', 'Req Two', 'r2@example.invalid', 'Variant only',
   null, 'cccccccc-0000-0000-0000-0000000000a2');

do $$ begin
  -- Intake guard applied even on the direct insert path
  if exists (
    select 1 from public.service_requests
    where id in ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002')
      and (status <> 'new' or assigned_to is not null)
  ) then raise exception 'Intake guard did not normalize direct inserts'; end if;

  -- Product/variant mismatch rejected on INSERT
  begin
    insert into public.service_requests(name, email, message, product_id, variant_id)
    values ('Req Bad', 'r3@example.invalid', 'Mismatch',
            'bbbbbbbb-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000a2');
    raise exception 'Mismatched variant accepted on insert';
  exception when sqlstate '22023' then null; end;

  -- Product/variant mismatch rejected on UPDATE
  begin
    update public.service_requests
    set variant_id = 'cccccccc-0000-0000-0000-0000000000a2'
    where id = 'dddddddd-0000-0000-0000-000000000001';
    raise exception 'Mismatched variant accepted on update';
  exception when sqlstate '22023' then null; end;

  -- Legacy column is gone
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_requests' and column_name = 'assigned_worker_id'
  ) then raise exception 'assigned_worker_id column still present'; end if;

  -- Queue index exists
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'service_requests'
      and indexname = 'service_requests_created_at_idx'
  ) then raise exception 'created_at index missing'; end if;
end $$;

-- RPC + RLS use assigned_to
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true); -- admin
do $$ begin
  perform public.update_service_request(
    'dddddddd-0000-0000-0000-000000000001', 'in_progress',
    '00000000-0000-0000-0000-000000000303');
  if (select assigned_to from public.service_requests where id = 'dddddddd-0000-0000-0000-000000000001')
     <> '00000000-0000-0000-0000-000000000303'::uuid then
    raise exception 'Assignment not stored in assigned_to';
  end if;
  if (select status from public.service_requests where id = 'dddddddd-0000-0000-0000-000000000001')
     <> 'in_progress' then raise exception 'Status not updated'; end if;

  -- invalid status rejected
  begin
    perform public.update_service_request('dddddddd-0000-0000-0000-000000000001', 'bogus', null);
    raise exception 'Bogus status accepted';
  exception when sqlstate '22023' then null; end;

  -- assignee must be an ACTIVE staff account (customer rejected)
  begin
    perform public.update_service_request(
      'dddddddd-0000-0000-0000-000000000001', 'in_progress',
      '00000000-0000-0000-0000-000000000300');
    raise exception 'Customer assignee accepted';
  exception when sqlstate '22023' then null; end;

  -- audit row written with the canonical key
  if not exists (
    select 1 from public.audit_events
    where action = 'request_update'
      and details->>'request_id' = 'dddddddd-0000-0000-0000-000000000001'
      and details->>'assigned_to' = '00000000-0000-0000-0000-000000000303'
  ) then raise exception 'Assignment audit missing'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000303',true); -- worker
do $$ begin
  -- RLS: the worker sees exactly their assigned request via assigned_to
  if (select count(*) from public.service_requests) <> 1 then
    raise exception 'Worker RLS visibility wrong';
  end if;

  -- worker may move their assigned request to waiting_customer
  perform public.update_service_request('dddddddd-0000-0000-0000-000000000001', 'waiting_customer', null);
  if (select status from public.service_requests where id = 'dddddddd-0000-0000-0000-000000000001')
     <> 'waiting_customer' then raise exception 'Worker waiting_customer failed'; end if;
  if (select assigned_to from public.service_requests where id = 'dddddddd-0000-0000-0000-000000000001')
     <> '00000000-0000-0000-0000-000000000303'::uuid then
    raise exception 'Worker status change clobbered the assignment';
  end if;

  -- worker may not set triage statuses or reassign
  begin
    perform public.update_service_request('dddddddd-0000-0000-0000-000000000001', 'spam', null);
    raise exception 'Worker set spam';
  exception when insufficient_privilege then null; end;
  begin
    perform public.update_service_request(
      'dddddddd-0000-0000-0000-000000000001', 'closed',
      '00000000-0000-0000-0000-000000000301');
    raise exception 'Worker reassigned';
  exception when insufficient_privilege then null; end;

  -- worker may not touch a request assigned to nobody
  begin
    perform public.update_service_request('dddddddd-0000-0000-0000-000000000002', 'closed', null);
    raise exception 'Worker updated an unassigned request';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000300',true); -- customer
do $$ begin
  begin
    perform public.update_service_request('dddddddd-0000-0000-0000-000000000001', 'closed', null);
    raise exception 'Customer updated a request';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.service_requests) <> 0 then
    raise exception 'Customer can read staff requests';
  end if;
end $$;

-- ============================================================
-- 3. Rate limiter
-- ============================================================

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true); -- anon has no JWT
do $$ begin
  -- under-limit allowed, exactly at the limit denied
  if not public.check_rate_limit('tr-rl-1', 3, interval '1 minute') then raise exception 'Call 1 denied'; end if;
  if not public.check_rate_limit('tr-rl-1', 3, interval '1 minute') then raise exception 'Call 2 denied'; end if;
  if not public.check_rate_limit('tr-rl-1', 3, interval '1 minute') then raise exception 'Call 3 denied'; end if;
  if public.check_rate_limit('tr-rl-1', 3, interval '1 minute') then raise exception 'Over-limit call allowed'; end if;
  -- denied calls must not consume budget: still denied
  if public.check_rate_limit('tr-rl-1', 3, interval '1 minute') then raise exception 'Denied call consumed budget wrongly'; end if;

  -- keys are independent buckets
  if not public.check_rate_limit('tr-rl-2', 1, interval '1 minute') then raise exception 'Independent key denied'; end if;

  -- invalid input rejected
  begin perform public.check_rate_limit('', 1, interval '1 minute'); raise exception 'Empty key accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.check_rate_limit('tr-rl-1', 0, interval '1 minute'); raise exception 'Zero limit accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.check_rate_limit('tr-rl-1', 1, interval '0'); raise exception 'Zero window accepted'; exception when sqlstate '22023' then null; end;

  -- clients have no direct table access
  begin
    perform 1 from public.rate_limit_events limit 1;
    raise exception 'Anon can read rate_limit_events';
  exception when insufficient_privilege then null; end;
end $$;

-- window expiry resets the counter (backdate the events as the table owner)
reset role;
update public.rate_limit_events
set occurred_at = clock_timestamp() - interval '10 minutes'
where key = 'tr-rl-1';

set local role anon;
do $$ begin
  if not public.check_rate_limit('tr-rl-1', 3, interval '1 minute') then
    raise exception 'Window expiry did not reset the limit';
  end if;
end $$;

-- authenticated callers share the same path
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000300',true);
do $$ begin
  if not public.check_rate_limit('tr-rl-auth', 1, interval '1 minute') then
    raise exception 'Authenticated call denied';
  end if;
end $$;

reset role;
rollback;
