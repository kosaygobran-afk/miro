import type { ProductImage } from "@/features/catalog/product-data";

/** Selected variant first, then general images. Never borrow a sibling's media. */
export function getVariantImages(
  images: ProductImage[],
  variantId: string | null,
): ProductImage[] {
  const sorted = [...images].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  if (!variantId) return sorted.filter((image) => !image.variantId);
  return [
    ...sorted.filter((image) => image.variantId === variantId),
    ...sorted.filter((image) => !image.variantId),
  ];
}
