-- Keep the first source atomically with each cutout URL, independently of audit
-- delivery. The source is management metadata, not a public catalog projection.
alter table public.product_images add column if not exists original_image_url text;
comment on column public.product_images.original_image_url is
  'First retained original before explicit background removal. Restore changes only image_url; never overwrite this source on subsequent processing.';

revoke select on public.product_images from public, anon, authenticated;
grant select (id, product_id, image_url, sort_order, created_at, alt_he, alt_en)
  on public.product_images to anon, authenticated;

-- Recover only proven links from the old saved-image tool. An upload that
-- discarded its original cannot be reconstructed. Follow the current cutout
-- backwards, including repeated processing, rather than guessing by date.
with recursive sources as (
  select p.id, p.image_url as source_url, 0 as depth, array[p.image_url] as seen
  from public.product_images p
  union all
  select s.id, a.details->>'original_image_url', s.depth + 1,
    s.seen || (a.details->>'original_image_url')
  from sources s
  join public.audit_events a
    on a.action = 'product_image_background_removed'
    and a.entity_type = 'product_image'
    and a.entity_id = s.id
    and a.details->>'image_id' = s.id::text
    and right(s.source_url, length('/product-media/' || (a.details->>'storage_object')))
      = '/product-media/' || (a.details->>'storage_object')
  where s.depth < 32
    and a.details->>'original_image_url' ~ '^https://'
    and not (a.details->>'original_image_url' = any(s.seen))
), originals as (
  select distinct on (id) id, source_url
  from sources where depth > 0 order by id, depth desc, source_url
)
update public.product_images p set original_image_url = o.source_url
from originals o where p.id = o.id and p.original_image_url is null;
