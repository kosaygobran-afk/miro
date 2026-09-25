-- Product images: bilingual alt text for accessibility/SEO (spec §36)
alter table public.product_images
  add column if not exists alt_he text,
  add column if not exists alt_en text;

comment on column public.product_images.alt_he is 'Hebrew alt text for accessibility/SEO.';
comment on column public.product_images.alt_en is 'English alt text for accessibility/SEO.';
