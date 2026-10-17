-- Legacy root-category aliases resolve to the same public URL. Prevent two
-- external categories from competing for one route without rewriting data.
-- Keep this mapping aligned with src/lib/catalog/routes.ts.
-- Future mapping changes need an additive migration, collision preflight and
-- index rebuild: changing an immutable function does not refresh index keys.
create or replace function public.catalog_category_route_key(p_slug text)
returns text
language sql immutable strict parallel safe set search_path = ''
as $$
  select case p_slug
    when 'cameras' then 'cameras'
    when 'security-cameras' then 'cameras'
    when 'servers' then 'servers'
    when 'nvr' then 'servers'
    when 'routers' then 'routers'
    when 'network' then 'routers'
    when 'cables' then 'cables'
    when 'accessories' then 'accessories'
    when 'tools' then 'accessories'
    when 'network-gear' then 'networkGear'
    when 'networkgear' then 'networkGear'
    when 'alarm-systems' then 'alarms'
    when 'intercom-access' then 'intercom'
    when 'intercom-and-access' then 'intercom'
    else p_slug
  end;
$$;

comment on function public.catalog_category_route_key(text) is
  'Immutable public root-category route normalization. Mirrors getCategoryKeyFromSlug in src/lib/catalog/routes.ts. Future alias changes require a migration with collision preflight and index rebuild, plus alias parity verification.';

do $$ begin
  if exists (
    select 1 from public.categories
    where parent_id is null
    group by public.catalog_category_route_key(slug)
    having count(*) > 1
  ) then
    raise exception 'External categories share a storefront route; review their slugs before installing the route uniqueness guard'
      using errcode = '23505';
  end if;
end $$;

-- Internal category URLs retain the raw unique slug within their root route;
-- alias spellings are valid children and do not compete with external routes.
create unique index if not exists categories_root_route_key_unique
  on public.categories(public.catalog_category_route_key(slug))
  where parent_id is null;
