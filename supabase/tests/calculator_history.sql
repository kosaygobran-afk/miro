-- Calculator history tests
-- Run against an isolated migrated database. All fixtures are rolled back.
begin;

-- ============================================================
-- Fixtures
-- ============================================================

-- Create test users with roles
insert into auth.users(id, raw_user_meta_data) values
('00000000-0000-0000-0000-000000000250', '{"full_name":"Customer"}'),
('00000000-0000-0000-0000-000000000251', '{"full_name":"Worker"}'),
('00000000-0000-0000-0000-000000000252', '{"full_name":"Admin"}'),
('00000000-0000-0000-0000-000000000253', '{"full_name":"CEO"}');

update public.user_roles set role='worker' where user_id='00000000-0000-0000-0000-000000000251';
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000252';
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000253';

-- ============================================================
-- 1. Admin records + reads own history via record_calculator_history; audit row created
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000252',true); -- Admin

do $$
declare
  v_history_id uuid;
begin
  v_history_id := public.record_calculator_history(
    '2 + 2',
    4,
    'test-context'
  );

  if v_history_id is null then raise exception 'History ID not returned'; end if;
end $$;

-- Verify as service_role (has SELECT on table)
set local role service_role;
do $$
declare
  v_count integer;
  v_record record;
begin
  select count(*) into v_count from public.calculator_history where user_id = '00000000-0000-0000-0000-000000000252'::uuid;
  if v_count <> 1 then raise exception 'Expected exactly one history record for admin'; end if;

  select * into v_record from public.calculator_history where user_id = '00000000-0000-0000-0000-000000000252'::uuid;
  if v_record.expression <> '2 + 2' then raise exception 'Expression mismatch'; end if;
  if v_record.result <> 4 then raise exception 'Result mismatch'; end if;
  if v_record.context_path <> 'test-context' then raise exception 'Context path mismatch'; end if;

  -- Check audit event
  select count(*) into v_count from public.audit_events
  where action = 'calculator_calculation_recorded'
    and entity_id = v_record.id
    and details->>'expression' = '2 + 2'
    and details->>'result' = '4'
    and details->>'source' = 'management_calculator';
  if v_count <> 1 then raise exception 'Calculator audit event missing or mismatched'; end if;
end $$;

-- ============================================================
-- 2. CEO can also record and clear
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000253',true); -- CEO

do $$
declare
  v_history_id uuid;
begin
  v_history_id := public.record_calculator_history(
    '10 * 5',
    50,
    'another-context'
  );

  if v_history_id is null then raise exception 'History ID not returned for CEO'; end if;
end $$;

set local role service_role;
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.calculator_history where user_id = '00000000-0000-0000-0000-000000000253'::uuid;
  if v_count <> 1 then raise exception 'Expected exactly one history record for CEO'; end if;
end $$;

-- Clear history (still authenticated CEO)
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000253',true); -- CEO

do $$
declare
  v_dummy integer;
begin
  v_dummy := public.clear_calculator_history();
end $$;

-- Verify cleared as service_role
set local role service_role;
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.calculator_history where user_id = '00000000-0000-0000-0000-000000000253'::uuid;
  if v_count <> 0 then raise exception 'History not cleared for CEO'; end if;

  -- Check audit event for clear
  select count(*) into v_count from public.audit_events
  where action = 'calculator_history_cleared'
    and details->>'deleted_count' = '1';
  if v_count <> 1 then raise exception 'Clear audit event missing or incorrect count'; end if;
end $$;

-- ============================================================
-- 3. Anon denied
-- ============================================================
set local role anon;
do $$ begin
  begin
    perform public.record_calculator_history('1+1', 2, null);
    raise exception 'Anon allowed to record calculator history';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
do $$ begin
  begin
    perform public.clear_calculator_history();
    raise exception 'Anon allowed to clear calculator history';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- 4. Non-admin role denied (worker, customer)
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000250',true); -- Customer
do $$ begin
  begin
    perform public.record_calculator_history('1+1', 2, null);
    raise exception 'Customer allowed to record calculator history';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000251',true); -- Worker
do $$ begin
  begin
    perform public.record_calculator_history('1+1', 2, null);
    raise exception 'Worker allowed to record calculator history';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000250',true); -- Customer
