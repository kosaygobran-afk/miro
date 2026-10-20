-- Disposable migration/backfill and private-source regression. Everything rolls back.
begin;
insert into public.categories(id,slug,name_he,name_en) values
  ('00000000-0000-0000-0000-000000005010','image-originals-root','בדיקה','Image originals');
insert into public.products(id,category_id,slug,name_he,name_en) values
  ('00000000-0000-0000-0000-000000005020','00000000-0000-0000-0000-000000005010','image-originals-qa','בדיקה','Originals QA');
insert into public.product_images(id,product_id,image_url,alt_en,sort_order) values
  ('00000000-0000-0000-0000-000000005030','00000000-0000-0000-0000-000000005020','https://owned.example/storage/v1/object/public/product-media/products/00000000-0000-0000-0000-000000005020/cutout2.png','Camera',3),
  ('00000000-0000-0000-0000-000000005031','00000000-0000-0000-0000-000000005020','https://owned.example/unrecoverable.png',null,4);
insert into public.audit_events(action,entity_type,entity_id,details) values
  ('product_image_background_removed','product_image','00000000-0000-0000-0000-000000005030',
    '{"image_id":"00000000-0000-0000-0000-000000005030","original_image_url":"https://owned.example/original.jpeg","storage_object":"products/00000000-0000-0000-0000-000000005020/cutout1.png"}'),
  ('product_image_background_removed','product_image','00000000-0000-0000-0000-000000005030',
    '{"image_id":"00000000-0000-0000-0000-000000005030","original_image_url":"https://owned.example/storage/v1/object/public/product-media/products/00000000-0000-0000-0000-000000005020/cutout1.png","storage_object":"products/00000000-0000-0000-0000-000000005020/cutout2.png"}'),
  -- An unrelated audit entry must never invent an original for another URL.
  ('product_image_background_removed','product_image','00000000-0000-0000-0000-000000005031',
    '{"image_id":"00000000-0000-0000-0000-000000005031","original_image_url":"https://owned.example/unrelated.jpeg","storage_object":"products/00000000-0000-0000-0000-000000005020/unrelated.png"}');
\ir ../migrations/20261017030000_product_image_originals.sql
do $$ begin
  if (select original_image_url from public.product_images where id='00000000-0000-0000-0000-000000005030') <> 'https://owned.example/original.jpeg' then
    raise exception 'Migration did not recover the first original across two removals';
  end if;
  if (select original_image_url from public.product_images where id='00000000-0000-0000-0000-000000005031') is not null then
    raise exception 'Migration guessed an unproven original';
  end if;
end $$;
-- Public projections keep the displayed image but cannot expose source metadata.
set local role anon;
do $$ begin
  perform image_url, alt_en, sort_order from public.product_images limit 1;
  begin
    perform original_image_url from public.product_images limit 1;
    raise exception 'Anonymous source metadata disclosure';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin
    perform original_image_url from public.product_images limit 1;
    raise exception 'Authenticated source metadata disclosure';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Restore preserves alt/order/source. A stale compare-and-swap cannot overwrite it.
update public.product_images set image_url=original_image_url
  where id='00000000-0000-0000-0000-000000005030';
do $$ begin
  update public.product_images set image_url='https://owned.example/stale.png'
    where id='00000000-0000-0000-0000-000000005030'
      and image_url like '%/cutout2.png';
  if found then raise exception 'Stale restore overwrote the image'; end if;
  if not exists(select 1 from public.product_images
    where id='00000000-0000-0000-0000-000000005030'
      and image_url=original_image_url and alt_en='Camera' and sort_order=3) then
    raise exception 'Restore lost source or image metadata';
  end if;
end $$;
rollback;
