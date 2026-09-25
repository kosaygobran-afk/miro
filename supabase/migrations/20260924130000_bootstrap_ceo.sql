-- Bootstrap initial CEO account: kosay.gobran@gmail.com
-- This migration is idempotent and safe to re-run.
-- If the account does not exist yet in auth.users, this is a harmless no-op.
-- The owner must sign up first (via /he/signup or /en/signup, verify email),
-- then this migration can be re-run, or an existing CEO can use add_ceo().
-- Nothing else in the system grants the ceo role except add_ceo (audited flow),
-- so the initial CEO set is exactly this bootstrap plus CEO-added CEOs.

-- First, ensure profiles.role check constraint includes 'ceo' (may be missing from earlier migrations)
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('customer', 'worker', 'admin', 'ceo'));

do $$
declare
  target_user_id uuid;
begin
  -- Find the user by email (case-insensitive)
  select id into target_user_id
  from auth.users
  where lower(email) = lower('kosay.gobran@gmail.com')
  limit 1;

  if target_user_id is null then
    -- Account does not exist yet. No-op with notice.
    raise notice 'Bootstrap CEO: user kosay.gobran@gmail.com not found in auth.users. Owner must sign up first, then re-run this migration or use add_ceo().';
    return;
  end if;

  -- Ensure user_roles row exists with ceo role (upsert)
  insert into public.user_roles (user_id, role)
  values (target_user_id, 'ceo')
  on conflict (user_id) do update
  set role = 'ceo', updated_at = timezone('utc'::text, now())
  where public.user_roles.role is distinct from 'ceo';

  -- Ensure profiles.role is also 'ceo' for consistency with admin UI
  update public.profiles
  set role = 'ceo', updated_at = timezone('utc'::text, now())
  where id = target_user_id and role is distinct from 'ceo';

  -- Ensure account_status is active
  update public.profiles
  set account_status = 'active', suspended_at = null, updated_at = timezone('utc'::text, now())
  where id = target_user_id and account_status is distinct from 'active';

  raise notice 'Bootstrap CEO: user % (%s) ensured as CEO', target_user_id, 'kosay.gobran@gmail.com';
end
$$;