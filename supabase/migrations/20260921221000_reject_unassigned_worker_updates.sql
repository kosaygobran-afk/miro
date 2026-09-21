-- Explicitly reject a NULL assignment; SQL three-valued logic must fail closed.
create or replace function public.update_service_request(target uuid, new_status text, worker uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text; assigned uuid;
begin
  actor_role := public.active_app_role();
  select assigned_worker_id into assigned from public.service_requests where id = target for update;
  if not found then raise exception 'Unknown request' using errcode = '22023'; end if;
  if actor_role is null or not (actor_role in ('admin','ceo') or (actor_role = 'worker' and assigned is not null and assigned = auth.uid())) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if new_status not in ('new','in_progress','closed','spam') or new_status is null then raise exception 'Invalid status' using errcode = '22023'; end if;
  if actor_role = 'worker' and (worker is not null or new_status not in ('in_progress','closed')) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if worker is not null and not exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id where r.user_id = worker and r.role = 'worker' and p.account_status = 'active') then raise exception 'Invalid worker' using errcode = '22023'; end if;
  update public.service_requests set status = new_status, assigned_worker_id = case when actor_role = 'worker' then assigned else worker end where id = target;
  insert into public.audit_events(action,user_id,details) values ('request_update',auth.uid(),jsonb_build_object('request_id',target,'status',new_status,'worker_id',worker));
end;
$$;
revoke all on function public.update_service_request(uuid,text,uuid) from public;
grant execute on function public.update_service_request(uuid,text,uuid) to authenticated;
