-- Product-specific optional offers. Preserve installed catalog write/visibility
-- functions: this migration adds projections and atomic wrappers only.
create table public.product_optional_offer_sets (
  parent_product_id uuid primary key references public.products(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table public.product_optional_offers (
  id uuid primary key default gen_random_uuid(),
  parent_product_id uuid not null references public.products(id) on delete cascade,
  target_product_id uuid not null references public.products(id) on delete restrict,
  target_variant_id uuid not null,
  kind text not null check (kind in ('complementary','accompanying')),
  label_he text check (label_he is null or length(label_he) between 1 and 160),
  label_en text check (label_en is null or length(label_en) between 1 and 160),
  pricing_mode text not null check (pricing_mode in ('catalog','percent','fixed')),
  discount_bps integer,
  fixed_price_agorot bigint,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order>=0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_optional_offers_target_variant_fkey
    foreign key (target_variant_id,target_product_id)
    references public.product_variants(id,product_id) on delete restrict,
  constraint product_optional_offers_no_self_link check (parent_product_id <> target_product_id),
  constraint product_optional_offers_parent_target_unique unique(parent_product_id,target_variant_id),
  constraint product_optional_offers_pricing_check check (
    (pricing_mode='catalog' and discount_bps is null and fixed_price_agorot is null)
    or (pricing_mode='percent' and discount_bps is not null and discount_bps between 1 and 9500 and fixed_price_agorot is null)
    or (pricing_mode='fixed' and discount_bps is null and fixed_price_agorot is not null and fixed_price_agorot between 1 and 100000000)
  )
);
create index product_optional_offers_parent_order_idx
  on public.product_optional_offers(parent_product_id,kind,sort_order,id) where deleted_at is null;
create index product_optional_offers_target_idx on public.product_optional_offers(target_product_id,target_variant_id);

alter table public.product_optional_offer_sets enable row level security;
alter table public.product_optional_offers enable row level security;
revoke all on public.product_optional_offer_sets,public.product_optional_offers from public,anon,authenticated,service_role;
grant select(parent_product_id,revision) on public.product_optional_offer_sets to anon,authenticated;
grant select(id,parent_product_id,target_product_id,target_variant_id,kind,label_he,label_en,
  pricing_mode,discount_bps,fixed_price_agorot,is_active,sort_order)
  on public.product_optional_offers to anon,authenticated;
grant select on public.product_optional_offer_sets,public.product_optional_offers to service_role;

-- Every existence check runs as the caller. Installed audience/status RLS on
-- products and variants therefore remains authoritative, including linked-only
-- guards which are not duplicated or overwritten by this migration.
create policy "Public reads visible optional offer revisions" on public.product_optional_offer_sets
  for select to anon,authenticated using (exists(
    select 1 from public.products p join public.categories c on c.id=p.category_id
    where p.id=parent_product_id and p.status='active' and c.is_active
  ));
create policy "Public reads visible optional offers" on public.product_optional_offers
  for select to anon,authenticated using (
    is_active and deleted_at is null
    and exists(select 1 from public.products p join public.categories c on c.id=p.category_id
      where p.id=parent_product_id and p.status='active' and c.is_active)
    and exists(select 1 from public.products p join public.categories c on c.id=p.category_id
      where p.id=target_product_id and p.status='active' and c.is_active)
    and exists(select 1 from public.product_variants v
      where v.id=target_variant_id and v.product_id=target_product_id and v.is_active)
  );

create trigger store_catalog_change_signal after insert or update or delete on public.product_optional_offers
  for each row execute function public.signal_store_catalog_change();

create function public.get_public_product_optional_offers(p_product_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'revision',coalesce((select s.revision from public.product_optional_offer_sets s where s.parent_product_id=p_product_id),0),
    'offers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'parent_product_id',o.parent_product_id,'target_product_id',o.target_product_id,
      'target_variant_id',o.target_variant_id,'kind',o.kind,'label_he',o.label_he,'label_en',o.label_en,
      'pricing_mode',o.pricing_mode,'discount_bps',o.discount_bps,'fixed_price_agorot',o.fixed_price_agorot,
      'is_active',o.is_active,'sort_order',o.sort_order
    ) order by case o.kind when 'complementary' then 0 else 1 end,o.sort_order,o.id)
    from public.product_optional_offers o where o.parent_product_id=p_product_id),'[]'::jsonb)
  );
