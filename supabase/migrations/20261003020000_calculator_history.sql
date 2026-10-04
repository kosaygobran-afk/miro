-- Calculator history tracking
-- 1. Create calculator_history table
-- 2. Create record_calculator_history RPC
-- 3. Create clear_calculator_history RPC

-- ============================================================
-- 1. Create calculator_history table
-- ============================================================

create table if not exists public.calculator_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expression text not null check (char_length(expression) between 1 and 200),
  result numeric(24,6) not null,
  context_path text null check (context_path is null or char_length(context_path) <= 200),
  created_at timestamptz not null default now()
);



-- Indexes
create index if not exists idx_calculator_history_user_id_created_at_desc
  on public.calculator_history(user_id, created_at desc);

-- RLS and permissions
alter table public.calculator_history enable row level security;

-- Policy: users can only see their own calculator history
create policy "Users can view own calculator history" on public.calculator_history
  for select to authenticated
  using (user_id = auth.uid() and public.active_app_role() in ('admin','ceo'));

-- No direct access for authenticated - only via RPCs
revoke all on public.calculator_history from public;
revoke all on public.calculator_history from anon, authenticated;
grant all on public.calculator_history to service_role;

-- Comment
comment on table public.calculator_history is
'History of calculator computations performed in management console.';

-- ============================================================
-- 2. Create record_calculator_history RPC
-- ============================================================

-- Drop existing function if it exists (different signature)
drop function if exists public.record_calculator_history(text, numeric, text);

create function public.record_calculator_history(
  p_expression text,
  p_result numeric,
  p_context_path text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_caller_user_id uuid;
  v_history_id uuid;
  v_expression_text text := nullif(btrim(coalesce(p_expression, '')), '');
  v_context_path_text text := nullif(btrim(coalesce(p_context_path, '')), '');
begin
  -- Capture caller before any SECURITY DEFINER context shifts
  v_caller_user_id := auth.uid();

  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Validate expression
  if v_expression_text is null or char_length(v_expression_text) < 1 or char_length(v_expression_text) > 200 then
    raise exception 'Expression must be 1-200 characters' using errcode = '22023';
  end if;

  -- Validate result
  if p_result is null or p_result = 'NaN'::numeric or p_result = 'Infinity'::numeric or p_result = '-Infinity'::numeric then
    raise exception 'Result must be a finite number' using errcode = '22023';
  end if;

  -- Validate context_path
  if v_context_path_text is not null and char_length(v_context_path_text) > 200 then
    raise exception 'Context path must not exceed 200 characters' using errcode = '22023';
  end if;

  -- Insert history record
  insert into public.calculator_history (
    user_id, expression, result, context_path, created_at
  ) values (
    v_caller_user_id, v_expression_text, p_result, v_context_path_text, timezone('utc'::text, now())
  ) returning id into v_history_id;

  -- Enforce per-user retention of approximately 100 rows
  -- Delete oldest records beyond the limit for this user
  WITH ranked_history AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
    FROM public.calculator_history
    WHERE user_id = v_caller_user_id
  )
  DELETE FROM public.calculator_history
  USING ranked_history
  WHERE public.calculator_history.id = ranked_history.id
    AND ranked_history.rn > 100;

  -- Audit event
  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('calculator_calculation_recorded', auth.uid(),
    jsonb_build_object(
      'history_id', v_history_id,
      'expression', v_expression_text,
      'result', p_result,
      'source', 'management_calculator'
    ),
    'calculator_history', v_history_id
  );

  return v_history_id;
end;
$$;

revoke all on function public.record_calculator_history(text,numeric,text) from public;
grant execute on function public.record_calculator_history(text,numeric,text) to authenticated;

comment on function public.record_calculator_history is
'Records a calculator computation in history. Admin/CEO only. Expression: 1-200 chars. Result: finite numeric. Context path: optional <= 200 chars. Returns history ID.';

-- ============================================================
-- 3. Create clear_calculator_history RPC
-- ============================================================

-- Drop existing function if it exists (different signature)
drop function if exists public.clear_calculator_history();

create function public.clear_calculator_history() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_caller_user_id uuid;
  v_deleted_count integer;
begin
  -- Capture caller before any SECURITY DEFINER context shifts
  v_caller_user_id := auth.uid();

  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Delete history records for the current user
  DELETE FROM public.calculator_history
  WHERE user_id = v_caller_user_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Audit event
  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('calculator_history_cleared', auth.uid(),
    jsonb_build_object(
      'deleted_count', v_deleted_count
    ),
    'calculator_history', null
  );

  return v_deleted_count;
end;
$$;

revoke all on function public.clear_calculator_history() from public;
grant execute on function public.clear_calculator_history() to authenticated;

-- Add get_calculator_history RPC for reading history
drop function if exists public.get_calculator_history(integer);
create or replace function public.get_calculator_history(p_limit int default 20)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  -- Clamp limit between 1 and 50
  v_limit := greatest(1, least(50, p_limit));

  return query
  select jsonb_build_object(
    'id', id,
    'expression', expression,
    'result', result,
    'context_path', context_path,
    'created_at', created_at
  )
  from public.calculator_history
  where user_id = auth.uid()
  order by created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_calculator_history(integer) from public;
grant execute on function public.get_calculator_history(integer) to authenticated;

comment on function public.get_calculator_history is
'Returns calculator history for the current user. Admin/CEO only. p_limit: number of records to return (clamped 1-50).';