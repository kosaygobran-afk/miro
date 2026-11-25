begin;
set local lock_timeout = '5s';

-- These trigger functions use only built-in operations and NEW/OLD fields.
alter function public.update_updated_at_column() set search_path = '';
alter function public.products_sync_is_active() set search_path = '';

-- The exclusion constraint keeps its operator-class dependencies by OID.
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- Keep the equivalent category index installed by the Phase 2 foundation.
drop index if exists public.idx_products_category_id;
create index if not exists product_images_product_order_idx
  on public.product_images (product_id, sort_order, id);

commit;