$$;
revoke all on function public.get_public_product_optional_offers(uuid) from public;
grant execute on function public.get_public_product_optional_offers(uuid) to anon,authenticated;

create function public.management_read_product_optional_offers(p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce(public.active_app_role(),'') not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if not exists(select 1 from public.products where id=p_product_id) then
    raise exception 'Product not found' using errcode='22023';
  end if;
  return jsonb_build_object(
    'revision',coalesce((select revision from public.product_optional_offer_sets where parent_product_id=p_product_id),0),
    'offers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'parent_product_id',o.parent_product_id,'target_product_id',o.target_product_id,
      'target_variant_id',o.target_variant_id,'kind',o.kind,'label_he',o.label_he,'label_en',o.label_en,
      'pricing_mode',o.pricing_mode,'discount_bps',o.discount_bps,'fixed_price_agorot',o.fixed_price_agorot,
      'is_active',o.is_active,'sort_order',o.sort_order,
      'target',jsonb_build_object('id',p.id,'name_he',p.name_he,'name_en',p.name_en,'slug',p.slug,'status',p.status,'sku',v.sku)
    ) order by case o.kind when 'complementary' then 0 else 1 end,o.sort_order,o.id)
    from public.product_optional_offers o join public.products p on p.id=o.target_product_id
      join public.product_variants v on v.id=o.target_variant_id and v.product_id=o.target_product_id
    where o.parent_product_id=p_product_id and o.deleted_at is null),'[]'::jsonb)
  );
end $$;
revoke all on function public.management_read_product_optional_offers(uuid) from public;
grant execute on function public.management_read_product_optional_offers(uuid) to authenticated;

