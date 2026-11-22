-- Apply after the storefront uses record_checkout_request on the public deployment.
create policy "Direct inserts cannot claim storefront checkout" on public.service_requests
  as restrictive for insert to authenticated
  with check (source <> 'checkout_page' and checkout_payload_hash is null);

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
  if p_source = 'checkout_page' then
    raise exception 'Checkout must be verified by the storefront' using errcode = '42501';
  end if;
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
