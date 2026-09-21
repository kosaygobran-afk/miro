-- Account lifecycle, role control, saved products, invoices and role pricing.
-- Additive only: existing profiles, carts and orders remain intact.

alter table public.profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'blocked'));

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

alter table public.user_roles
  drop constraint if exists user_roles_role_check;

alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('customer', 'worker', 'admin', 'ceo'));

create table if not exists public.saved_products (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, product_id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null unique,
  status text not null default 'issued'
    check (status in ('draft', 'issued', 'paid', 'void')),
  subtotal numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  currency text not null default 'ILS',
  issued_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.product_prices (
  product_id uuid not null references public.products(id) on delete cascade,
  role text not null check (role in ('customer', 'worker', 'admin', 'ceo')),
  price numeric(12, 2) not null check (price >= 0),
  primary key (product_id, role)
);

create index if not exists invoices_user_id_idx on public.invoices(user_id);
create index if not exists product_prices_role_idx on public.product_prices(role);

alter table public.saved_products enable row level security;
alter table public.invoices enable row level security;
alter table public.product_prices enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'saved_products' and policyname = 'Users manage their saved products') then
    create policy "Users manage their saved products" on public.saved_products
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'Users view their invoices') then
    create policy "Users view their invoices" on public.invoices
      for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'product_prices' and policyname = 'Users view their role prices') then
    create policy "Users view their role prices" on public.product_prices
      for select using (
        role = coalesce((select ur.role from public.user_roles ur where ur.user_id = auth.uid()), 'customer')
      );
  end if;
end
$$;

grant select, insert, delete on public.saved_products to authenticated;
grant select on public.invoices, public.product_prices to authenticated;
grant select, insert, update, delete on public.saved_products, public.invoices, public.product_prices to service_role;

create or replace function public.assign_customer_role(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles(user_id, role)
  values (target_user_id, 'customer')
  on conflict (user_id) do nothing;
end;
$$;
revoke execute on function public.assign_customer_role(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, account_status)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''), 'active')
  on conflict (id) do nothing;
  perform public.assign_customer_role(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
