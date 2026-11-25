begin;
set local lock_timeout = '5s';
set local search_path = pg_catalog;

-- Cache request identity per statement where it does not depend on the row.
alter policy "Users can view their own audit events" on public.audit_events
  using (user_id = (select auth.uid()));

alter policy "Users can view own calculator history" on public.calculator_history
  using (user_id = (select auth.uid()) and (select public.active_app_role()) in ('admin', 'ceo'));

alter policy "Users can manage their own cart" on public.carts
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Users can manage their own cart items" on public.cart_items
  using (exists (
    select 1 from public.carts c
    where c.id = cart_items.cart_id and c.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.carts c
    where c.id = cart_items.cart_id and c.user_id = (select auth.uid())
  ));

alter policy "Users view their invoices" on public.invoices
  using (user_id = (select auth.uid()));

alter policy "Users can update their own profile" on public.profiles
  using (id = (select auth.uid()) and account_status = 'active')
  with check (id = (select auth.uid()));

-- Linked projects have visibility-aware saved-product policies. Fresh local
-- databases still have the original owner-only policy. Keep both contracts.
do $$
begin
  if exists (
    select 1 from pg_policy
    where polrelid = 'public.saved_products'::regclass
      and polname = 'Users manage their saved products'
  ) then
    alter policy "Users manage their saved products" on public.saved_products
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  else
    alter policy "Users read their saved products" on public.saved_products
      using (user_id = (select auth.uid()) and public.catalog_product_visible(product_id));
    alter policy "Users remove their saved products" on public.saved_products
      using (user_id = (select auth.uid()));
    alter policy "Users save visible products" on public.saved_products
      with check (user_id = (select auth.uid()) and public.catalog_product_visible(product_id));
  end if;
end;
$$;

-- The stricter customer insert policy is a subset of the existing owner-only
-- insert policy. The separate restrictive checkout policy still applies.
drop policy "Authenticated customers can create requests" on public.service_requests;
alter policy "Authenticated users can create requests" on public.service_requests
  with check (
    customer_id = (select auth.uid())
    and (select public.active_app_role()) is not null
    and status = 'new'
    and assigned_to is null
  );

-- Effective SELECT was the public rule OR the staff rule for authenticated
-- members. Keep both predicates from the installed policies because linked
-- catalog visibility, scheduling, and promotion audiences differ from source.
-- Keep the anonymous rule separate so it needs no grants on staff helpers.
-- Keep staff writes operation-specific and based on their original predicates.
do $$
declare
  policy_pair record;
  table_oid regclass;
  authenticated_role oid := 'authenticated'::regrole;
  public_using text;
  staff_using text;
  staff_check text;
  staff_command "char";
begin
  for policy_pair in
    select * from (values
      ('order_items', 'Users can view order items for their own orders', 'Management reads order items'),
      ('orders', 'Users can see their own orders', 'Management reads orders'),
      ('product_promo_badges', 'Public reads active product badges', 'Management manages product badges'),
      ('product_public_promotions', 'Public reads active product promotions', 'Management manages product promotions'),
      ('profiles', 'Users can view their own profile', 'Management reads profiles'),
      ('promo_badge_types', 'Public reads active badge types', 'Management manages badge types'),
      ('service_requests', 'Users can view their own requests', 'Staff reads requests'),
      ('services', 'Public can view active services', 'Management manages services'),
      ('storefront_rail_items', 'Public reads active rail items', 'Management manages rail items'),
      ('user_roles', 'Users can view their own role', 'Management reads roles')
    ) as pairs(table_name, public_policy, staff_policy)
  loop
    table_oid := format('public.%I', policy_pair.table_name)::regclass;
    if exists (
      select 1 from pg_roles r
      where not (r.rolsuper or r.rolbypassrls)
        and r.oid <> (select relowner from pg_class where oid = table_oid)
        and (has_table_privilege(r.oid, table_oid, 'SELECT')
          or has_any_column_privilege(r.oid, table_oid, 'SELECT'))
        and not pg_has_role(r.oid, 'anon', 'USAGE')
        and not pg_has_role(r.oid, 'pg_read_all_data', 'USAGE')
        and not pg_has_role(r.oid, authenticated_role, 'USAGE')
    ) then
      raise exception 'Unreviewed SELECT role on %', table_oid;
    end if;
    select pg_get_expr(polqual, polrelid) into strict public_using
    from pg_policy
    where polrelid = table_oid and polname = policy_pair.public_policy
      and polcmd = 'r' and polroles = array[0::oid] and polpermissive;

    select pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid), polcmd
      into strict staff_using, staff_check, staff_command
    from pg_policy
    where polrelid = table_oid and polname = policy_pair.staff_policy
      and polcmd in ('r', '*') and polroles = array[authenticated_role] and polpermissive;

    public_using := replace(public_using, 'auth.uid()', '(select auth.uid())');
    staff_check := coalesce(staff_check, staff_using);
    staff_using := replace(staff_using, 'auth.uid()', '(select auth.uid())');
    staff_using := replace(staff_using, 'public.active_app_role()', '(select public.active_app_role())');
    staff_check := replace(staff_check, 'auth.uid()', '(select auth.uid())');
    staff_check := replace(staff_check, 'public.active_app_role()', '(select public.active_app_role())');

    execute format('alter policy %I on public.%I to anon, pg_read_all_data using (%s)',
      policy_pair.public_policy, policy_pair.table_name, public_using);
    execute format('create policy "Authenticated read access" on public.%I for select to authenticated using ((%s) or (%s))',
      policy_pair.table_name, public_using, staff_using);

    execute format('drop policy %I on public.%I', policy_pair.staff_policy, policy_pair.table_name);

    if staff_command = '*' then
      execute format('create policy "Management inserts" on public.%I for insert to authenticated with check (%s)',
        policy_pair.table_name, staff_check);
      execute format('create policy "Management updates" on public.%I for update to authenticated using (%s) with check (%s)',
        policy_pair.table_name, staff_using, staff_check);
      execute format('create policy "Management deletes" on public.%I for delete to authenticated using (%s)',
        policy_pair.table_name, staff_using);
    end if;
  end loop;
end;
$$;

commit;
