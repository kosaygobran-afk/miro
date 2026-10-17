-- Two-level catalog categories. Isolated fixtures and all mutations roll back.
begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000004001','category-admin@example.invalid',now(),'{"full_name":"Category Admin"}'),
  ('00000000-0000-0000-0000-000000004002','category-customer@example.invalid',now(),'{"full_name":"Category Customer"}');
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000004001';
update public.profiles set account_status='active' where id='00000000-0000-0000-0000-000000004001';

insert into public.categories(id,slug,name_he,name_en) values
  ('00000000-0000-0000-0000-000000004010','hierarchy-root-a','ראשית א','Root A'),
  ('00000000-0000-0000-0000-000000004011','hierarchy-root-b','ראשית ב','Root B');
insert into public.categories(id,slug,name_he,name_en,parent_id) values
  ('00000000-0000-0000-0000-000000004012','hierarchy-child-a','פנימית א','Child A','00000000-0000-0000-0000-000000004010'),
  ('00000000-0000-0000-0000-000000004013','hierarchy-child-b','פנימית ב','Child B','00000000-0000-0000-0000-000000004011');

-- Historical unassigned drafts are retained without inventing classifications.
alter table public.products disable trigger products_guard_category_hierarchy_trg;
insert into public.products(id,slug,name_he,name_en) values
  ('00000000-0000-0000-0000-000000004020','hierarchy-legacy','ישן','Legacy draft');
alter table public.products enable trigger products_guard_category_hierarchy_trg;

-- Direct writes cannot bypass root requirements or create deeper categories.
do $$ begin
  begin
    insert into public.products(slug,name_he,name_en) values ('hierarchy-no-root','ללא','Missing root');
    raise exception 'Direct product insert accepted missing external category';
  exception when sqlstate '22023' then null; end;
  begin
    insert into public.categories(slug,name_he,name_en,parent_id) values
      ('hierarchy-grandchild','עמוקה','Too deep','00000000-0000-0000-0000-000000004012');
    raise exception 'Three-level categories accepted';
  exception when sqlstate '22023' then null; end;
  begin
    update public.categories set parent_id='00000000-0000-0000-0000-000000004011'
      where id='00000000-0000-0000-0000-000000004010';
    raise exception 'Root with internal categories was reparented';
  exception when sqlstate '22023' then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004002',true);
do $$ begin
  begin
    perform public.create_catalog_product('hierarchy-forbidden','אסור','Forbidden',
      '00000000-0000-0000-0000-000000004010','00000000-0000-0000-0000-000000004012');
    raise exception 'Customer created catalog product';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004001',true);
do $$
declare v_product public.products;
begin
  begin
    perform public.create_catalog_product('hierarchy-rpc-no-root','ללא','Missing root');
    raise exception 'RPC accepted missing external category';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.create_catalog_product('hierarchy-child-as-root','לא','Child root',
      '00000000-0000-0000-0000-000000004012');
    raise exception 'RPC accepted internal category as root';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.create_catalog_product('hierarchy-wrong-child','לא','Wrong child',
      '00000000-0000-0000-0000-000000004010','00000000-0000-0000-0000-000000004013');
    raise exception 'RPC accepted internal category under different root';
  exception when sqlstate '22023' then null; end;

  v_product := public.create_catalog_product('hierarchy-optional','רשות','Optional child',
    '00000000-0000-0000-0000-000000004010');
  if v_product.subcategory_id is not null then raise exception 'Optional child not null'; end if;
  if not exists (select 1 from public.audit_events where entity_id=v_product.id and action='product_created') then
    raise exception 'Atomic create audit missing';
  end if;

  v_product := public.create_catalog_product('hierarchy-assigned','משויך','Assigned child',
    '00000000-0000-0000-0000-000000004010','00000000-0000-0000-0000-000000004012');
  if v_product.subcategory_id <> '00000000-0000-0000-0000-000000004012' then
    raise exception 'Valid internal category was lost';
  end if;
  begin
    perform public.update_product(v_product.id, '{"subcategory_id":"00000000-0000-0000-0000-000000004013"}');
    raise exception 'RPC edit accepted mismatched internal category';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.update_product(v_product.id, '{"category_id":null}');
    raise exception 'RPC edit cleared required root category';
  exception when sqlstate '22023' then null; end;

  -- Changing only the external category clears stale optional classification.
  v_product := public.update_product(v_product.id, '{"category_id":"00000000-0000-0000-0000-000000004011"}');
  if v_product.category_id <> '00000000-0000-0000-0000-000000004011' or v_product.subcategory_id is not null then
    raise exception 'External category change did not clear stale internal category';
  end if;
  if not exists (select 1 from public.audit_events where entity_id=v_product.id and action='product_updated'
    and details->'changed_fields' ? 'subcategory_id') then
    raise exception 'Automatic internal category reset was not audited';
  end if;
  v_product := public.update_product(v_product.id,
    '{"category_id":"00000000-0000-0000-0000-000000004010","subcategory_id":"00000000-0000-0000-0000-000000004012"}');
  if v_product.subcategory_id <> '00000000-0000-0000-0000-000000004012' then
    raise exception 'Atomic root/internal category pair update failed';
  end if;

  v_product := public.update_product('00000000-0000-0000-0000-000000004020', '{"brand":"Preserved legacy"}');
  if v_product.category_id is not null then raise exception 'Legacy draft was reassigned'; end if;
