-- Category grid artwork publication is scoped to active CEOs and visible roots.
begin;

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000008601', 'grid-ceo@example.invalid', now(), '{}'),
  ('00000000-0000-4000-8000-000000008602', 'grid-admin@example.invalid', now(), '{}'),
  ('00000000-0000-4000-8000-000000008603', 'grid-blocked@example.invalid', now(), '{}');
update public.user_roles set role = 'ceo' where user_id in (
  '00000000-0000-4000-8000-000000008601', '00000000-0000-4000-8000-000000008603'
);
update public.user_roles set role = 'admin' where user_id = '00000000-0000-4000-8000-000000008602';
update public.profiles set account_status = 'active' where id in (
  '00000000-0000-4000-8000-000000008601', '00000000-0000-4000-8000-000000008602'
);
update public.profiles set account_status = 'blocked' where id = '00000000-0000-4000-8000-000000008603';

insert into public.categories(id, slug, name_he, name_en, parent_id, is_active) values
  ('00000000-0000-4000-8000-000000008610', 'grid-artwork-root', 'קטגוריה', 'Grid root', null, true),
  ('00000000-0000-4000-8000-000000008611', 'grid-artwork-child', 'משנה', 'Grid child', '00000000-0000-4000-8000-000000008610', true);

set local role authenticated;
do $$ begin
  begin
    perform public.update_storefront_category_artwork(
      '00000000-0000-4000-8000-000000008601', '00000000-0000-4000-8000-000000008610', null, null, 'keep', null
    );
    raise exception 'Browser role could call private artwork writer';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role service_role;
do $$
declare
  ceo constant uuid := '00000000-0000-4000-8000-000000008601';
  root_id constant uuid := '00000000-0000-4000-8000-000000008610';
  child_id constant uuid := '00000000-0000-4000-8000-000000008611';
  sample_svg constant text := '<svg viewBox="0 0 240 160"><circle cx="50" cy="50" r="20"/></svg>';
  photo constant text := 'storefront-category-artwork/' || root_id || '/00000000-0000-4000-8000-000000008620.webp';
  actor uuid;
  first_revision uuid;
  result record;
begin
  foreach actor in array array['00000000-0000-4000-8000-000000008602'::uuid, '00000000-0000-4000-8000-000000008603'::uuid] loop
    begin
      perform public.update_storefront_category_artwork(actor, root_id, null, sample_svg, 'keep', null);
      raise exception 'Non-CEO or blocked CEO could save artwork';
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    perform public.update_storefront_category_artwork(ceo, child_id, null, sample_svg, 'keep', null);
    raise exception 'Subcategory artwork was accepted';
  exception when sqlstate 'PT404' then null; end;
  begin
    perform public.update_storefront_category_artwork(ceo, root_id, null, sample_svg, 'upload', 'other.webp');
    raise exception 'Unowned artwork path was accepted';
  exception when invalid_parameter_value then null; end;

  select * into result from public.update_storefront_category_artwork(ceo, root_id, null, sample_svg, 'upload', photo);
  if result.revision is null or result.svg_source is distinct from sample_svg or result.image_path is distinct from photo then
    raise exception 'CEO artwork was not published';
  end if;
  first_revision := result.revision;
  begin
    perform public.update_storefront_category_artwork(ceo, root_id, null, null, 'remove', null);
    raise exception 'A stale initial save replaced published artwork';
  exception when sqlstate 'PT409' then null; end;

  select * into result from public.update_storefront_category_artwork(ceo, root_id, first_revision, sample_svg, 'keep', null);
  if result.revision is distinct from first_revision then raise exception 'An unchanged save advanced the revision'; end if;
  select * into result from public.update_storefront_category_artwork(ceo, root_id, first_revision, sample_svg, 'remove', null);
  if result.revision = first_revision or result.image_path is not null or result.previous_image_path is distinct from photo then
    raise exception 'Photo removal did not preserve the SVG and return the old owned path';
  end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.audit_events where action = 'storefront_category_artwork_updated'
    and entity_id = '00000000-0000-4000-8000-000000008610') <> 2 then
    raise exception 'Artwork saves did not atomically record the expected audit events';
  end if;
  if not exists (select 1 from public.categories where id = '00000000-0000-4000-8000-000000008610'
    and name_en = 'Grid root' and name_he = 'קטגוריה') then
    raise exception 'Artwork save modified the shared category names';
  end if;
end $$;

set local role anon;
do $$ begin
  if not exists (select 1 from public.storefront_category_artwork where category_id = '00000000-0000-4000-8000-000000008610' and svg_source is not null) then
    raise exception 'Published artwork is missing from anonymous projection';
  end if;
  begin
    perform revision from public.storefront_category_artwork;
    raise exception 'Anonymous caller could read artwork revision';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

update public.categories set is_active = false where id = '00000000-0000-4000-8000-000000008610';
set local role anon;
do $$ begin
  if exists (select 1 from public.storefront_category_artwork where category_id = '00000000-0000-4000-8000-000000008610') then
    raise exception 'Inactive category artwork remained readable';
  end if;
end $$;
reset role;

rollback;