create function public.replace_product_optional_offers(p_product_id uuid,p_expected_revision integer,p_offers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  item jsonb; field text; v_revision integer; v_id uuid; v_target uuid; v_variant uuid;
  v_existing public.product_optional_offers; v_kind text; v_mode text; v_bps integer; v_fixed bigint;
  v_sort integer; v_active boolean; v_label_he text; v_label_en text; v_position integer:=0;
  v_ids uuid[]:='{}'; v_targets uuid[]:='{}'; v_rows jsonb:='[]';
begin
  if coalesce(public.active_app_role(),'') not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_product_id is null or p_expected_revision is null or p_expected_revision<0
     or p_offers is null or jsonb_typeof(p_offers)<>'array' then
    raise exception 'Invalid optional offers' using errcode='22023';
  end if;
  -- Parent lock serializes first-save creation, row replacement and combined
  -- product saves without modifying the existing catalog write implementation.
  perform 1 from public.products where id=p_product_id for update;
  if not found then raise exception 'Product not found' using errcode='22023'; end if;
  insert into public.product_optional_offer_sets(parent_product_id) values(p_product_id) on conflict do nothing;
  select revision into v_revision from public.product_optional_offer_sets where parent_product_id=p_product_id for update;
  if v_revision<>p_expected_revision then raise exception 'Optional offers changed; refresh before saving' using errcode='PT409'; end if;
  if v_revision=2147483647 then raise exception 'Optional offer revision exhausted' using errcode='PT409'; end if;

  for item in select value from jsonb_array_elements(p_offers) loop
    if jsonb_typeof(item)<>'object' then raise exception 'Invalid optional offer' using errcode='22023'; end if;
    for field in select jsonb_object_keys(item) loop
      if field<>all(array['id','target_product_id','target_variant_id','kind','label_he','label_en',
        'pricing_mode','discount_bps','fixed_price_agorot','is_active','sort_order']) then
        raise exception 'Unknown optional offer field' using errcode='22023';
      end if;
    end loop;
    if jsonb_typeof(item->'target_product_id') is distinct from 'string'
       or jsonb_typeof(item->'target_variant_id') is distinct from 'string'
       or jsonb_typeof(item->'kind') is distinct from 'string'
       or jsonb_typeof(item->'pricing_mode') is distinct from 'string'
       or (item ? 'id' and jsonb_typeof(item->'id')<>'string') then
      raise exception 'Invalid optional offer fields' using errcode='22023';
    end if;
    v_target:=(item->>'target_product_id')::uuid; v_variant:=(item->>'target_variant_id')::uuid;
    v_kind:=item->>'kind'; v_mode:=item->>'pricing_mode';
    if v_target=p_product_id or v_kind not in ('complementary','accompanying')
       or v_mode not in ('catalog','percent','fixed') then
      raise exception 'Invalid optional offer target or kind' using errcode='22023';
    end if;
    if not exists(select 1 from public.product_variants where id=v_variant and product_id=v_target) then
      raise exception 'Target variant must belong to target product' using errcode='22023';
    end if;
    if v_variant=any(v_targets) then raise exception 'Duplicate optional offer target' using errcode='22023'; end if;
    v_targets:=array_append(v_targets,v_variant);
    if (item ? 'label_he' and jsonb_typeof(item->'label_he') not in ('string','null'))
       or (item ? 'label_en' and jsonb_typeof(item->'label_en') not in ('string','null')) then
      raise exception 'Invalid optional offer label' using errcode='22023';
    end if;
    v_label_he:=nullif(btrim(item->>'label_he'),''); v_label_en:=nullif(btrim(item->>'label_en'),'');
    if length(v_label_he)>160 or length(v_label_en)>160 then raise exception 'Optional offer label too long' using errcode='22023'; end if;
    foreach field in array array['discount_bps','fixed_price_agorot','sort_order'] loop
      if item ? field and jsonb_typeof(item->field)<>'null' and
         (jsonb_typeof(item->field)<>'number' or (item->>field)::numeric<>trunc((item->>field)::numeric)) then
        raise exception 'Optional offer numbers must be integers' using errcode='22023';
      end if;
    end loop;
    if item ? 'is_active' and jsonb_typeof(item->'is_active')<>'boolean' then
      raise exception 'Invalid optional offer active state' using errcode='22023';
    end if;
    if item ? 'sort_order' and jsonb_typeof(item->'sort_order')='null' then
      raise exception 'Invalid optional offer sort order' using errcode='22023';
    end if;
    v_bps:=(item->>'discount_bps')::integer; v_fixed:=(item->>'fixed_price_agorot')::bigint;
    v_sort:=coalesce((item->>'sort_order')::integer,v_position); v_position:=v_position+1;
    if v_sort<0 then raise exception 'Invalid optional offer sort order' using errcode='22023'; end if;
    v_active:=coalesce((item->>'is_active')::boolean,true);
    if (v_mode='catalog' and (v_bps is not null or v_fixed is not null))
       or (v_mode='percent' and (v_bps is null or v_bps not between 1 and 9500 or v_fixed is not null))
       or (v_mode='fixed' and (v_fixed is null or v_fixed not between 1 and 100000000 or v_bps is not null)) then
      raise exception 'Invalid optional offer pricing' using errcode='22023';
    end if;

    v_id:=(item->>'id')::uuid;
    if v_id is not null then
      select * into v_existing from public.product_optional_offers where id=v_id;
      if found and v_existing.parent_product_id<>p_product_id then
        raise exception 'Invalid optional offer identity' using errcode='22023';
      end if;
    end if;
    select * into v_existing from public.product_optional_offers where parent_product_id=p_product_id and target_variant_id=v_variant;
    if found then
      -- A re-added target revives its original identity, including a previously
      -- removed row. A newly generated client ID does not discard provenance.
      v_id:=v_existing.id;
    else
      v_id:=coalesce(v_id,gen_random_uuid());
    end if;
    if v_id=any(v_ids) then raise exception 'Duplicate optional offer identity' using errcode='22023'; end if;
    v_ids:=array_append(v_ids,v_id);
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('id',v_id,'target_product_id',v_target,'target_variant_id',v_variant,
      'kind',v_kind,'label_he',v_label_he,'label_en',v_label_en,'pricing_mode',v_mode,'discount_bps',v_bps,
      'fixed_price_agorot',v_fixed,'is_active',v_active,'sort_order',v_sort));
  end loop;

  update public.product_optional_offers set deleted_at=now(),updated_at=now()
    where parent_product_id=p_product_id and deleted_at is null and not(id=any(v_ids));
  for item in select value from jsonb_array_elements(v_rows) loop
    insert into public.product_optional_offers(id,parent_product_id,target_product_id,target_variant_id,kind,label_he,label_en,
      pricing_mode,discount_bps,fixed_price_agorot,is_active,sort_order)
    values((item->>'id')::uuid,p_product_id,(item->>'target_product_id')::uuid,(item->>'target_variant_id')::uuid,
      item->>'kind',item->>'label_he',item->>'label_en',item->>'pricing_mode',(item->>'discount_bps')::integer,
      (item->>'fixed_price_agorot')::bigint,(item->>'is_active')::boolean,(item->>'sort_order')::integer)
    on conflict(id) do update set target_product_id=excluded.target_product_id,target_variant_id=excluded.target_variant_id,
      kind=excluded.kind,label_he=excluded.label_he,label_en=excluded.label_en,pricing_mode=excluded.pricing_mode,
      discount_bps=excluded.discount_bps,fixed_price_agorot=excluded.fixed_price_agorot,is_active=excluded.is_active,
      sort_order=excluded.sort_order,deleted_at=null,updated_at=now()
      where public.product_optional_offers.parent_product_id=excluded.parent_product_id;
    if not found then raise exception 'Invalid optional offer identity' using errcode='22023'; end if;
  end loop;
  update public.product_optional_offer_sets set revision=v_revision+1,updated_at=now() where parent_product_id=p_product_id;
  insert into public.audit_events(action,user_id,entity_type,entity_id,details)
    values('product_optional_offers_replaced',auth.uid(),'product',p_product_id,
      jsonb_build_object('product_id',p_product_id,'previous_revision',v_revision,'revision',v_revision+1,'offer_count',jsonb_array_length(v_rows)));
  return public.management_read_product_optional_offers(p_product_id);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid optional offer value' using errcode='22023';
