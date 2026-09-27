-- DB-3 regression tests: services CMS, canonical product media backfill,
-- product-media storage bucket and its RLS.
-- Run against an isolated migrated database. All fixtures are rolled back.
begin;

-- ============================================================
-- Fixtures
-- ============================================================

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
('00000000-0000-0000-0000-000000000300', 'sm-customer@example.invalid', now(), '{"full_name":"Customer"}'),
('00000000-0000-0000-0000-000000000301', 'sm-admin@example.invalid', now(), '{"full_name":"Admin"}'),
('00000000-0000-0000-0000-000000000302', 'sm-ceo@example.invalid', now(), '{"full_name":"CEO"}');

update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000301';
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000302';

-- An extra bucket so we can prove writes outside product-media are denied.
insert into storage.buckets(id, name, public) values ('sm-other-bucket', 'sm-other-bucket', false);

-- ============================================================
-- 1. Seed parity: the four hard-coded service slugs exist and are active
-- ============================================================
do $$ begin
  if (select count(*) from public.services
      where slug in ('security-cameras','alarm-systems','intercom-access','network-wifi')
        and is_active) <> 4 then
    raise exception 'Seeded services missing or inactive';
  end if;
end $$;

-- ============================================================
-- 2. Public RLS: anon sees only active services
-- ============================================================
insert into public.services (slug, name_he, name_en, is_active)
values ('sm-hidden-service', 'נסתר', 'Hidden', false);

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$
declare v_visible bigint;
begin
  if exists (select 1 from public.services where slug = 'sm-hidden-service') then
    raise exception 'Anonymous saw an inactive service';
  end if;
  select count(*) into v_visible from public.services;
  if v_visible <> 4 then
    raise exception 'Anonymous service count wrong: %', v_visible;
  end if;
end $$;
reset role;

-- ============================================================
-- 3. Mutating authz: customer cannot use upsert_service or direct writes
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000300',true); -- customer
do $$ begin
  begin
    perform public.upsert_service('{"slug":"sm-cust","name_he":"ש","name_en":"S"}');
    raise exception 'Customer upsert_service allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.services (slug, name_he, name_en) values ('sm-cust-direct', 'ש', 'S');
    raise exception 'Customer direct insert allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- ============================================================
-- 4. Admin CRUD via upsert_service: insert, merge-update, slug upsert, audit
-- ============================================================
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true); -- admin
do $$
declare
  v_id uuid;
  v_row record;
  v_audit bigint;
begin
  v_id := public.upsert_service(
    '{"slug":"sm-managed","name_he":"נוהל","name_en":"Managed","visual_kind":"alarm","sort_order":7,"content":{"features":["f1"]}}'
  );
  select * into v_row from public.services where id = v_id;
  if v_row.slug <> 'sm-managed' or v_row.visual_kind <> 'alarm'
     or v_row.sort_order <> 7 or not v_row.is_active then
    raise exception 'upsert_service insert mismatch: %', v_row;
  end if;
  if jsonb_typeof(v_row.content) <> 'object'
     or v_row.content->'features' <> '["f1"]'::jsonb then
    raise exception 'upsert_service content mismatch';
  end if;

  -- Partial merge by id: only description_en changes
  perform public.upsert_service(jsonb_build_object(
    'id', v_id::text, 'slug', 'sm-managed', 'description_en', 'Long form'));
  select * into v_row from public.services where id = v_id;
  if v_row.name_he <> 'נוהל' or v_row.description_en <> 'Long form'
     or v_row.visual_kind <> 'alarm' then
    raise exception 'upsert_service merge failed: %', v_row;
  end if;

  -- Omitting id with an existing slug updates the same row (no fork)
  perform public.upsert_service('{"slug":"sm-managed","name_en":"Managed 2"}');
  if (select count(*) from public.services where slug = 'sm-managed') <> 1 then
    raise exception 'Slug upsert created a duplicate';
  end if;
  if (select name_en from public.services where slug = 'sm-managed') <> 'Managed 2' then
    raise exception 'Slug upsert did not update';
  end if;

  -- One audit row per upsert, actor = admin uid, same target service
  select count(*) into v_audit from public.audit_events
  where action = 'service_upserted'
    and entity_id = v_id
    and user_id = '00000000-0000-0000-0000-000000000301';
  if v_audit <> 3 then
    raise exception 'Expected 3 service_upserted audit rows, found %', v_audit;
  end if;

  -- Management RLS sees inactive rows too
  if not exists (
    select 1 from public.services where slug = 'sm-hidden-service'
  ) then
    raise exception 'Management cannot read inactive service';
  end if;

  -- Deactivation via RPC hides from the public listing contract
  perform public.upsert_service(jsonb_build_object('slug', 'sm-managed', 'is_active', false));
  if (select is_active from public.services where slug = 'sm-managed') then
    raise exception 'is_active update ignored';
  end if;
