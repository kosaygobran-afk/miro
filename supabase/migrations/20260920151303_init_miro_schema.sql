create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'admin', 'worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_he text not null,
  name_en text not null,
  description_he text,
  description_en text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  slug text not null unique,
  name_he text not null,
  name_en text not null,
  short_description_he text,
  short_description_en text,
  description_he text,
  description_en text,
  price numeric(12,2) not null default 0,
  compare_at_price numeric(12,2),
  inventory_count integer not null default 0,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (session_id)
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  order_number text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled', 'refunded')),
  subtotal numeric(12,2) not null default 0,
  shipping_cost numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'ILS',
  customer_name text,
  customer_email text,
  customer_phone text,
  notes text,
  shipping_address jsonb not null default '{}'::jsonb,
  payment_provider text,
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_products_active_featured on public.products(is_active, is_featured);
create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_cart_items_cart_id on public.cart_items(cart_id);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Public product catalog is readable" on public.products
  for select using (true);

create policy "Public categories are readable" on public.categories
  for select using (true);

create policy "Public product images are readable" on public.product_images
  for select using (true);

create policy "Users can manage their own cart" on public.carts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage their own cart items" on public.cart_items
  for all using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id and c.user_id = auth.uid()
    )
  );

create policy "Users can see their own orders" on public.orders
  for select using (auth.uid() = user_id);

create policy "Users can create checkout orders" on public.orders
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own orders" on public.orders
  for update using (auth.uid() = user_id);

create policy "Users can view order items for their own orders" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', coalesce(new.raw_user_meta_data ->> 'role', 'customer'))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at_column();

create trigger set_products_updated_at
  before update on public.products
  for each row execute procedure public.update_updated_at_column();

create trigger set_carts_updated_at
  before update on public.carts
  for each row execute procedure public.update_updated_at_column();

create trigger set_orders_updated_at
  before update on public.orders
  for each row execute procedure public.update_updated_at_column();
;
