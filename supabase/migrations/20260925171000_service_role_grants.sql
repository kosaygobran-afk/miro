-- Management API routes use the service_role client; these core catalog/commerce
-- tables predate explicit service grants. Grant explicitly (RLS still applies to
-- anon/authenticated).
grant select, insert, update, delete on public.products, public.categories, public.product_images to service_role;
grant select on public.orders, public.order_items to service_role;
