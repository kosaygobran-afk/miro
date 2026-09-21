-- Phase 2 foundation: catalog access, profiles, roles and enquiry auditability.
-- This migration is intentionally additive and does not delete or rewrite catalog data.

create extension if not exists "pgcrypto";

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_he text not null,
  name_en text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_id uuid references public.categories(id) on delete set null,
  name_he text,
  name_en text,
  short_description_he text,
  short_description_en text,
  description_he text,
  description_en text,
  price numeric(12, 2),
  image_url text,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists products_category_id_idx
  on public.products(category_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'worker', 'ceo')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  service_id text,
  name text not null,
  email text not null,
  phone text,
  message text not null,
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'closed', 'spam')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists service_requests_customer_id_idx
  on public.service_requests(customer_id);
create index if not exists service_requests_status_idx
  on public.service_requests(status);
create index if not exists audit_events_user_id_idx
  on public.audit_events(user_id);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.service_requests enable row level security;
alter table public.audit_events enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at_column();

drop trigger if exists set_user_roles_updated_at on public.user_roles;
create trigger set_user_roles_updated_at
  before update on public.user_roles
  for each row execute procedure public.update_updated_at_column();

drop trigger if exists set_service_requests_updated_at on public.service_requests;
create trigger set_service_requests_updated_at
  before update on public.service_requests
  for each row execute procedure public.update_updated_at_column();

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'categories'
      and policyname = 'Public can view active catalog categories'
  ) then
    create policy "Public can view active catalog categories" on public.categories
      for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products'
      and policyname = 'Public can view active products'
  ) then
    create policy "Public can view active products" on public.products
      for select using (is_active = true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'Users can view their own profile'
  ) then
    create policy "Users can view their own profile" on public.profiles
      for select using (id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'Users can update their own profile'
  ) then
    create policy "Users can update their own profile" on public.profiles
      for update using (id = auth.uid()) with check (id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_roles'
      and policyname = 'Users can view their own role'
  ) then
    create policy "Users can view their own role" on public.user_roles
      for select using (user_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_requests'
      and policyname = 'Users can view their own requests'
  ) then
    create policy "Users can view their own requests" on public.service_requests
      for select using (customer_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_requests'
      and policyname = 'Authenticated users can create requests'
  ) then
    create policy "Authenticated users can create requests" on public.service_requests
      for insert with check (auth.uid() is not null and customer_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_events'
      and policyname = 'Users can view their own audit events'
  ) then
    create policy "Users can view their own audit events" on public.audit_events
      for select using (user_id = auth.uid());
  end if;
end
$$;

grant select on public.categories, public.products to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.user_roles, public.audit_events to authenticated;
grant select, insert on public.service_requests to authenticated;
