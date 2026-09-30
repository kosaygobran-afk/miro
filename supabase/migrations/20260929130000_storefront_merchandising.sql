-- Storefront merchandising: moving rail, promo badges, public promotions
-- This migration adds the backend tables and seed data for the premium storefront experience.

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. STOREFRONT_RAIL_ITEMS - Products assigned to moving rail with scheduling
-- ============================================================
create table if not exists public.storefront_rail_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  scheduled_from timestamptz,
  scheduled_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint storefront_rail_items_product_unique unique (product_id)
);

create index if not exists idx_storefront_rail_items_active_schedule
  on public.storefront_rail_items(is_active, scheduled_from, scheduled_until);

create trigger set_storefront_rail_items_updated_at
  before update on public.storefront_rail_items
  for each row execute procedure public.update_updated_at_column();

alter table public.storefront_rail_items enable row level security;

-- Public reads active rail items within schedule window
drop policy if exists "Public reads active rail items" on public.storefront_rail_items;
create policy "Public reads active rail items" on public.storefront_rail_items
  for select using (
    is_active = true
    and (scheduled_from is null or scheduled_from <= now())
    and (scheduled_until is null or scheduled_until >= now())
    and exists (
      select 1 from public.products p
      where p.id = storefront_rail_items.product_id
      and p.status = 'active'
    )
  );

-- Admin/CEO manage all rail items
drop policy if exists "Management manages rail items" on public.storefront_rail_items;
create policy "Management manages rail items" on public.storefront_rail_items
  for all to authenticated
  using (public.active_app_role() in ('admin','ceo'))
  with check (public.active_app_role() in ('admin','ceo'));

revoke all on public.storefront_rail_items from public;
grant select on public.storefront_rail_items to anon, authenticated;
grant all on public.storefront_rail_items to service_role;

comment on table public.storefront_rail_items is
  'Products assigned to the moving product rail on the storefront. Only one entry per product. Scheduling allows time-limited features.';

-- ============================================================
-- 2. PROMO_BADGE_TYPES - Reusable badge definitions
-- ============================================================
create table if not exists public.promo_badge_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]+$' and length(key) <= 50),
  label_he text not null check (length(btrim(label_he)) > 0 and length(label_he) <= 40),
  label_en text not null check (length(btrim(label_en)) > 0 and length(label_en) <= 40),
  shape text not null default 'tag' check (shape in ('tag','burst','ticket','ribbon','hex')),
  tone text not null default 'sale' check (tone in ('sale','best','new','hot','limited')),
  icon_name text check (icon_name is null or icon_name ~ '^[a-z_-]+$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create trigger set_promo_badge_types_updated_at
  before update on public.promo_badge_types
  for each row execute procedure public.update_updated_at_column();

alter table public.promo_badge_types enable row level security;

-- Public reads active badge types
drop policy if exists "Public reads active badge types" on public.promo_badge_types;
create policy "Public reads active badge types" on public.promo_badge_types
  for select using (is_active = true);

-- Admin/CEO manage badge types
drop policy if exists "Management manages badge types" on public.promo_badge_types;
create policy "Management manages badge types" on public.promo_badge_types
  for all to authenticated
  using (public.active_app_role() in ('admin','ceo'))
  with check (public.active_app_role() in ('admin','ceo'));

revoke all on public.promo_badge_types from public;
grant select on public.promo_badge_types to anon, authenticated;
grant all on public.promo_badge_types to service_role;

comment on table public.promo_badge_types is
  'Reusable promotional badge definitions. Each badge has a visual style (shape, tone, optional icon) and localized labels. Seed defaults: significant_sale, best_seller, new, hot, limited.';

-- ============================================================
-- 3. PRODUCT_PROMO_BADGES - Product-to-badge assignments with priority/schedule
-- ============================================================
create table if not exists public.product_promo_badges (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  badge_type_id uuid not null references public.promo_badge_types(id) on delete restrict,
  priority integer not null default 0,
  scheduled_from timestamptz,
  scheduled_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint product_promo_badges_product_badge_unique unique (product_id, badge_type_id)
);

create index if not exists idx_product_promo_badges_active_schedule
  on public.product_promo_badges(product_id, scheduled_from, scheduled_until);

create trigger set_product_promo_badges_updated_at
  before update on public.product_promo_badges
  for each row execute procedure public.update_updated_at_column();

alter table public.product_promo_badges enable row level security;

-- Public reads active badge assignments for active products
drop policy if exists "Public reads active product badges" on public.product_promo_badges;
create policy "Public reads active product badges" on public.product_promo_badges
  for select using (
    (scheduled_from is null or scheduled_from <= now())
    and (scheduled_until is null or scheduled_until >= now())
    and exists (
      select 1 from public.products p
      where p.id = product_promo_badges.product_id
      and p.status = 'active'
    )
    and exists (
      select 1 from public.promo_badge_types bt
      where bt.id = product_promo_badges.badge_type_id
      and bt.is_active = true
    )
  );

-- Admin/CEO manage product badge assignments
drop policy if exists "Management manages product badges" on public.product_promo_badges;
create policy "Management manages product badges" on public.product_promo_badges
  for all to authenticated
  using (public.active_app_role() in ('admin','ceo'))
  with check (public.active_app_role() in ('admin','ceo'));

revoke all on public.product_promo_badges from public;
grant select on public.product_promo_badges to anon, authenticated;
grant all on public.product_promo_badges to service_role;

comment on table public.product_promo_badges is
  'Assignments of promo badges to products with priority and scheduling. Multiple badges per product allowed; priority determines display order.';

-- ============================================================
-- 4. PRODUCT_PUBLIC_PROMOTIONS - Public promotion configuration
-- ============================================================
create table if not exists public.product_public_promotions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  promotion_type text not null check (promotion_type in ('percent','fixed')),
  value numeric(12,2) not null check (value > 0),
  compare_at_price numeric(12,2),
  is_active boolean not null default true,
  scheduled_from timestamptz,
  scheduled_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint product_public_promotions_product_unique unique (product_id),
  constraint product_public_promotions_percent_check check (
    promotion_type <> 'percent' or (value > 0 and value <= 95)
  ),
  constraint product_public_promotions_compare_at_check check (
    promotion_type = 'percent' or compare_at_price is null or compare_at_price > value
  )
);

