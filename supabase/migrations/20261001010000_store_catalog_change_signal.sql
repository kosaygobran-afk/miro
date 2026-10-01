-- Publish only a monotonically increasing catalog version. Public Realtime
-- subscribers never receive product, supplier, cost or audit rows.
create table if not exists public.store_catalog_version (
  id integer primary key default 1 check (id = 1),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.store_catalog_version (id) values (1)
on conflict (id) do nothing;

alter table public.store_catalog_version enable row level security;
drop policy if exists "Public reads store catalog version" on public.store_catalog_version;
create policy "Public reads store catalog version" on public.store_catalog_version
  for select to anon, authenticated using (true);
revoke all on public.store_catalog_version from public, anon, authenticated;
grant select on public.store_catalog_version to anon, authenticated;
grant all on public.store_catalog_version to service_role;

create or replace function public.signal_store_catalog_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.store_catalog_version
     set version = version + 1, updated_at = clock_timestamp()
   where id = 1;
  return null;
end;
$$;
revoke all on function public.signal_store_catalog_change() from public;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'products', 'product_variants', 'product_images', 'categories',
    'storefront_rail_items', 'promo_badge_types', 'product_promo_badges',
    'product_public_promotions'
  ] loop
    execute format(
      'create trigger store_catalog_change_signal after insert or update or delete on public.%I for each row execute function public.signal_store_catalog_change()',
      table_name
    );
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'store_catalog_version'
  ) then
    alter publication supabase_realtime add table public.store_catalog_version;
  end if;
end;
$$;
