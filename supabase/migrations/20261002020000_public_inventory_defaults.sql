begin;
-- Stock policy is customer-visible behavior. Expose only its two public fields.
create or replace function public.get_public_inventory_defaults()
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('low_stock_threshold',value->'low_stock_threshold','out_of_stock_policy',value->'out_of_stock_policy')
 from public.business_settings where key = 'inventory_defaults';
$$;
revoke all on function public.get_public_inventory_defaults() from public;
grant execute on function public.get_public_inventory_defaults() to anon, authenticated, service_role;
create or replace function public.signal_storefront_design_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if (tg_op = 'DELETE' and old.key in ('storefront_design','inventory_defaults')) or
    (tg_op <> 'DELETE' and new.key in ('storefront_design','inventory_defaults')) then
   update public.store_catalog_version set version = version + 1, updated_at = clock_timestamp() where id = 1;
 end if;
 return null;
end;
$$;
revoke all on function public.signal_storefront_design_change() from public;
commit;