create index if not exists idx_product_public_promotions_active_schedule
  on public.product_public_promotions(product_id, is_active, scheduled_from, scheduled_until);

create trigger set_product_public_promotions_updated_at
  before update on public.product_public_promotions
  for each row execute procedure public.update_updated_at_column();

alter table public.product_public_promotions enable row level security;

-- Public reads active promotions for active products
drop policy if exists "Public reads active product promotions" on public.product_public_promotions;
create policy "Public reads active product promotions" on public.product_public_promotions
  for select using (
    is_active = true
    and (scheduled_from is null or scheduled_from <= now())
    and (scheduled_until is null or scheduled_until >= now())
    and exists (
      select 1 from public.products p
      where p.id = product_public_promotions.product_id
      and p.status = 'active'
    )
  );

-- Admin/CEO manage public promotions
drop policy if exists "Management manages product promotions" on public.product_public_promotions;
create policy "Management manages product promotions" on public.product_public_promotions
  for all to authenticated
  using (public.active_app_role() in ('admin','ceo'))
  with check (public.active_app_role() in ('admin','ceo'));

revoke all on public.product_public_promotions from public;
grant select on public.product_public_promotions to anon, authenticated;
grant all on public.product_public_promotions to service_role;

comment on table public.product_public_promotions is
  'Public-facing promotions per product. Supports percentage discount (1-100) or fixed amount off. compare_at_price is the strikethrough reference price. Only one active promotion per product.';

-- ============================================================
-- 5. SEED DEFAULT BADGE TYPES
-- ============================================================
insert into public.promo_badge_types (key, label_he, label_en, shape, tone, icon_name, sort_order) values
  ('significant_sale', 'מבצע משמעותי', 'Significant Sale', 'tag', 'sale', 'percent', 1),
  ('best_seller', 'הנמכר ביותר', 'Best Seller', 'burst', 'best', 'award', 2),
  ('new', 'חדש', 'New', 'ticket', 'new', 'sparkles', 3),
  ('hot', 'לוהט', 'Hot', 'ribbon', 'hot', 'flame', 4),
  ('limited', 'מלאי מוגבל', 'Limited Stock', 'hex', 'limited', 'clock', 5)
on conflict (key) do update set
  label_he = excluded.label_he,
  label_en = excluded.label_en,
  shape = excluded.shape,
  tone = excluded.tone,
  icon_name = excluded.icon_name,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

-- ============================================================
-- 6. CATEGORIES - Add icon_image_url for category icon upload feature
-- ============================================================
alter table public.categories
  add column if not exists icon_image_url text;

-- ============================================================
-- 7. AUDIT_EVENTS - Ensure entity_type/entity_id columns exist (already in 20260925140000)
-- ============================================================
-- Already added in commerce_foundation migration, but ensure they exist
alter table public.audit_events
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

create index if not exists idx_audit_events_entity
  on public.audit_events(entity_type, entity_id);
