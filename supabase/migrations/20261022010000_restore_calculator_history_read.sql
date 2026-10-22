-- Some linked databases recorded the original calculator migration before its
-- read RPC was added. Restore it in a new migration; never edit applied history.
-- Direct table access remains revoked. Only an active admin/CEO may read their
-- own history through this session-bound RPC.
create or replace function public.get_calculator_history(p_limit integer default 20)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.active_app_role();
begin
  if v_user_id is null or v_role is null or v_role not in ('admin', 'ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
    'id', h.id,
    'expression', h.expression,
    'result', h.result,
    'context_path', h.context_path,
    'created_at', h.created_at
  )
  from public.calculator_history as h
  where h.user_id = v_user_id
  order by h.created_at desc, h.id desc
  limit greatest(1, least(50, coalesce(p_limit, 20)));
end;
$$;

revoke all on function public.get_calculator_history(integer) from public, anon;
grant execute on function public.get_calculator_history(integer) to authenticated;

comment on function public.get_calculator_history(integer) is
'Returns only the active admin/CEO caller''s calculator history, newest first; limit defaults to 20 and is clamped to 1-50.';

notify pgrst, 'reload schema';
