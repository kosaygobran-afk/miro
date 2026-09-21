-- Trusted authorization comes from user_roles, never editable profile metadata.
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists full_name text;

create or replace function public.active_app_role()
returns text language sql stable security definer set search_path = '' as $$
  select r.role from public.user_roles r join public.profiles p on p.id = r.user_id
  where r.user_id = auth.uid() and p.account_status = 'active';
$$;
revoke all on function public.active_app_role() from public;
grant execute on function public.active_app_role() to authenticated;

-- A row ownership policy alone must not allow changing role or suspension.
revoke insert, update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated
using (id = auth.uid() and account_status = 'active') with check (id = auth.uid());
create policy "Management reads profiles" on public.profiles for select to authenticated
using (public.active_app_role() in ('admin', 'ceo'));
create policy "Management reads roles" on public.user_roles for select to authenticated
using (public.active_app_role() in ('admin', 'ceo'));

-- Remove older permissive policies: PostgreSQL ORs multiple permissive policies.
drop policy if exists "Public product catalog is readable" on public.products;
drop policy if exists "Users can create checkout orders" on public.orders;
drop policy if exists "Users can update their own orders" on public.orders;
revoke insert, update, delete on public.orders, public.order_items from anon, authenticated;

create or replace function public.manage_account(target uuid, new_role text default null, new_status text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text; target_role text;
begin
  -- Serialize role changes so target checks and audit are atomic.
  perform pg_advisory_xact_lock(20260921);
  actor_role := public.active_app_role();
  if actor_role is null or actor_role not in ('admin', 'ceo') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select role into target_role from public.user_roles where user_id = target for update;
  if target_role is null then raise exception 'Unknown account' using errcode = '22023'; end if;
  if target = auth.uid() or target_role = 'ceo' then raise exception 'Protected account' using errcode = '42501'; end if;
  if new_role is not null and new_role not in ('customer', 'worker', 'admin') then raise exception 'Invalid role' using errcode = '22023'; end if;
  if new_status is not null and new_status not in ('active', 'suspended', 'blocked') then raise exception 'Invalid status' using errcode = '22023'; end if;
  if new_role is null and new_status is null then raise exception 'Empty change' using errcode = '22023'; end if;
  if actor_role <> 'ceo' and (target_role = 'admin' or new_role = 'admin' or new_status is not null) then raise exception 'CEO required' using errcode = '42501'; end if;
  if new_role is not null then
    update public.user_roles set role = new_role where user_id = target;
    update public.profiles set role = new_role where id = target;
  end if;
  if new_status is not null then
    update public.profiles set account_status = new_status, suspended_at = case when new_status = 'active' then null else now() end where id = target;
  end if;
  insert into public.audit_events(action,user_id,details) values ('account_control',auth.uid(),jsonb_build_object('target_user_id',target,'role',new_role,'status',new_status));
end;
$$;
revoke all on function public.manage_account(uuid,text,text) from public;
grant execute on function public.manage_account(uuid,text,text) to authenticated;

alter table public.service_requests add column if not exists assigned_worker_id uuid references auth.users(id) on delete set null;
create index if not exists service_requests_assigned_worker_idx on public.service_requests(assigned_worker_id);
drop policy if exists "Authenticated users can create requests" on public.service_requests;
create policy "Authenticated users can create requests" on public.service_requests for insert to authenticated
with check (customer_id = auth.uid() and public.active_app_role() is not null and status = 'new' and assigned_worker_id is null);
create policy "Staff reads requests" on public.service_requests for select to authenticated
using (public.active_app_role() in ('admin','ceo') or (public.active_app_role() = 'worker' and assigned_worker_id = auth.uid()));

create or replace function public.update_service_request(target uuid, new_status text, worker uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text; assigned uuid;
begin
  actor_role := public.active_app_role();
  select assigned_worker_id into assigned from public.service_requests where id = target for update;
  if not found then raise exception 'Unknown request' using errcode = '22023'; end if;
  if actor_role is null or not (actor_role in ('admin','ceo') or (actor_role = 'worker' and assigned = auth.uid())) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if new_status not in ('new','in_progress','closed','spam') or new_status is null then raise exception 'Invalid status' using errcode = '22023'; end if;
  if actor_role = 'worker' and (worker is not null or new_status not in ('in_progress','closed')) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if worker is not null and not exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id where r.user_id = worker and r.role = 'worker' and p.account_status = 'active') then raise exception 'Invalid worker' using errcode = '22023'; end if;
  update public.service_requests set status = new_status, assigned_worker_id = case when actor_role = 'worker' then assigned else worker end where id = target;
  insert into public.audit_events(action,user_id,details) values ('request_update',auth.uid(),jsonb_build_object('request_id',target,'status',new_status,'worker_id',worker));
end;
$$;
revoke all on function public.update_service_request(uuid,text,uuid) from public;
grant execute on function public.update_service_request(uuid,text,uuid) to authenticated;

-- Existing users get customer access only; privileged roles require owner provisioning.
insert into public.user_roles(user_id,role) select id,'customer' from public.profiles on conflict (user_id) do nothing;
