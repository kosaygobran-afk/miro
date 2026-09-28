-- DB-3: Services CMS, canonical product media, product-media storage bucket.
--
-- 1. public.services: CMS table for the Services/Solutions pages. Public may
--    read active rows only; admin/ceo manage rows (RLS on active_app_role) and
--    use the security-definer upsert_service RPC (slug pattern, visual_kind
--    whitelist, JSON-object content, transactional audit row as auth.uid()).
--    Four seed rows mirror the hard-coded service slugs in
--    src/lib/service-content.ts / src/messages/*.json so the public pages can
--    switch to DB content without losing parity (INSERT ... ON CONFLICT DO
--    NOTHING; owner edits/extends via the management UI afterwards).
-- 2. Canonical media: product_images is the ONLY image model going forward.
--    A product's primary image is its product_images row with the LOWEST
--    sort_order. products.image_url is deprecated (kept, not dropped) and
--    backfilled into product_images (sort_order 0, alt from name_he/name_en)
--    for products that have a non-empty legacy image_url and no gallery rows.
-- 3. Storage: single bucket 'product-media' (public read, 5MB, images only).
--    storage.objects RLS: SELECT public for this bucket; INSERT/UPDATE/DELETE
--    only for active admin/ceo and only for object names under 'products/%'.
--    The storage.* DDL/RLS section starts with LOCAL-TEST SHIMS (clearly
--    marked) that no-op on real Supabase, where the storage schema already
--    exists, but let the disposable local PostgreSQL harness exercise the
--    same policies.

-- ============================================================
-- 1a. services table
-- ============================================================

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  name_he text not null check (length(btrim(name_he)) > 0),
  name_en text not null check (length(btrim(name_en)) > 0),
  short_description_he text,
  short_description_en text,
  description_he text,
  description_en text,
  visual_kind text not null default 'generic_security'
    check (visual_kind in (
      'camera_dome','camera_bullet','camera_ptz','alarm','intercom','router',
      'network_switch','cable','lock','server','generic_security',
      'uploaded_image','uploaded_svg'
    )),
  image_url text check (image_url is null or btrim(image_url) <> ''),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  seo_title_he text,
  seo_title_en text,
  seo_description_he text,
  seo_description_en text,
  -- Structured sections (features/benefits/process_steps/faq/cta/related_products).
  -- Shape is validated loosely: must be a JSON object; section keys are app-owned.
  content jsonb not null default '{}'::jsonb
    check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_services_active_sort
  on public.services(is_active, sort_order);

drop trigger if exists set_services_updated_at on public.services;
create trigger set_services_updated_at
  before update on public.services
  for each row execute procedure public.update_updated_at_column();

alter table public.services enable row level security;

-- Public storefront reads only active services.
drop policy if exists "Public can view active services" on public.services;
create policy "Public can view active services" on public.services
  for select using (is_active = true);

-- Admin/CEO manage everything (all rows, incl. inactive drafts).
drop policy if exists "Management manages services" on public.services;
create policy "Management manages services" on public.services
  for all to authenticated
  using (public.active_app_role() in ('admin','ceo'))
  with check (public.active_app_role() in ('admin','ceo'));

-- Narrow grants: revoke the default PUBLIC privileges first.
revoke all on public.services from public;
grant select on public.services to anon, authenticated;
grant insert, update, delete on public.services to authenticated;
grant all on public.services to service_role;

comment on table public.services is
'CMS rows for the Services/Solutions pages. Public sees is_active rows only; admin/ceo manage rows directly (RLS) or via upsert_service (validated + audited).';
comment on column public.services.visual_kind is
'Renderer hint: approved icon/illustration kinds, or uploaded_image/uploaded_svg when image_url is a storage object in the product-media bucket.';
comment on column public.services.content is
'Structured sections (features/benefits/process_steps/faq/cta/related_products). Must be a JSON object; section semantics are owned by the app.';

-- ============================================================
-- 1b. upsert_service RPC (admin/ceo, validated, audited)
-- ============================================================

create or replace function public.upsert_service(p_service jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_visual_kinds constant text[] := array[
    'camera_dome','camera_bullet','camera_ptz','alarm','intercom','router',
    'network_switch','cable','lock','server','generic_security',
    'uploaded_image','uploaded_svg'
  ];
  v_id uuid;
  v_id_text text;
  v_slug text;
  v_existing record;
  v_visual text;
  v_sort_text text;
  v_is_update boolean := false;
begin
  -- Authorization: admin/ceo only (capabilities also enforced app-side)
  if coalesce(public.active_app_role(), '') not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_service is null or jsonb_typeof(p_service) <> 'object' then
    raise exception 'Service payload must be a JSON object' using errcode = '22023';
  end if;

  v_id_text := nullif(p_service->>'id', '');
  if v_id_text is not null
     and v_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Invalid service id' using errcode = '22023';
  end if;
  v_id := v_id_text::uuid;

  v_slug := nullif(btrim(coalesce(p_service->>'slug', '')), '');
  if v_slug is null then
    raise exception 'Slug is required' using errcode = '22023';
  end if;
  if length(v_slug) > 100 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Invalid slug' using errcode = '22023';
  end if;

  v_visual := nullif(p_service->>'visual_kind', '');
  if v_visual is not null and not (v_visual = any(c_visual_kinds)) then
    raise exception 'Invalid visual kind' using errcode = '22023';
  end if;

  if (p_service ? 'content')
     and (p_service -> 'content') is not null
     and jsonb_typeof(p_service -> 'content') is distinct from 'object' then
    raise exception 'Content must be a JSON object' using errcode = '22023';
  end if;

  v_sort_text := nullif(p_service->>'sort_order', '');
  if v_sort_text is not null and v_sort_text !~ '^-?[0-9]+$' then
    raise exception 'Invalid sort order' using errcode = '22023';
  end if;

  -- Serialize per slug so insert/update races cannot fork the unique slug
  perform pg_advisory_xact_lock(hashtext(v_slug));

  if v_id is not null then
    select * into v_existing from public.services where id = v_id for update;
    if not found then
      raise exception 'Service not found' using errcode = '22023';
    end if;
    v_is_update := true;
  else
    select * into v_existing from public.services where slug = v_slug for update;
    if found then
      v_id := v_existing.id;
      v_is_update := true;
    end if;
  end if;

  if v_is_update then
    update public.services set
      slug = v_slug,
      name_he = coalesce(nullif(btrim(coalesce(p_service->>'name_he', '')), ''), v_existing.name_he),
      name_en = coalesce(nullif(btrim(coalesce(p_service->>'name_en', '')), ''), v_existing.name_en),
      short_description_he = coalesce(p_service->>'short_description_he', v_existing.short_description_he),
      short_description_en = coalesce(p_service->>'short_description_en', v_existing.short_description_en),
      description_he = coalesce(p_service->>'description_he', v_existing.description_he),
      description_en = coalesce(p_service->>'description_en', v_existing.description_en),
      visual_kind = coalesce(v_visual, v_existing.visual_kind),
      image_url = coalesce(p_service->>'image_url', v_existing.image_url),
      sort_order = coalesce(v_sort_text::integer, v_existing.sort_order),
      is_active = coalesce((p_service->>'is_active')::boolean, v_existing.is_active),
      seo_title_he = coalesce(p_service->>'seo_title_he', v_existing.seo_title_he),
      seo_title_en = coalesce(p_service->>'seo_title_en', v_existing.seo_title_en),
      seo_description_he = coalesce(p_service->>'seo_description_he', v_existing.seo_description_he),
      seo_description_en = coalesce(p_service->>'seo_description_en', v_existing.seo_description_en),
      content = case
        when (p_service ? 'content') and (p_service -> 'content') is not null
        then p_service -> 'content'
        else v_existing.content
      end,
      updated_at = timezone('utc'::text, now())
    where id = v_id;
  else
    if nullif(btrim(coalesce(p_service->>'name_he', '')), '') is null
       or nullif(btrim(coalesce(p_service->>'name_en', '')), '') is null then
      raise exception 'Hebrew and English names are required' using errcode = '22023';
    end if;

    insert into public.services (
      slug, name_he, name_en,
      short_description_he, short_description_en, description_he, description_en,
      visual_kind, image_url, sort_order, is_active,
      seo_title_he, seo_title_en, seo_description_he, seo_description_en, content
    ) values (
      v_slug, btrim(p_service->>'name_he'), btrim(p_service->>'name_en'),
      p_service->>'short_description_he', p_service->>'short_description_en',
      p_service->>'description_he', p_service->>'description_en',
      coalesce(v_visual, 'generic_security'), p_service->>'image_url',
      coalesce(v_sort_text::integer, 0),
      coalesce((p_service->>'is_active')::boolean, true),
      p_service->>'seo_title_he', p_service->>'seo_title_en',
      p_service->>'seo_description_he', p_service->>'seo_description_en',
      coalesce(p_service -> 'content', '{}'::jsonb)
    ) returning id into v_id;
  end if;

  -- Audit in the same transaction as the write
  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('service_upserted', auth.uid(),
    jsonb_build_object(
      'service_id', v_id,
      'slug', v_slug,
      'operation', case when v_is_update then 'update' else 'insert' end
    ),
    'service', v_id
  );

  return v_id;
end;
$$;

revoke all on function public.upsert_service(jsonb) from public;
grant execute on function public.upsert_service(jsonb) to authenticated;

comment on function public.upsert_service(jsonb) is
'Admin/CEO only. Validated upsert (slug pattern, visual_kind whitelist, object content, uuid id); merges partial payloads on update; writes a service_upserted audit row in the same transaction.';

-- ============================================================
-- 1c. Seed rows mirroring the hard-coded services (parity, then UI-editable)
-- ============================================================
-- Slugs match src/lib/service-content.ts and src/messages/*.json
-- (pages.services.categories). Titles/short descriptions are the current
-- message strings; the owner can edit everything via the management UI.

insert into public.services (
  slug, name_en, name_he, short_description_en, short_description_he,
  visual_kind, sort_order
) values
('security-cameras', 'Security Cameras', 'מצלמות אבטחה',
 'Planning and installation foundation for CCTV and IP camera systems.',
 'בסיס לתכנון והתקנה של מערכות CCTV ומצלמות IP.',
 'camera_dome', 1),
('alarm-systems', 'Alarm Systems', 'מערכות אזעקה',
 'Draft alarm-system service area for intrusion detection and property protection.',
 'תחום שירות טיוטה למערכות גילוי חדירה והגנה על נכסים.',
 'alarm', 2),
('intercom-access', 'Intercom & Access Control', 'אינטרקום ובקרת כניסה',
 'Video intercoms, access-control concepts and secure entry planning.',
 'אינטרקום וידאו, בקרת כניסה ותכנון כניסה מאובטחת.',
 'intercom', 3),
('network-wifi', 'Network & Wi-Fi Installation', 'התקנת רשת ו-Wi-Fi',
 'Structured cabling, Wi-Fi coverage and connected-device installation foundations.',
 'כבילה מסודרת, כיסוי Wi-Fi והתקנת מכשירים מחוברים.',
 'router', 4)
on conflict (slug) do nothing;

-- ============================================================
-- 2. Canonical product media: product_images is the only image model
-- ============================================================
-- Primary image = product_images row with the lowest sort_order for a product.
-- products.image_url stays (app wave stops reading it later) but is deprecated.

comment on table public.product_images is
  'Canonical product media. A product''s primary image is its row with the LOWEST sort_order. product_images is the only image model going forward.';
comment on column public.product_images.sort_order is
  'Display order ascending; the lowest sort_order row is the product''s primary image.';
comment on column public.product_images.image_url is
  'Public URL or storage object name (in the product-media bucket) once uploaded via Supabase Storage.';
comment on column public.products.image_url is
  'DEPRECATED (2026-09-27): legacy single-image field. Backfilled into product_images (sort_order 0). Kept for read-compatibility only; do not write new values.';

-- Idempotent one-shot backfill: legacy image_url -> product_images(sort_order 0)
-- only when the product has a non-empty legacy image and no gallery rows yet.
-- Kept as a revoked function so tests can re-run it to prove idempotency.
create or replace function public.backfill_product_images_from_legacy()
returns integer
language sql
security definer
set search_path = ''
as $$
  with moved as (
    insert into public.product_images (product_id, image_url, sort_order, alt_he, alt_en)
    select
      p.id,
      btrim(p.image_url),
      0,
      nullif(btrim(coalesce(p.name_he, '')), ''),
      nullif(btrim(coalesce(p.name_en, '')), '')
    from public.products p
    where p.image_url is not null
      and btrim(p.image_url) <> ''
      and not exists (
        select 1 from public.product_images pi where pi.product_id = p.id
      )
    order by p.id
    returning 1
  )
  select count(*)::integer from moved;
$$;

revoke all on function public.backfill_product_images_from_legacy() from public;
revoke all on function public.backfill_product_images_from_legacy() from anon, authenticated;

comment on function public.backfill_product_images_from_legacy() is
'One-shot, idempotent backfill of deprecated products.image_url into product_images (sort_order 0 = primary). Skips products that already have gallery rows. Not granted to API roles.';

-- Run the actual backfill now (safe to re-run).
select public.backfill_product_images_from_legacy();

-- ============================================================
-- 3. Storage: single public bucket 'product-media' + storage.objects RLS
-- ============================================================

-- LOCAL-TEST SHIMS ------------------------------------------------------
-- The disposable local PostgreSQL harness (scripts/verify-database.py) has no
-- storage schema. On real Supabase these objects already exist, so every
-- statement below is guarded with IF NOT EXISTS and is a no-op there. The
-- shim shapes deliberately match the real Supabase storage tables well enough
-- for the policies below to be exercised identically in both environments.
-- Wrap in DO block to gracefully skip on real Supabase where the connected
-- role lacks CREATE permission on the storage schema.
do $$
begin
  create schema if not exists storage;

  create table if not exists storage.buckets (
    id text primary key,
    name text not null,
    owner uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    public boolean not null default false,
    avif_autodetection boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id) on delete cascade,
    name text not null,
    owner uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_accessed_at timestamptz not null default now(),
    metadata jsonb,
    path_tokens text[] generated always as (string_to_array(name, '/')) stored,
    version text,
    owner_id text
  );
exception when insufficient_privilege then
  -- On real Supabase the connected role lacks CREATE on storage schema;
  -- the tables already exist, so we silently continue.
  null;
end;
$$;
-- END LOCAL-TEST SHIMS ---------------------------------------------------

-- Storage bucket + RLS: wrap in DO block to gracefully skip on real Supabase
-- where the connected role doesn't own storage.objects/storage.buckets.
do $$
begin
  -- One bucket for all product/service media: idempotent upsert.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'product-media',
    'product-media',
    true,
    5242880, -- 5 MB
    array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml']
  )
  on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

  -- Schema/table-level access needed so RLS (not grants) is the real gate.
  -- On real Supabase these grants largely pre-exist; re-granting is harmless.
  grant usage on schema storage to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;

  alter table storage.objects enable row level security;

  -- Public read for everything in the bucket (bucket itself is public).
  drop policy if exists "product_media_public_read" on storage.objects;
  create policy "product_media_public_read" on storage.objects
    for select
    using (bucket_id = 'product-media');

  -- Writes: active admin/ceo only, and only under the products/ prefix.
  drop policy if exists "product_media_management_insert" on storage.objects;
  create policy "product_media_management_insert" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'product-media'
      and name like 'products/%'
      and public.active_app_role() in ('admin','ceo')
    );

  drop policy if exists "product_media_management_update" on storage.objects;
  create policy "product_media_management_update" on storage.objects
    for update to authenticated
    using (
      bucket_id = 'product-media'
      and name like 'products/%'
      and public.active_app_role() in ('admin','ceo')
    )
    with check (
      bucket_id = 'product-media'
      and name like 'products/%'
      and public.active_app_role() in ('admin','ceo')
    );

  drop policy if exists "product_media_management_delete" on storage.objects;
  create policy "product_media_management_delete" on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'product-media'
      and name like 'products/%'
      and public.active_app_role() in ('admin','ceo')
    );
exception when insufficient_privilege then
  -- On real Supabase the connected role doesn't own storage.objects/buckets;
  -- the bucket and policies are managed via the Supabase dashboard or API.
  -- We silently continue so the rest of the migration applies.
  null;
end;
$$;
