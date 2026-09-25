-- Public catalog reads product_images (bilingual alt, gallery). Policy already restricts rows.
grant select on public.product_images to anon, authenticated;
