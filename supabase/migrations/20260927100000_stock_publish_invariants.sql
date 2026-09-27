-- Stock movement sign enforcement, atomic counted-quantity adjustment, and
-- publication invariants.
--
-- 1. record_stock_movement: explicit per-type sign enforcement.
--      POSITIVE-only (delta > 0): purchase_receipt, customer_return, transfer_in,
--                                 reservation_release
--      NEGATIVE-only (delta < 0): sale, supplier_return, damage, loss, transfer_out,
--                                 reservation
--      EITHER sign:               manual_adjustment, stocktake_correction
--    Zero / wrong sign / unknown type -> 22023. Physical stock may NEVER go negative
--    for ANY type ('Insufficient stock', 22023). Corrections that would underflow
--    belong in adjust_stock, which by construction lands on a non-negative count.
-- 2. adjust_stock is atomic: per-variant advisory lock FIRST, then SELECT ... FOR
--    UPDATE, then the correction movement is written while the lock is still held.
--    Postcondition: concurrent calls end at exactly the counted quantity.
-- 3. Publication invariants (all triggers SECURITY DEFINER so their audit writes do
--    not depend on the caller's table privileges):
--      - products BEFORE INSERT: NEW.status must be 'draft' (else 22023).
--      - products BEFORE UPDATE: if OLD.status='active' AND NEW.status='active',
--        name_he/name_en must be non-empty and category_id must reference an ACTIVE
--        category (else 22023).
--      - product_variants BEFORE UPDATE/DELETE: when the change removes the LAST
--        valid sellable variant (is_active AND sku non-empty AND barcode non-empty)
--        of an ACTIVE product, the product is auto-unpublished to 'hidden' in the
--        same transaction with a 'product_auto_unpublished' audit row
--        (reason 'last_valid_variant_removed').
--      - categories BEFORE UPDATE: is_active true->false auto-unpublishes ALL its
--        active products to 'hidden' in the same transaction, one audit row per
--        product (reason 'category_deactivated').
--      - categories BEFORE DELETE guard is NOT needed: products.category_id is
--        ON DELETE SET NULL (see 20260920151303_init_miro_schema.sql).
--      - publish_product additionally requires the category to be active.
-- 4. product_prices: 0 was never a valid published price (NULL/deleted = not
--    published), so rows with price <= 0 are deleted, then price is constrained
--    to > 0 (NOT NULL already existed).

-- ============================================================
-- 1. record_stock_movement with sign enforcement
-- ============================================================

create or replace function public.record_stock_movement(
  p_variant_id uuid,
  p_delta integer,
  p_type text,
  p_reference text default null,
  p_note text default null,
  p_unit_cost numeric default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_current_qty integer;
  v_new_qty integer;
  v_movement_id uuid;
  v_positive_types text[] := array[
    'purchase_receipt','customer_return','transfer_in','reservation_release'
  ];
  v_negative_types text[] := array[
    'sale','supplier_return','damage','loss','transfer_out','reservation'
  ];
begin
  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'Delta must not be zero' using errcode = '22023';
  end if;

  -- Explicit sign enforcement per movement type
  if p_type = any(v_positive_types) and p_delta < 0 then
    raise exception 'Movement type requires a positive quantity' using errcode = '22023';
  elsif p_type = any(v_negative_types) and p_delta > 0 then
    raise exception 'Movement type requires a negative quantity' using errcode = '22023';
  elsif p_type is null or not (
    p_type = any(v_positive_types) or p_type = any(v_negative_types)
    or p_type in ('manual_adjustment','stocktake_correction')
  ) then
    raise exception 'Invalid movement type' using errcode = '22023';
  end if;

  -- Serialize per variant
  perform pg_advisory_xact_lock(hashtext(p_variant_id::text));

  -- Lock variant row and get current stock
  select stock_qty into v_current_qty
  from public.product_variants
  where id = p_variant_id
  for update;

  if not found then
    raise exception 'Variant not found' using errcode = '22023';
  end if;

  v_new_qty := v_current_qty + p_delta;

  -- Physical stock may never go negative for any type
  if v_new_qty < 0 then
    raise exception 'Insufficient stock' using errcode = '22023';
  end if;

  update public.product_variants
  set stock_qty = v_new_qty, updated_at = timezone('utc'::text, now())
  where id = p_variant_id;

  insert into public.stock_movements (
    variant_id, delta, previous_qty, resulting_qty, type, reference, unit_cost, note, actor_id
  ) values (
    p_variant_id, p_delta, v_current_qty, v_new_qty, p_type, p_reference, p_unit_cost, p_note, auth.uid()
  ) returning id into v_movement_id;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('stock_movement', auth.uid(),
    jsonb_build_object(
      'variant_id', p_variant_id,
      'delta', p_delta,
      'type', p_type,
      'previous_qty', v_current_qty,
      'resulting_qty', v_new_qty,
      'reference', p_reference
    ),
    'product_variant', p_variant_id
  );

  return v_movement_id;
end;
$$;

revoke all on function public.record_stock_movement(uuid,integer,text,text,text,numeric) from public;
grant execute on function public.record_stock_movement(uuid,integer,text,text,text,numeric) to authenticated;

comment on function public.record_stock_movement is
'Core stock ledger entry. Admin/CEO only. Sign is enforced per type: purchase_receipt/customer_return/transfer_in/reservation_release positive; sale/supplier_return/damage/loss/transfer_out/reservation negative; manual_adjustment/stocktake_correction either. Stock never goes negative.';

-- ============================================================
-- 2. adjust_stock: atomic counted-quantity correction
-- ============================================================
-- The per-variant advisory lock is taken FIRST and held for the rest of the
-- transaction, so the read (SELECT ... FOR UPDATE), the delta computation and
-- the stock write are one indivisible unit: concurrent calls can never both
-- read the same starting quantity. The movement is written inline (not via
-- record_stock_movement) so nothing can interleave between "compute delta"
-- and "apply". Resulting quantity is exactly p_counted, which is validated
-- non-negative, so the no-negative-stock invariant always holds.

create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_counted integer,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_qty integer;
  v_delta integer;
  v_movement_id uuid;
begin
  -- Authorization: admin/ceo only
  if public.active_app_role() is null or public.active_app_role() not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_counted is null or p_counted < 0 then
    raise exception 'Counted quantity must not be negative' using errcode = '22023';
  end if;

  -- Serialize per variant FIRST, then lock the row
  perform pg_advisory_xact_lock(hashtext(p_variant_id::text));

  select stock_qty into v_current_qty
  from public.product_variants
  where id = p_variant_id
  for update;

  if not found then
    raise exception 'Variant not found' using errcode = '22023';
  end if;

  v_delta := p_counted - v_current_qty;

  if v_delta = 0 then
    raise exception 'No change' using errcode = '22023';
  end if;

  -- Apply the correction while the advisory lock is still held
  update public.product_variants
  set stock_qty = p_counted, updated_at = timezone('utc'::text, now())
  where id = p_variant_id;

  insert into public.stock_movements (
    variant_id, delta, previous_qty, resulting_qty, type, reference, unit_cost, note, actor_id
  ) values (
    p_variant_id, v_delta, v_current_qty, p_counted, 'stocktake_correction', null, null, p_reason, auth.uid()
  ) returning id into v_movement_id;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('stock_movement', auth.uid(),
    jsonb_build_object(
      'variant_id', p_variant_id,
      'delta', v_delta,
      'type', 'stocktake_correction',
      'previous_qty', v_current_qty,
      'resulting_qty', p_counted,
      'reason', p_reason
    ),
    'product_variant', p_variant_id
  );

  return v_movement_id;
end;
$$;

revoke all on function public.adjust_stock(uuid,integer,text) from public;
grant execute on function public.adjust_stock(uuid,integer,text) to authenticated;

comment on function public.adjust_stock is
'Stocktake correction: atomically sets stock to the counted quantity (advisory lock held across read+write). Admin/CEO only. Rejects negative counts and no-change.';

-- ============================================================
-- 3a. products BEFORE INSERT: must enter as draft
-- ============================================================

create or replace function public.products_enforce_insert_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from 'draft' then
    raise exception 'New products must be created as draft; publish via publish_product'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists products_enforce_insert_draft_trg on public.products;
create trigger products_enforce_insert_draft_trg
  before insert on public.products
  for each row execute function public.products_enforce_insert_draft();

-- ============================================================
-- 3b. products BEFORE UPDATE: staying active requires a complete, sellable record
-- ============================================================

create or replace function public.products_guard_active_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'active' then
    if nullif(btrim(coalesce(new.name_he, '')), '') is null
       or nullif(btrim(coalesce(new.name_en, '')), '') is null then
      raise exception 'Active product requires non-empty Hebrew and English names'
        using errcode = '22023';
    end if;
    if new.category_id is null
       or not exists (
         select 1 from public.categories c
         where c.id = new.category_id and c.is_active = true
       ) then
      raise exception 'Active product requires an active category'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_active_integrity_trg on public.products;
create trigger products_guard_active_integrity_trg
  before update on public.products
  for each row execute function public.products_guard_active_integrity();

-- ============================================================
-- 3c. product_variants BEFORE UPDATE/DELETE: auto-unpublish on last valid variant
-- ============================================================

create or replace function public.product_variants_guard_last_sellable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_valid boolean;
  v_new_valid boolean;
  v_product_status text;
  v_other_valid integer;
begin
  -- "Valid sellable" = is_active AND sku non-empty AND barcode non-empty
  v_old_valid := old.is_active
    and nullif(btrim(old.sku), '') is not null
    and old.barcode is not null
    and nullif(btrim(old.barcode), '') is not null;

  if TG_OP = 'UPDATE' then
    v_new_valid := new.is_active
      and nullif(btrim(new.sku), '') is not null
      and new.barcode is not null
      and nullif(btrim(new.barcode), '') is not null;
  else
    v_new_valid := false;
  end if;

  -- Only removing a previously valid variant can orphan an active product
  if not v_old_valid or v_new_valid then
    return coalesce(new, old);
  end if;

  select status into v_product_status
  from public.products
  where id = old.product_id;

  if v_product_status is null or v_product_status <> 'active' then
    return coalesce(new, old);
  end if;

  select count(*) into v_other_valid
  from public.product_variants v
  where v.product_id = old.product_id
    and v.id <> old.id
    and v.is_active
    and nullif(btrim(v.sku), '') is not null
    and v.barcode is not null
    and nullif(btrim(v.barcode), '') is not null;

  if v_other_valid > 0 then
    return coalesce(new, old);
  end if;

  -- Last valid sellable variant removed: auto-unpublish in the same transaction
  update public.products
  set status = 'hidden', updated_at = timezone('utc'::text, now())
  where id = old.product_id;

  insert into public.audit_events (action, user_id, details, entity_type, entity_id)
  values ('product_auto_unpublished', auth.uid(),
    jsonb_build_object(
      'product_id', old.product_id,
      'variant_id', old.id,
      'reason', 'last_valid_variant_removed',
      'operation', TG_OP
    ),
    'product', old.product_id
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists product_variants_guard_last_sellable_trg on public.product_variants;
create trigger product_variants_guard_last_sellable_trg
  before update or delete on public.product_variants
  for each row execute function public.product_variants_guard_last_sellable();

-- ============================================================
-- 3d. categories BEFORE UPDATE: deactivation unpublishes its active products
-- ============================================================

create or replace function public.categories_guard_deactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active then
    insert into public.audit_events (action, user_id, details, entity_type, entity_id)
    select
      'product_auto_unpublished',
      auth.uid(),
      jsonb_build_object(
        'product_id', p.id,
        'category_id', new.id,
        'reason', 'category_deactivated'
      ),
      'product',
      p.id
    from public.products p
    where p.category_id = new.id and p.status = 'active';

    update public.products
    set status = 'hidden', updated_at = timezone('utc'::text, now())
    where category_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_guard_deactivation_trg on public.categories;
create trigger categories_guard_deactivation_trg
  before update of is_active on public.categories
  for each row execute function public.categories_guard_deactivation();

-- (No categories BEFORE DELETE guard: products.category_id is ON DELETE SET NULL.)

-- ============================================================
-- 3e. publish_product also requires an active category
-- ============================================================

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
  v_variant_count integer;
begin
  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Serialize per product
  perform pg_advisory_xact_lock(hashtext(p_product::text));

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

  if v_product.name_he is null or v_product.name_he = '' then
    raise exception 'Missing Hebrew name' using errcode = '22023';
  end if;
  if v_product.name_en is null or v_product.name_en = '' then
    raise exception 'Missing English name' using errcode = '22023';
  end if;
  if v_product.category_id is null then
    raise exception 'Missing category' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.categories c
    where c.id = v_product.category_id and c.is_active = true
  ) then
    raise exception 'Category is not active' using errcode = '22023';
  end if;

  -- At least one valid sellable variant (active, SKU and barcode non-empty)
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

  update public.products
  set status = 'active',
      updated_at = timezone('utc'::text, now())
  where id = p_product;

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

comment on function public.publish_product is
'Publish product to storefront. Admin/CEO only. Requires HE/EN names, an ACTIVE category and at least one active variant with SKU and barcode. Audited.';

-- ============================================================
-- 4. product_prices: price must be positive
-- ============================================================
-- A role price of 0 is exactly "price not published"; the API layer uses
-- delete-instead-of-zero. Remove such rows before tightening the constraint.

delete from public.product_prices where price <= 0;

alter table public.product_prices
  drop constraint if exists product_prices_price_check;

alter table public.product_prices
  add constraint product_prices_price_check check (price > 0);

comment on table public.product_prices is
  'Per-role published prices. price > 0 always; absence of a row = not published for that role.';
