-- Synthetic catalog; used only by disposable verify-commerce-integration.py.
insert into public.categories(id,slug,name_he,name_en,is_active,sort_order) values
('00000000-0000-4000-8000-000000009910','pos-fixture-cameras','מצלמות בדיקה','Test cameras',true,1),
('00000000-0000-4000-8000-000000009911','pos-fixture-access','בקרת כניסה','Access control',true,2);
insert into public.products(id,category_id,slug,name_he,name_en,price,inventory_count,tracking_mode,sales_channel,image_url)
values
('00000000-0000-4000-8000-000000009920','00000000-0000-4000-8000-000000009910','pos-fixture-camera','מצלמת אבטחה לבדיקה','Test security camera',118,20,'serial','pos_and_online',null),
('00000000-0000-4000-8000-000000009921','00000000-0000-4000-8000-000000009911','pos-fixture-reader','קורא כניסה לבדיקה','Test access reader',59,20,'serial','pos_only',null);
update public.products set status='active' where id in ('00000000-0000-4000-8000-000000009920','00000000-0000-4000-8000-000000009921');
insert into public.product_variants(id,product_id,sku,barcode,is_default,is_active,stock_qty,pos_enabled,pos_price,color_en,color_he) values
('00000000-0000-4000-8000-000000009930','00000000-0000-4000-8000-000000009920','POS-CAMERA-01','900000000001',true,true,20,true,118,'White','לבן'),
('00000000-0000-4000-8000-000000009931','00000000-0000-4000-8000-000000009920','POS-CAMERA-02','900000000002',false,true,5,true,129,'Black','שחור'),
('00000000-0000-4000-8000-000000009932','00000000-0000-4000-8000-000000009921','POS-ACCESS-01','900000000003',true,true,20,true,59,null,null);
-- More than one page makes pagination a real API/database test.
insert into public.products(id,category_id,slug,name_he,name_en,price,inventory_count,tracking_mode,sales_channel)
select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009910','pos-fixture-extra-'||n,'אביזר בדיקה '||n,'Test accessory '||n,10,10,'none','pos_only' from generate_series(1,31) n;
update public.products set status='active' where slug like 'pos-fixture-extra-%';
insert into public.product_variants(id,product_id,sku,is_default,is_active,stock_qty,pos_enabled,pos_price)
select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'POS-EXTRA-'||n,true,true,10,true,10 from generate_series(1,31) n;
-- Unknown pricing must never masquerade as a free item.
update public.products set price=null,sale_price=null where slug='pos-fixture-extra-31';
update public.product_variants set pos_price=null,price_override=null where sku='POS-EXTRA-31';
