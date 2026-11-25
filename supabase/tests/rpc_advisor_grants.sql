begin;

-- Confirm both browser roles lost direct access to the trigger entry points.
do $$
declare
  entry text;
  proc_id regprocedure;
begin
  foreach entry in array array[
    'public.categories_guard_deactivation()',
    'public.categories_guard_two_levels()',
    'public.categories_prevent_parent_cycle()',
    'public.commerce_guard_reserved_stock()',
    'public.commerce_snapshot_business_identity()',
    'public.handle_new_user()',
    'public.product_variants_guard_last_sellable()',
    'public.products_enforce_insert_draft()',
    'public.products_guard_active_integrity()',
    'public.products_guard_category_hierarchy()',
    'public.service_requests_guard_insert()',
    'public.service_requests_guard_product_variant()'
  ] loop
    proc_id := entry::regprocedure;
    if has_function_privilege('anon', proc_id, 'EXECUTE')
      or has_function_privilege('authenticated', proc_id, 'EXECUTE') then
      raise exception 'Trigger is still executable by a browser role: %', entry;
    end if;
  end loop;

  proc_id := to_regprocedure('public.rls_auto_enable()');
  if proc_id is not null
    and (has_function_privilege('anon', proc_id, 'EXECUTE')
      or has_function_privilege('authenticated', proc_id, 'EXECUTE')) then
    raise exception 'Hosted RLS event trigger is still executable by a browser role';
  end if;
end;
$$;

-- The attached signup trigger must still assign the customer role.
insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000002956', 'rpc-grants-test@example.invalid', now(), '{}');

do $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = '00000000-0000-4000-8000-000000002956' and role = 'customer'
  ) then
    raise exception 'User creation trigger did not assign the customer role';
  end if;
end;
$$;

set local role anon;
do $$
begin
  if public.get_public_website_images() is null then
    raise exception 'Anonymous website image projection is unavailable';
  end if;
end;
$$;
reset role;

rollback;
