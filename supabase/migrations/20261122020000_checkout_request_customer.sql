-- Checkout uses a service-only writer after the storefront validates the catalog.
-- The customer, request fingerprint, request row and audit event agree atomically.
alter table public.service_requests
  add column checkout_payload_hash text
  check (checkout_payload_hash is null or checkout_payload_hash ~ '^[0-9a-f]{64}$');

create function public.record_checkout_request(
  p_submission_id uuid,
  p_payload_hash text,
  p_customer_id uuid,
  p_request jsonb default null,
  p_rate_limit_key text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  previous_request public.service_requests%rowtype;
  checkout jsonb := p_request->'checkout';
  fulfillment text := checkout->>'fulfillment';
begin
  if p_submission_id is null or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid checkout reference' using errcode = '22023';
  end if;

  if p_request is not null then
    perform pg_advisory_xact_lock(hashtextextended('checkout-request:' || p_submission_id::text, 0));
  end if;
  select * into previous_request from public.service_requests where id = p_submission_id;
  if found then
    if previous_request.source <> 'checkout_page'
      or previous_request.checkout_payload_hash is distinct from p_payload_hash
      or previous_request.customer_id is distinct from p_customer_id then
      raise exception 'Checkout reference conflict' using errcode = 'PT409';
    end if;
    return previous_request.id;
  end if;
  -- An absent payload is a read-only replay lookup. Validate stock only for a
  -- new submission so a lost response can be recovered after stock changes.
  if p_request is null then return null; end if;

  if p_customer_id is not null then
    perform 1
    from public.profiles p join public.user_roles r on r.user_id = p.id
    where p.id = p_customer_id and p.account_status = 'active' and r.role = 'customer'
    for share of p, r;
    if not found then
      raise exception 'Checkout customer unavailable' using errcode = '42501';
    end if;
  end if;

  if p_rate_limit_key is null or length(p_rate_limit_key) > 200
     or octet_length(p_request::text) > 131072
     or coalesce(length(btrim(p_request->>'name')), 0) not between 1 and 120
     or coalesce(length(btrim(p_request->>'email')), 0) not between 1 and 254
     or p_request->>'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(length(btrim(p_request->>'phone')), 0) not between 1 and 40
     or coalesce(length(btrim(p_request->>'message')), 0) not between 1 and 2000
     or coalesce(p_request->>'locale', '') not in ('he','en')
     or coalesce(fulfillment, '') not in ('delivery','pickup')
     or jsonb_typeof(checkout->'cart') is distinct from 'array'
     or checkout->'payment_collected' is distinct from 'false'::jsonb then
    raise exception 'Invalid verified checkout request' using errcode = '22023';
  end if;

  if jsonb_array_length(checkout->'cart') not between 1 and 100
    or (fulfillment = 'pickup' and checkout ? 'shipping')
    or (fulfillment = 'delivery' and (
      coalesce(length(btrim(checkout#>>'{shipping,address}')), 0) not between 1 and 240
      or coalesce(length(btrim(checkout#>>'{shipping,city}')), 0) not between 1 and 120
      or coalesce(length(btrim(checkout#>>'{shipping,postalCode}')), 0) > 20
    )) then
    raise exception 'Invalid checkout fulfillment' using errcode = '22023';
  end if;

  if not public.check_rate_limit(p_rate_limit_key, 5, interval '1 minute')
    or not public.check_rate_limit(p_rate_limit_key, 30, interval '1 hour') then
    raise exception 'Rate limited' using errcode = '42001';
  end if;

  insert into public.service_requests (
    id, customer_id, name, email, phone, message, locale, source,
    metadata, status, assigned_to, checkout_payload_hash
  ) values (
    p_submission_id, p_customer_id, btrim(p_request->>'name'),
    lower(btrim(p_request->>'email')), btrim(p_request->>'phone'),
    btrim(p_request->>'message'), p_request->>'locale', 'checkout_page',
    jsonb_build_object('checkout', checkout), 'new', null, p_payload_hash
  );

  insert into public.audit_events(action,user_id,details,entity_type,entity_id)
  values (
    'service_request_created',p_customer_id,
    jsonb_build_object('source','checkout_page','locale',p_request->>'locale',
      'fulfillment',fulfillment),
    'service_request',p_submission_id
  );
  return p_submission_id;
end;
$$;

revoke all on function public.record_checkout_request(uuid,text,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.record_checkout_request(uuid,text,uuid,jsonb,text) to service_role;
