begin;

create function public.get_public_storefront_vat_rate()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_tax_rate((now() at time zone 'Asia/Jerusalem')::date);
$$;

revoke all on function public.get_public_storefront_vat_rate() from public;
grant execute on function public.get_public_storefront_vat_rate() to anon, authenticated;

comment on function public.get_public_storefront_vat_rate() is
  'Public. Returns only the effective VAT percentage for today in Israel, or null when no rate applies.';

create trigger store_catalog_change_signal
  after insert or update or delete on public.tax_rates
  for each statement execute function public.signal_store_catalog_change();

commit;
