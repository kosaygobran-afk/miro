-- Close direct-write paths for service_requests: route all intake through RPC.
-- This migration:
-- 1. Creates create_service_request RPC for public/anonymous enquiry intake
-- 2. Revokes direct INSERT grant from anon (authenticated customers keep self-service via policy)
-- 3. Updates RLS policy to remove anon direct insert; keeps authenticated customer self-service
-- 4. The RPC enforces all validation, rate limiting (via check_rate_limit), and audit logging

-- ============================================================
-- 1. Public enquiry intake RPC (SECURITY DEFINER, executable by anon)
-- ============================================================

create or replace function public.create_service_request(
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_locale text,
  p_source text,
  p_product_id uuid default null,
  p_variant_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_rate_limit_key text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_rl_key text := coalesce(p_rate_limit_key, 'anon:' || md5(concat_ws(':', p_email, p_message, clock_timestamp()::text)));
begin
  -- Rate limit check FIRST (sliding window: 5/min, 30/hour per key)
  -- This ensures even invalid requests count towards the limit, preventing
  -- validation probing attacks and matching the original API behavior.
  if not public.check_rate_limit(v_rl_key, 5, interval '1 minute') then
    raise exception 'Rate limited (1m)' using errcode = '42001';
  end if;
  if not public.check_rate_limit(v_rl_key, 30, interval '1 hour') then
    raise exception 'Rate limited (1h)' using errcode = '42001';
  end if;

  -- Validate required fields (defense in depth; API layer also validates)
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 200 then
    raise exception 'Invalid name' using errcode = '22023';
  end if;
  if p_email is null or length(trim(p_email)) = 0 or length(p_email) > 320 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  if p_phone is not null and length(p_phone) > 50 then
    raise exception 'Phone too long' using errcode = '22023';
  end if;
  if p_message is null or length(trim(p_message)) = 0 or length(p_message) > 5000 then
    raise exception 'Invalid message' using errcode = '22023';
  end if;
  if p_source is null or length(trim(p_source)) = 0 or length(p_source) > 64 then
    raise exception 'Invalid source' using errcode = '22023';
  end if;
  if p_locale is not null and p_locale not in ('he','en') then
    raise exception 'Invalid locale' using errcode = '22023';
  end if;
  if p_metadata is not null and octet_length(p_metadata::text) > 8192 then
    raise exception 'Metadata too large' using errcode = '22023';
  end if;

  -- Validate product/variant relationship if both provided
  if p_product_id is not null and p_variant_id is not null then
    if not exists (
      select 1 from public.product_variants v
      where v.id = p_variant_id and v.product_id = p_product_id
    ) then
      raise exception 'Variant does not belong to the referenced product' using errcode = '22023';
    end if;
  end if;

  -- Insert the service request (status forced to 'new', assigned_to forced to NULL)
  insert into public.service_requests (
    name, email, phone, message, locale, source,
    product_id, variant_id, metadata, status, assigned_to
  ) values (
    trim(p_name),
    lower(trim(p_email)),
    nullif(trim(p_phone), ''),
    trim(p_message),
    p_locale,
    p_source,
    p_product_id,
    p_variant_id,
    p_metadata,
    'new',
    null
  ) returning id into v_request_id;

  -- Audit log
  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values (
    'service_request_created',
    null, -- anon has no auth.uid()
    jsonb_build_object(
      'source', p_source,
      'product_id', p_product_id,
      'variant_id', p_variant_id,
      'locale', p_locale,
      'rate_limit_key', v_rl_key
    ),
    'service_request',
    v_request_id
  );

  return v_request_id;
end;
$$;

revoke all on function public.create_service_request(text,text,text,text,text,text,uuid,uuid,jsonb,text) from public;
grant execute on function public.create_service_request(text,text,text,text,text,text,uuid,uuid,jsonb,text) to anon, authenticated;

comment on function public.create_service_request is
  'Public/anonymous service request intake. Validates all fields, enforces rate limits (5/min, 30/hour per key), forces status=new and assigned_to=NULL, validates product/variant relationship, and audits creation. Returns the new request ID.';

-- ============================================================
-- 2. Revoke direct INSERT grant from anon
--    (Authenticated customers retain self-service via existing policy)
-- ============================================================

revoke insert on public.service_requests from anon;

-- ============================================================
-- 3. Update RLS policy: remove anon from direct insert policy
--    Keep authenticated customer self-service policy intact
-- ============================================================

drop policy if exists "Anyone can submit contact requests" on public.service_requests;
create policy "Authenticated customers can create requests" on public.service_requests
  for insert to authenticated
  with check (
    public.active_app_role() is not null
    and customer_id = auth.uid()
    and status = 'new'
    and assigned_to is null
    and length(name) between 1 and 200
    and length(email) between 1 and 320
    and (phone is null or length(phone) <= 50)
    and length(message) between 1 and 5000
    and length(source) <= 64
    and (locale is null or locale in ('he','en'))
    and octet_length(metadata::text) <= 8192
  );

-- Note: The "Authenticated users can create requests" policy from 20260927220000
-- already exists and requires customer_id = auth.uid() and active_app_role() is not null
-- and status = 'new' and assigned_to is null. This policy is for authenticated customers
-- creating requests for themselves (e.g., from account dashboard).

-- ============================================================
-- 4. Remove execute grant on active_app_role() from anon
--    (No longer needed since anon cannot directly insert)
-- ============================================================

revoke execute on function public.active_app_role() from anon;

-- ============================================================
-- 5. Ensure the guard trigger still handles edge cases
--    (defense in depth for any service_role direct writes)
-- ============================================================

-- The existing service_requests_guard_insert trigger remains as a backstop
-- for any direct service_role writes that might bypass the RPC.