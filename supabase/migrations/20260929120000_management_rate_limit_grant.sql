-- Management GET routes use the server-only service-role client to consume
-- rate-limit buckets. The limiter itself is SECURITY DEFINER, so the server
-- role needs function execution only; it does not need client-visible table
-- access beyond the service-role grant already defined by the base migration.
grant execute on function public.check_rate_limit(text, integer, interval)
  to service_role;
