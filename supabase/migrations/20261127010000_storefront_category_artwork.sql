-- Optional media for the upper Store category grid. The category row stays
-- authoritative for public names, destinations, visibility, and hierarchy.
create table public.storefront_category_artwork (
  category_id uuid primary key references public.categories(id) on delete cascade,
  revision uuid not null,
  svg_source text check (svg_source is null or octet_length(svg_source) between 1 and 32768),
  image_path text check (
    image_path is null or image_path ~ (
      '^storefront-category-artwork/' || category_id::text || '/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}[.]webp$'
    )
  )
);

alter table public.storefront_category_artwork enable row level security;
revoke all on table public.storefront_category_artwork from public, anon, authenticated, service_role;
grant select (category_id, svg_source, image_path) on public.storefront_category_artwork to anon, authenticated;
grant select on public.storefront_category_artwork to service_role;

create policy "Published artwork follows its root category"
  on public.storefront_category_artwork for select to anon, authenticated
  using (exists (
    select 1 from public.categories c
    where c.id = category_id and c.is_active and c.parent_id is null
  ));

-- Only the API can invoke this writer after preparing a bounded, validated
-- image/SVG. Recheck the actor and serialize on the category even for a first
-- save, so a delayed upload cannot overwrite a more recent edit.
create or replace function public.update_storefront_category_artwork(
  p_actor uuid,
  p_category_id uuid,
  p_revision uuid,
  p_svg_source text,
  p_photo_action text,
  p_image_path text
) returns table (revision uuid, svg_source text, image_path text, previous_image_path text)
language plpgsql security definer set search_path = '' as $$
declare
  v_current public.storefront_category_artwork;
  v_image_path text;
  v_revision uuid;
begin
  perform 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = p_actor and r.role = 'ceo' and p.account_status = 'active'
    for share of r, p;
  if not found then
    raise exception 'Active CEO required' using errcode = '42501';
  end if;

  if p_photo_action is null or p_photo_action not in ('keep', 'remove', 'upload')
    or (p_photo_action = 'upload') <> (p_image_path is not null)
    or (p_svg_source is not null and octet_length(p_svg_source) not between 1 and 32768)
    or (p_image_path is not null and p_image_path !~ (
      '^storefront-category-artwork/' || p_category_id::text || '/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}[.]webp$'
    ))
  then
    raise exception 'Invalid category artwork' using errcode = '22023';
  end if;

  perform 1 from public.categories c where c.id = p_category_id and c.parent_id is null for update;
  if not found then
    raise exception 'Root category not found' using errcode = 'PT404';
  end if;

  select a.* into v_current from public.storefront_category_artwork a where a.category_id = p_category_id;
  if v_current.revision is distinct from p_revision then
    raise exception 'Category artwork changed' using errcode = 'PT409';
  end if;

  v_image_path := case when p_photo_action = 'keep' then v_current.image_path else p_image_path end;
  if (v_current.svg_source, v_current.image_path) is not distinct from (p_svg_source, v_image_path) then
    return query select v_current.revision, v_current.svg_source, v_current.image_path, null::text;
    return;
  end if;

  v_revision := gen_random_uuid();
  insert into public.storefront_category_artwork(category_id, revision, svg_source, image_path)
    values (p_category_id, v_revision, p_svg_source, v_image_path)
    on conflict (category_id) do update set
      revision = excluded.revision, svg_source = excluded.svg_source, image_path = excluded.image_path;

  insert into public.audit_events(action, user_id, entity_type, entity_id, details)
    values ('storefront_category_artwork_updated', p_actor, 'category', p_category_id,
      jsonb_build_object('revision', v_revision, 'custom_svg', p_svg_source is not null, 'photo', v_image_path is not null));

  return query select v_revision, p_svg_source, v_image_path,
    case when v_current.image_path is distinct from v_image_path then v_current.image_path end;
end;
$$;

revoke all on function public.update_storefront_category_artwork(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_storefront_category_artwork(uuid, uuid, uuid, text, text, text) to service_role;
