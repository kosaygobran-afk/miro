-- RLS filters rows, not columns. A table-wide SELECT grant also exposes new
-- cost/supplier/internal-price columns to customers and anonymous callers.
-- Management HTTP routes and pages already authorize before service reads.
revoke select on public.products,public.product_variants from public,anon,authenticated;
grant select (
  id,category_id,slug,name_he,name_en,short_description_he,short_description_en,
  description_he,description_en,price,compare_at_price,inventory_count,is_active,
  is_featured,image_url,created_at,updated_at,sale_price,status,brand,model_number,
  tags,specifications,warranty_he,warranty_en,seo_title_he,seo_title_en,
  seo_description_he,seo_description_en,sort_order,currency,recommended_price,
  out_of_stock_policy,expected_restock_date,tracking_mode,sales_channel
) on public.products to anon,authenticated;
grant select (
  id,product_id,sku,barcode,color_he,color_en,color_hex,price_override,is_default,
  is_active,stock_qty,low_stock_threshold,created_at,updated_at
) on public.product_variants to anon,authenticated;

-- Customers may read their purchased items under the existing own-order RLS,
-- without learning internal acquisition costs. Staff reads use the authorized
-- service API; restricted mutation RPCs retain their own cost snapshots.
revoke select on public.order_items from public,anon,authenticated;
grant select (
  id,order_id,product_id,quantity,unit_price,total_price,created_at,variant_id,
  sku_snapshot,product_name_he,product_name_en,vat_rate,vat_amount,
  discount_amount,net_amount
) on public.order_items to authenticated;
