-- publish_product RPC: validates and transitions product to 'active' status
-- Only admin/ceo can call; uses advisory lock on product; writes audit event

create or replace function public.publish_product(
  p_product uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_product record;
  v_has_default_variant boolean;
  v_variant_count integer;
begin
  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Serialize per product
  perform pg_advisory_xact_lock(hashtext(p_product::text));

  -- Lock product row and get current state
  select * into v_product
  from public.products
  where id = p_product
  for update;

  if not found then
    raise exception 'Product not found' using errcode = '22023';
  end if;

  if v_product.status = 'active' then
    return; -- already published
  end if;

  -- Validate required fields for publishing
  if v_product.name_he is null or v_product.name_he = '' then
    raise exception 'Missing Hebrew name' using errcode = '22023';
  end if;
  if v_product.name_en is null or v_product.name_en = '' then
    raise exception 'Missing English name' using errcode = '22023';
  end if;
  if v_product.category_id is null then
    raise exception 'Missing category' using errcode = '22023';
  end if;

  -- Check for at least one active variant with non-empty sku and barcode
  select count(*) into v_variant_count
  from public.product_variants
  where product_id = p_product
    and is_active = true
    and length(sku) > 0
    and barcode is not null
    and length(barcode) > 0;

  if v_variant_count = 0 then
    raise exception 'Product must have at least one active variant with SKU and barcode' using errcode = '22023';
  end if;

  -- Transition to active
  update public.products
  set status = 'active',
      updated_at = timezone('utc'::text, now())
  where id = p_product;

  -- Audit event
  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('product_published', auth.uid(),
    jsonb_build_object(
      'product_id', p_product,
      'slug', v_product.slug,
      'name_he', v_product.name_he,
      'name_en', v_product.name_en
    ),
    'product', p_product
  );
end;
$$;

revoke all on function public.publish_product(uuid) from public;
grant execute on function public.publish_product(uuid) to authenticated;

-- unpublish_product RPC: transitions product from 'active' to 'draft' or 'hidden'
create or replace function public.unpublish_product(
  p_product uuid,
  p_status text default 'draft'
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_product record;
begin
  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_status not in ('draft','hidden','archived') then
    raise exception 'Invalid target status' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_product::text));

  select * into v_product
  from public.products
  where id = p_product
  for update;

  if not found then
    raise exception 'Product not found' using errcode = '22023';
  end if;

  if v_product.status = p_status then
    return;
  end if;

  update public.products
  set status = p_status,
      updated_at = timezone('utc'::text, now())
  where id = p_product;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('product_unpublished', auth.uid(),
    jsonb_build_object(
      'product_id', p_product,
      'slug', v_product.slug,
      'previous_status', v_product.status,
      'new_status', p_status
    ),
    'product', p_product
  );
end;
$$;

revoke all on function public.unpublish_product(uuid,text) from public;
grant execute on function public.unpublish_product(uuid,text) to authenticated;