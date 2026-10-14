-- Column-level grants complement row-level catalog/order authorization.
-- Fictional fixtures are rolled back; no linked owner catalog is contacted.
begin;
insert into auth.users(id,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000001301','{"full_name":"Privacy customer"}');
insert into public.categories(id,slug,name_he,name_en) values('00000000-0000-0000-0000-000000001310','privacy-projection','בדיקת פרטיות','Privacy projection');
insert into public.products(id,category_id,slug,name_he,name_en,price,purchase_cost,metadata)
values('00000000-0000-0000-0000-000000001311','00000000-0000-0000-0000-000000001310','privacy-projection','מוצר בדיקה','Privacy product',100,45,'{"internal":"private fixture"}');
update public.products set status='active' where id='00000000-0000-0000-0000-000000001311';
insert into public.product_variants(id,product_id,sku,is_default,is_active,stock_qty,pos_price,cost_override,supplier_sku)
values('00000000-0000-0000-0000-000000001312','00000000-0000-0000-0000-000000001311','PRIVACY-PROJECTION',true,true,10,120,45,'PRIVATE-SUPPLIER-SKU');
insert into public.orders(id,user_id,order_number,status,total)
values('00000000-0000-0000-0000-000000001313','00000000-0000-0000-0000-000000001301','PRIVACY-ORDER','paid',100);
insert into public.order_items(id,order_id,product_id,quantity,unit_price,total_price,unit_cost)
values('00000000-0000-0000-0000-000000001314','00000000-0000-0000-0000-000000001313','00000000-0000-0000-0000-000000001311',1,100,100,45);
set local role anon;
do $$ begin
  if (select price from public.products where id='00000000-0000-0000-0000-000000001311')<>100 then raise exception 'Approved storefront price became unreadable'; end if;
  if (select stock_qty from public.product_variants where id='00000000-0000-0000-0000-000000001312')<>10 then raise exception 'Public variant projection became unreadable'; end if;
  begin perform purchase_cost from public.products limit 1; raise exception 'Anon read product purchase cost'; exception when insufficient_privilege then null; end;
  begin perform metadata from public.products limit 1; raise exception 'Anon read arbitrary product metadata'; exception when insufficient_privilege then null; end;
  begin perform supplier_id from public.products limit 1; raise exception 'Anon read product supplier'; exception when insufficient_privilege then null; end;
  begin perform pos_price from public.product_variants limit 1; raise exception 'Anon read unpublished POS price'; exception when insufficient_privilege then null; end;
  begin perform cost_override from public.product_variants limit 1; raise exception 'Anon read variant purchase cost'; exception when insufficient_privilege then null; end;
  begin perform supplier_sku from public.product_variants limit 1; raise exception 'Anon read supplier SKU'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001301',true);
do $$ begin
  if (select total_price from public.order_items where id='00000000-0000-0000-0000-000000001314')<>100 then raise exception 'Customer cannot read owned purchase item'; end if;
  begin perform unit_cost from public.order_items limit 1; raise exception 'Customer read private order cost'; exception when insufficient_privilege then null; end;
  begin perform pos_price from public.product_variants limit 1; raise exception 'Customer read unpublished POS price'; exception when insufficient_privilege then null; end;
  begin perform purchase_cost from public.products limit 1; raise exception 'Customer read product purchase cost'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
  if (select purchase_cost from public.products where id='00000000-0000-0000-0000-000000001311')<>45 or (select unit_cost from public.order_items where id='00000000-0000-0000-0000-000000001314')<>45 then raise exception 'Authorized management service cost projection failed'; end if;
end $$;
reset role;
rollback;
