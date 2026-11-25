begin;

-- Trigger entry points run through their installed triggers. Callers of
-- ordinary RPCs and helpers used by RLS still need their respective grants.
revoke execute on function
  public.categories_guard_deactivation(),
  public.categories_guard_two_levels(),
  public.categories_prevent_parent_cycle(),
  public.commerce_guard_reserved_stock(),
  public.commerce_snapshot_business_identity(),
  public.handle_new_user(),
  public.product_variants_guard_last_sellable(),
  public.products_enforce_insert_draft(),
  public.products_guard_active_integrity(),
  public.products_guard_category_hierarchy(),
  public.service_requests_guard_insert(),
  public.service_requests_guard_product_variant()
from public, anon, authenticated;

-- Hosted Supabase installs this event trigger outside our migrations.
-- Its owner still executes it when tables are created.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc
    where oid = to_regprocedure('public.rls_auto_enable()')
      and prorettype = 'event_trigger'::regtype
  ) then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated;
  end if;
end;
$$;

commit;