end $$;

-- ============================================================
-- 5. upsert_service validation rejections (22023), still as admin
-- ============================================================
do $$
declare v_audit_before bigint;
begin
  select count(*) into v_audit_before from public.audit_events
  where action = 'service_upserted';

  begin
    perform public.upsert_service('{"slug":"Bad Slug!","name_he":"א","name_en":"A"}');
    raise exception 'Bad slug accepted';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.upsert_service('{"slug":"sm-vk","name_he":"א","name_en":"A","visual_kind":"hologram"}');
    raise exception 'Bad visual_kind accepted';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.upsert_service('{"slug":"sm-ct","name_he":"א","name_en":"A","content":[1,2]}');
    raise exception 'Non-object content accepted';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.upsert_service('{"slug":"sm-noname"}');
    raise exception 'Missing names accepted';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.upsert_service('{"id":"00000000-0000-0000-0000-000000000099","slug":"sm-ghost","name_he":"א","name_en":"A"}');
    raise exception 'Ghost id update accepted';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.upsert_service('{"id":"not-a-uuid","slug":"sm-badid","name_he":"א","name_en":"A"}');
    raise exception 'Malformed id accepted';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.upsert_service('{"slug":"sm-so","name_he":"א","name_en":"A","sort_order":"soon"}');
    raise exception 'Non-numeric sort order accepted';
  exception when sqlstate '22023' then null; end;

  -- rejected upserts raise before any write, so the audit count is unchanged
  if (select count(*) from public.audit_events
      where action = 'service_upserted') is distinct from v_audit_before then
    raise exception 'Rejected upsert wrote an audit row';
  end if;
end $$;

-- ============================================================
-- 6. Table-level constraints bite on direct management writes
-- ============================================================
do $$ begin
  begin
    insert into public.services (slug, name_he, name_en) values ('UPPER Case', 'א', 'A');
    raise exception 'Slug check constraint missing';
  exception when check_violation then null; end;

  begin
    insert into public.services (slug, name_he, name_en, visual_kind)
    values ('sm-ok-kind', 'א', 'A', 'bogus');
    raise exception 'visual_kind check constraint missing';
  exception when check_violation then null; end;

  begin
    insert into public.services (slug, name_he, name_en, content)
    values ('sm-ok-content', 'א', 'A', '[]'::jsonb);
    raise exception 'content jsonb_typeof check missing';
  exception when check_violation then null; end;

  -- slug uniqueness (seed already holds security-cameras)
  begin
    insert into public.services (slug, name_he, name_en)
    values ('security-cameras', 'אחדות', 'Duplicate');
    raise exception 'Duplicate slug accepted';
  exception when unique_violation then null; end;
end $$;
reset role;

-- ============================================================
-- 7. Legacy image_url backfill: correct, narrow, idempotent
-- ============================================================
-- (Runs as the fixture superuser; the function itself is not granted to
-- API roles, so only trusted/server-side callers may re-run it.)
insert into public.categories(id, slug, name_he, name_en, is_active) values
('dddddddd-0000-0000-0000-000000000001', 'sm-cat', 'קטגוריה', 'Category', true);