end $$;
revoke all on function public.replace_product_optional_offers(uuid,integer,jsonb) from public;
grant execute on function public.replace_product_optional_offers(uuid,integer,jsonb) to authenticated;

create function public.update_product_with_optional_offers(p_id uuid,p_patch jsonb,p_offers jsonb,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_product public.products; v_offers jsonb;
begin
  if coalesce(public.active_app_role(),'') not in ('admin','ceo') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Invalid product patch' using errcode='22023'; end if;
  if p_patch='{}'::jsonb then
    select * into v_product from public.products where id=p_id for update;
    if not found then raise exception 'Product not found' using errcode='22023'; end if;
  else
    v_product:=public.update_product(p_id,p_patch);
  end if;
  v_offers:=public.replace_product_optional_offers(p_id,p_expected_revision,p_offers);
  return jsonb_build_object('product',to_jsonb(v_product),'optional_offers',v_offers);
end $$;
revoke all on function public.update_product_with_optional_offers(uuid,jsonb,jsonb,integer) from public;
grant execute on function public.update_product_with_optional_offers(uuid,jsonb,jsonb,integer) to authenticated;

comment on table public.product_optional_offers is 'Optional product-detail offers. Server quote validates live parent/target context; configuration never grants client price authority. deleted_at is an internal removal tombstone; inactive configured rows remain editable.';