end $$;

reset role;
do $$
declare v_product_id uuid;
begin
  select id into v_product_id from public.products where slug='hierarchy-assigned';
  begin
    update public.products set category_id='00000000-0000-0000-0000-000000004011' where id=v_product_id;
    raise exception 'Direct root change retained invalid child';
  exception when sqlstate '22023' then null; end;
  begin
    update public.categories set parent_id='00000000-0000-0000-0000-000000004011'
      where id='00000000-0000-0000-0000-000000004012';
    raise exception 'Assigned child category was reparented';
  exception when sqlstate '22023' then null; end;
  begin
    delete from public.categories where id='00000000-0000-0000-0000-000000004012';
    raise exception 'Assigned internal category was deleted';
  exception when sqlstate '22023' then null; end;
  begin
    delete from public.categories where id='00000000-0000-0000-0000-000000004010';
    raise exception 'Assigned external category was deleted';
  exception when sqlstate '22023' then null; end;
  insert into public.product_variants(product_id,sku,barcode,is_active,is_default)
    values(v_product_id,'HIERARCHY-SKU','HIERARCHY-BARCODE',true,true);
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000004001',true);
do $$
declare v_product public.products; v_product_id uuid;
begin
  select id into v_product_id from public.products where slug='hierarchy-assigned';
  v_product := public.update_product(v_product_id,'{"status":"active"}');
  perform public.manage_category('deactivate','00000000-0000-0000-0000-000000004012');
  if (select status from public.products where id=v_product.id) <> 'hidden' then
    raise exception 'Internal category deactivation left active assigned product';
  end if;
  if not exists (select 1 from public.audit_events where entity_id=v_product.id
    and action='product_auto_unpublished' and details->>'category_id'='00000000-0000-0000-0000-000000004012') then
    raise exception 'Internal category deactivation audit missing';
  end if;
  begin
    perform public.update_product(v_product.id,'{"status":"active"}');
    raise exception 'Published product with inactive internal category';
  exception when sqlstate '22023' then null; end;
  perform public.manage_category('reactivate','00000000-0000-0000-0000-000000004012');
  v_product := public.update_product(v_product.id,'{"status":"active"}');
  perform public.manage_category('deactivate','00000000-0000-0000-0000-000000004010');
  if (select status from public.products where id=v_product.id) <> 'hidden' then
    raise exception 'External category deactivation left active assigned product';
  end if;
end $$;

reset role;
-- Metadata classification is public; internal cost/metadata privileges are unchanged.
do $$ begin
  if not has_column_privilege('anon','public.products','subcategory_id','SELECT') then
    raise exception 'Public subcategory read is not granted';
  end if;
  if has_column_privilege('anon','public.products','purchase_cost','SELECT') then
    raise exception 'Private product cost became public';
  end if;
end $$;
rollback;