insert into public.products(id, category_id, slug, name_he, name_en, image_url) values
('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'sm-legacy-img', 'שם', 'Legacy image', 'https://cdn.example.invalid/x.jpg'),
('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'sm-no-img', 'שם2', 'No image', null),
('eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001', 'sm-has-gallery', 'שם3', 'Has gallery', 'https://cdn.example.invalid/y.jpg'),
('eeeeeeee-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000001', 'sm-blank-img', 'שם4', 'Blank image', '   ');

-- Existing gallery must be left untouched by the backfill.
insert into public.product_images(product_id, image_url, sort_order) values
('eeeeeeee-0000-0000-0000-000000000003', 'https://cdn.example.invalid/z.jpg', 5);

do $$
declare v_moved integer; v_img record;
begin
  v_moved := public.backfill_product_images_from_legacy();
  if v_moved <> 1 then
    raise exception 'Backfill moved % rows, expected exactly 1', v_moved;
  end if;

  select * into v_img from public.product_images
  where product_id = 'eeeeeeee-0000-0000-0000-000000000001';
  if v_img.sort_order <> 0 or v_img.image_url <> 'https://cdn.example.invalid/x.jpg' then
    raise exception 'Backfill row wrong: %', v_img;
  end if;
  if v_img.alt_he is null or v_img.alt_en is null then
    raise exception 'Backfill alt text not sourced from product names';
  end if;

  -- products with an existing gallery are not given a synthetic extra image
  if (select count(*) from public.product_images
      where product_id = 'eeeeeeee-0000-0000-0000-000000000003') <> 1 then
    raise exception 'Existing gallery was clobbered';
  end if;

  -- idempotent: re-run moves nothing
  v_moved := public.backfill_product_images_from_legacy();
  if v_moved <> 0 then
    raise exception 'Backfill not idempotent: second run moved % rows', v_moved;
  end if;

  -- legacy column itself is kept (deprecated, not dropped)
  if (select image_url from public.products
      where id = 'eeeeeeee-0000-0000-0000-000000000001') is null then
    raise exception 'Legacy image_url was removed';
  end if;
end $$;

-- ============================================================
-- 8. Primary image convention: lowest sort_order wins
-- ============================================================
insert into public.product_images(product_id, image_url, sort_order, alt_en) values
('eeeeeeee-0000-0000-0000-000000000001', 'https://cdn.example.invalid/x2.jpg', 3, 'Later image'),
('eeeeeeee-0000-0000-0000-000000000001', 'https://cdn.example.invalid/x0.jpg', 1, 'Middle image');

do $$ begin
  if (select image_url from public.product_images
      where product_id = 'eeeeeeee-0000-0000-0000-000000000001'
      order by sort_order asc, created_at asc, id asc limit 1)
     <> 'https://cdn.example.invalid/x.jpg' then
    raise exception 'Lowest-sort_order primary convention violated';
  end if;
  -- a new lowest sort_order takes over as primary
  insert into public.product_images(product_id, image_url, sort_order) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'https://cdn.example.invalid/hero.jpg', -1);
  if (select image_url from public.product_images
      where product_id = 'eeeeeeee-0000-0000-0000-000000000001'
      order by sort_order asc, created_at asc, id asc limit 1)
     <> 'https://cdn.example.invalid/hero.jpg' then
    raise exception 'Re-primary via lower sort_order failed';
  end if;
end $$;

-- ============================================================
-- 9. Storage bucket configuration
-- ============================================================
do $$
declare v_b record;
begin
  select * into v_b from storage.buckets where id = 'product-media';
  if v_b is null then
    raise exception 'product-media bucket missing';
  end if;
  if v_b.public is not true then
    raise exception 'product-media bucket is not public';
  end if;
  if v_b.file_size_limit is distinct from 5242880 then
    raise exception 'product-media file size limit wrong: %', v_b.file_size_limit;
  end if;
  if not (v_b.allowed_mime_types @>
      array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml']) then
    raise exception 'product-media MIME allowlist wrong: %', v_b.allowed_mime_types;
  end if;
  if coalesce(array_length(v_b.allowed_mime_types, 1), 0) <> 5 then
    raise exception 'product-media allows unexpected MIME types: %', v_b.allowed_mime_types;
  end if;
end $$;

-- Bucket upsert is idempotent (re-asserting it keeps ONE bucket).
do $$ begin
  if (select count(*) from storage.buckets where id = 'product-media') <> 1 then
    raise exception 'product-media bucket duplicated';
  end if;
end $$;

-- ============================================================
-- 10. storage.objects RLS
-- ============================================================

-- (a) anonymous: public SELECT works, INSERT denied (42501)
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  perform 1 from storage.objects where bucket_id = 'product-media' limit 1;
  begin
    insert into storage.objects (bucket_id, name)
    values ('product-media', 'products/anon.png');
    raise exception 'Anonymous upload allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- (b) authenticated customer: upload denied even under products/ prefix
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000300',true);
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('product-media', 'products/customer.png');
    raise exception 'Customer upload allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- (c) admin: allowed under products/, denied in other buckets/prefixes
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true);
do $$
declare v_obj uuid; v_rows integer;
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('product-media', 'products/admin-test.png',
          '00000000-0000-0000-0000-000000000301')
  returning id into v_obj;

  -- rename inside the allowed prefix (UPDATE)
  update storage.objects
  set name = 'products/admin-test-2.png', updated_at = now()
  where id = v_obj;

  -- wrong prefix inside the right bucket is rejected
  begin
    insert into storage.objects (bucket_id, name)
    values ('product-media', 'avatars/x.png');
    raise exception 'Non-products path allowed';
  exception when insufficient_privilege then null; end;

  -- other bucket is rejected even for admin
  begin
    insert into storage.objects (bucket_id, name)
    values ('sm-other-bucket', 'products/x.png');
    raise exception 'Foreign bucket upload allowed';
  exception when insufficient_privilege then null; end;

  -- update may not move an object outside the products/ prefix
  begin
    update storage.objects set name = 'other/escaped.png' where id = v_obj;
    raise exception 'Prefix escape via update allowed';
  exception when insufficient_privilege then null; end;

  -- DELETE allowed for admin inside the prefix...
  delete from storage.objects where id = v_obj;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Admin delete did not apply'; end if;

  -- ...and re-insert so customer tampering can be exercised next
  -- (object is re-found by its unique test name in the next block).
  insert into storage.objects (bucket_id, name, owner)
  values ('product-media', 'products/admin-test.png',
          '00000000-0000-0000-0000-000000000301');
end $$;

-- (d) customer cannot modify or delete admin-owned media (policy denies both)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000300',true);
do $$
declare v_obj uuid; v_rows integer;
begin
  select id into v_obj from storage.objects
  where bucket_id = 'product-media' and name = 'products/admin-test.png';
  if v_obj is null then raise exception 'Test object missing'; end if;

  update storage.objects set name = 'products/evil.png' where id = v_obj;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Customer update applied'; end if;

  delete from storage.objects where id = v_obj;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Customer delete applied'; end if;

  -- but customers can still READ public bucket object rows
  if not exists (select 1 from storage.objects where id = v_obj) then
    raise exception 'Public read of product-media object failed';
  end if;
end $$;

-- Re-running the bucket statement must not duplicate or downgrade it.
reset role;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  if (select count(*) from storage.buckets where id = 'product-media' and public
      and file_size_limit = 5242880) <> 1 then
    raise exception 'Bucket upsert not idempotent';
  end if;
end $$;

rollback;