do $$ begin
  begin
    perform public.clear_calculator_history();
    raise exception 'Customer allowed to clear calculator history';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000251',true); -- Worker
do $$ begin
  begin
    perform public.clear_calculator_history();
    raise exception 'Worker allowed to clear calculator history';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- 5. Expression >200 chars rejected
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000252',true); -- Admin
do $$ begin
  begin
    perform public.record_calculator_history(
      repeat('x', 201), -- 201 characters
      0,
      null
    );
    raise exception 'Expression >200 chars allowed';
  exception when sqlstate '22023' then null; end;
end $$;

-- ============================================================
-- 6. get_calculator_history isolation (admin A cannot read admin B rows)
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000252',true); -- Admin A
do $$
declare
  v_history_id uuid;
begin
  -- Admin A records a calculation
  v_history_id := public.record_calculator_history(
    '2 + 2',
    4,
    'admin-a-context'
  );
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000253',true); -- Admin B (CEO)
do $$
declare
  v_history jsonb;
  v_count integer;
begin
  -- Admin B tries to get history - should not see Admin A's record
  v_history := public.get_calculator_history(100);
  select count(*) into v_count from jsonb_array_elements(v_history) as h(value);
  if v_count <> 0 then
    raise exception 'Admin B could see Admin A\'s history';
  end if;
end $$;

-- ============================================================
-- 7. Retention cap (should keep only ~100 records)
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000252',true); -- Admin
do $$
declare
  i integer;
  v_history_id uuid;
begin
  -- Insert 150 records
  for i in 1..150 loop
    v_history_id := public.record_calculator_history(
      '1 + ' || i,
      1 + i,
      'retention-test-' || i
    );
  end loop;

  -- Check that we have approximately 100 records (should be 100 due to retention policy)
  select count(*) into v_count from public.calculator_history where user_id = '00000000-0000-0000-0000-000000000252'::uuid;
  if v_count > 100 then
    raise exception 'Retention cap not working: ' || v_count || ' records kept (max 100 expected)';
  end if;
  if v_count < 90 then  // Allow some flexibility
    raise exception 'Too many records deleted: ' || v_count || ' records kept';
  end if;
end $$;

-- ============================================================
-- 8. get_calculator_history returns correct data and order
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000252',true); -- Admin
do $$
declare
  v_history_id1 uuid;
  v_history_id2 uuid;
  v_history jsonb;
  v_first_expression text;
  v_second_expression text;
begin
  -- Insert two records with a delay to ensure different timestamps
  v_history_id1 := public.record_calculator_history(
    'first calculation',
    100,
    'first-context'
  );

  -- Small delay to ensure different timestamps
  perform pg_sleep(0.1);

  v_history_id2 := public.record_calculator_history(
    'second calculation',
    200,
    'second-context'
  );

  -- Get history
  v_history := public.get_calculator_history(10);

  -- Check we got 2 records
  select count(*) into v_count from jsonb_array_elements(v_history) as h(value);
  if v_count <> 2 then
    raise exception 'Expected 2 history records, got ' || v_count;
  end if;

  -- Check that the most recent record is first (descending order)
  v_first_expression := (v_history->0) #>> '{expression}';
  v_second_expression := (v_history->1) #>> '{expression}';

  if v_first_expression <> 'second calculation' then
    raise exception 'Most recent record should be first, got "' || v_first_expression || '"';
  end if;

  if v_second_expression <> 'first calculation' then
    raise exception 'Second most recent record should be second, got "' || v_second_expression || '"';
  end if;
end $$;

-- ============================================================
-- 9. get_calculator_history limit clamping
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000252',true); -- Admin
do $$
declare
  v_history jsonb;
  v_count integer;
begin
  -- Test limit < 1 (should be clamped to 1)
  v_history := public.get_calculator_history(0);
  select count(*) into v_count from jsonb_array_elements(v_history) as h(value);
  if v_count <> 1 then
    raise exception 'Limit 0 should be clamped to 1, got ' || v_count;
  end if;

  -- Test limit > 50 (should be clamped to 50)
  v_history := public.get_calculator_history(100);
  select count(*) into v_count from jsonb_array_elements(v_history) as h(value);
  if v_count > 50 then
    raise exception 'Limit 100 should be clamped to 50, got ' || v_count;
  end if;
end $$;

-- ============================================================
-- Cleanup
-- ============================================================
reset role;
rollback;