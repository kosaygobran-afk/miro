-- Account-owned shopping selections. Cart data is an estimate; checkout still
-- resolves every identity, offer, price and stock level against the live catalog.
create table public.customer_carts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lines jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.customer_shopping_imports (
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null,
  primary key (user_id, import_id)
);

alter table public.customer_carts enable row level security;
alter table public.customer_shopping_imports enable row level security;
revoke all on public.customer_carts, public.customer_shopping_imports from public, anon, authenticated;

create function public.customer_shopping(
  p_owner uuid,
  p_action text default 'read',
  p_lines jsonb default '{}'::jsonb,
  p_products uuid[] default '{}',
  p_import_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lines jsonb;
  v_key text;
  v_item jsonb;
begin
  if auth.uid() is null or p_owner is distinct from auth.uid()
    or not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.account_status = 'active'
    ) then
    raise exception 'Shopping access denied' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('read', 'cart', 'import', 'save', 'remove')
    or jsonb_typeof(p_lines) is distinct from 'object'
    or octet_length(p_lines::text) > 1048576
    or coalesce(cardinality(p_products), 0) > 250
    or (p_action = 'import' and p_import_id is null) then
    raise exception 'Invalid shopping update' using errcode = '22023';
  end if;

  -- Serialize mutations for this account; different devices can edit distinct
  -- selections without overwriting one another's cart.
  if p_action <> 'read' then
    perform pg_advisory_xact_lock(hashtextextended('customer-shopping:' || p_owner::text, 0));
  end if;
  select lines into v_lines from public.customer_carts where user_id = p_owner;
  v_lines := coalesce(v_lines, '{}'::jsonb);

  if p_action = 'import' then
    insert into public.customer_shopping_imports(user_id, import_id)
    values (p_owner, p_import_id)
    on conflict do nothing;
    if not found then
      p_action := 'read';
    end if;
  end if;

  if p_action in ('cart', 'import') then
    for v_key, v_item in select key, value from jsonb_each(p_lines) loop
      if length(v_key) > 5000 then
        raise exception 'Invalid cart key' using errcode = '22023';
      end if;
      if v_item = 'null'::jsonb and p_action = 'cart' then
        v_lines := v_lines - v_key;
        continue;
      end if;
      if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]?$' then
        raise exception 'Invalid cart line' using errcode = '22023';
      end if;
      -- A repeat selection keeps the larger quantity. Different variants and
      -- option revisions remain separate configurations.
      if p_action = 'cart' or not (v_lines ? v_key)
        or (v_lines->v_key->>'quantity')::int < (v_item->>'quantity')::int then
        v_lines := jsonb_set(v_lines, array[v_key], v_item);
      end if;
    end loop;
    if (select count(*) from jsonb_object_keys(v_lines)) > 250
      or octet_length(v_lines::text) > 1048576 then
      raise exception 'Cart too large' using errcode = '22023';
    end if;
    insert into public.customer_carts(user_id, lines)
    values (p_owner, v_lines)
    on conflict (user_id) do update set lines = excluded.lines, updated_at = now();
  end if;

  if p_action in ('save', 'import') then
    insert into public.saved_products(user_id, product_id)
    select p_owner, p.id from public.products p
    join public.categories c on c.id = p.category_id
    where p.id = any(p_products) and p.status = 'active' and c.is_active
    on conflict do nothing;
  elsif p_action = 'remove' then
    delete from public.saved_products where user_id = p_owner and product_id = any(p_products);
  end if;

  return jsonb_build_object(
    'cart', coalesce((select jsonb_agg(value order by key) from jsonb_each(v_lines)), '[]'::jsonb),
    'wishlist', coalesce((
      select jsonb_agg(product_id order by created_at desc, product_id)
      from public.saved_products where user_id = p_owner
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.customer_shopping(uuid, text, jsonb, uuid[], uuid) from public, anon;
grant execute on function public.customer_shopping(uuid, text, jsonb, uuid[], uuid) to authenticated;
