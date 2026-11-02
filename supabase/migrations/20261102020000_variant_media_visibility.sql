-- Image ownership must also respect the variant's existing public visibility
-- (active state and, where installed, customer audience rules). Service-role
-- management and self-authorizing metadata RPCs keep their established access.
create policy "Assigned media follows visible variant" on public.product_images
  as restrictive for select to anon, authenticated
  using (variant_id is null or exists (
    select 1 from public.product_variants v
    where v.id = product_images.variant_id and v.product_id = product_images.product_id
  ));
