-- Additive media/stock support. Keep existing catalog RPCs, status/audience,
-- revision and audit guards intact, including independently deployed hardening.
alter table public.product_variants add constraint product_variants_id_product_unique unique (id, product_id);
alter table public.product_images add column variant_id uuid;
alter table public.product_images add constraint product_images_variant_product_fkey
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete restrict;
create index product_images_variant_idx on public.product_images(variant_id) where variant_id is not null;
grant select (variant_id) on public.product_images to anon, authenticated;
comment on column public.product_images.variant_id is 'NULL = general product image. Otherwise a variant of this same product. Multiple images per variant; global main image is independent of assignment.';

create function public.update_catalog_image(p_id uuid, p_patch jsonb)
returns public.product_images language plpgsql security definer set search_path = '' as $$
declare v_image public.product_images; v_key text; v_product uuid;
begin
 if coalesce(public.active_app_role(),'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Invalid image patch' using errcode='22023'; end if;
 for v_key in select jsonb_object_keys(p_patch) loop
   if v_key<>all(array['variant_id','alt_he','alt_en','sort_order','is_primary']) then raise exception 'Unknown image field' using errcode='22023'; end if;
 end loop;
 if p_patch ? 'variant_id' and jsonb_typeof(p_patch->'variant_id') not in ('string','null') then raise exception 'Invalid variant assignment' using errcode='22023'; end if;
 -- Serialize this wrapper's image/main edits before row locks; legacy RPC still
 -- owns alt/order/primary behavior and its existing validation/audit contract.
 select product_id into v_product from public.product_images where id=p_id;
 if not found then raise exception 'Image not found' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext('product-media:'||v_product::text));
 select * into v_image from public.product_images where id=p_id for update;
 if not found then raise exception 'Image not found' using errcode='22023'; end if;
 if p_patch ? 'variant_id' then
   if p_patch->>'variant_id' is not null and not exists (
     select 1 from public.product_variants v where v.id=(p_patch->>'variant_id')::uuid
       and v.product_id=v_image.product_id and v.is_active
   ) then raise exception 'Variant must be active and belong to this product' using errcode='22023'; end if;
   update public.product_images set variant_id=(p_patch->>'variant_id')::uuid where id=p_id returning * into v_image;
   insert into public.audit_events(action,user_id,entity_type,entity_id,details)
   values('product_image_variant_assigned',auth.uid(),'product_image',p_id,
     jsonb_build_object('image_id',p_id,'product_id',v_image.product_id,'variant_id',v_image.variant_id));
 end if;
 if (p_patch-'variant_id')<>'{}'::jsonb then
   v_image:=public.upsert_product_image_meta(p_id,p_patch-'variant_id');
 end if;
 return v_image;
end $$;
revoke all on function public.update_catalog_image(uuid,jsonb) from public;
grant execute on function public.update_catalog_image(uuid,jsonb) to authenticated;

-- Creation and opening movement are one transaction. Existing create RPC keeps
-- ownership of metadata validation and role/status/revision/audit rules.
create function public.create_catalog_variant_with_stock(p_data jsonb)
returns public.product_variants language plpgsql security definer set search_path = '' as $$
declare v public.product_variants; qty integer:=0;
begin
 if coalesce(public.active_app_role(),'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid variant details' using errcode='22023'; end if;
 if p_data ? 'initial_stock_qty' then
   if jsonb_typeof(p_data->'initial_stock_qty')<>'number'
      or (p_data->>'initial_stock_qty')::numeric<0 or (p_data->>'initial_stock_qty')::numeric>10000
      or trunc((p_data->>'initial_stock_qty')::numeric)<>(p_data->>'initial_stock_qty')::numeric then
     raise exception 'Invalid initial stock' using errcode='22023';
   end if;
   qty:=(p_data->>'initial_stock_qty')::integer;
 end if;
 -- Do not allow a second independent opening quantity through this entry point.
 if p_data ? 'opening_quantity' then raise exception 'Use initial_stock_qty' using errcode='22023'; end if;
 v:=public.create_catalog_variant(p_data-'initial_stock_qty');
 if qty>0 then
   perform public.record_stock_movement(v.id,qty,'manual_adjustment',null,'Initial counted stock at variant creation',null);
   select * into v from public.product_variants pv where pv.id=v.id;
 end if;
 return v;
end $$;
revoke all on function public.create_catalog_variant_with_stock(jsonb) from public;
grant execute on function public.create_catalog_variant_with_stock(jsonb) to authenticated;

-- Optimistic stock correction: prevent a stale editor overwriting a newer sale/count.
create or replace function public.adjust_catalog_variant_stock(
 p_variant_id uuid, p_counted integer, p_expected integer, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_qty integer;
begin
 if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
   raise exception 'Forbidden' using errcode = '42501';
 end if;
 if p_counted is null or p_counted < 0 or p_expected is null or p_expected < 0
    or nullif(btrim(p_reason),'') is null or length(p_reason)>500 then
   raise exception 'Invalid stock correction' using errcode = '22023';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_variant_id::text));
 select stock_qty into v_qty from public.product_variants where id=p_variant_id for update;
 if not found then raise exception 'Variant not found' using errcode = '22023'; end if;
 if v_qty <> p_expected then raise exception 'Stock changed; refresh before saving' using errcode = 'PT409'; end if;
 return public.adjust_stock(p_variant_id,p_counted,p_reason);
end;
$$;
revoke all on function public.adjust_catalog_variant_stock(uuid,integer,integer,text) from public;
grant execute on function public.adjust_catalog_variant_stock(uuid,integer,integer,text) to authenticated;


-- Enrich the authorized, bounded inventory page. Totals use all active siblings,
-- independent of the selected page, search and stock-status filter.
create function public.management_inventory_variant_list(
 p_search text default null, p_status text default null, p_page integer default 1, p_page_size integer default 25
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; items jsonb;
begin
 if coalesce(public.active_app_role(),'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
 result:=public.management_inventory_list(p_search,p_status,p_page,p_page_size);
 select coalesce(jsonb_agg(entry.value || jsonb_build_object(
   'color_he',v.color_he,'color_en',v.color_en,'color_hex',v.color_hex,'is_active',v.is_active,
   'product_status',p.status,'tracking_mode',p.tracking_mode,'out_of_stock_policy',p.out_of_stock_policy,
   'product_stock_qty',(select coalesce(sum(s.stock_qty),0) from public.product_variants s where s.product_id=p.id and s.is_active)
 ) order by entry.ordinality),'[]'::jsonb) into items
 from jsonb_array_elements(result->'items') with ordinality entry(value,ordinality)
 join public.product_variants v on v.id=(entry.value->>'variant_id')::uuid
 join public.products p on p.id=v.product_id;
 return jsonb_set(result,'{items}',items);
end $$;
revoke all on function public.management_inventory_variant_list(text,text,integer,integer) from public;
grant execute on function public.management_inventory_variant_list(text,text,integer,integer) to authenticated;
