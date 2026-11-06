import type { Product } from "@/features/catalog/product-data";

export type ProductOptionKind = "complementary" | "accompanying";
export type ProductOptionPricingMode = "catalog" | "percent" | "fixed";

/** Persisted configuration uses integer basis points/agorot, never browser totals. */
export type OptionalOfferDraft = {
  id?: string;
  target_product_id: string;
  target_variant_id: string;
  kind: ProductOptionKind;
  label_he: string | null;
  label_en: string | null;
  pricing_mode: ProductOptionPricingMode;
  discount_bps: number | null;
  fixed_price_agorot: number | null;
  is_active: boolean;
  sort_order: number;
};

export type ManagedOptionalOffer = OptionalOfferDraft & {
  id: string;
  parent_product_id?: string;
  target?: {
    name_he: string;
    name_en: string;
    slug: string;
    status: string;
    sku: string;
  };
};

export type ProductOptionalOffers = {
  revision: number;
  offers: ManagedOptionalOffer[];
};

/** Detail-only safe DTO; no costs, private product metadata or management fields. */
export type PublicOptionalOffer = {
  id: string;
  kind: ProductOptionKind;
  revision: number;
  label: string;
  productId: string;
  variantId: string;
  name: string;
  sku: string;
  slug: string;
  category: string;
  imageUrl: string | null;
  regularPrice: number | null;
  unitPrice: number | null;
  stockQty: number;
  availabilityUnconfirmed: boolean;
  pricingMode: ProductOptionPricingMode;
};

export type CartOptionalOffer = Pick<
  PublicOptionalOffer,
  | "id"
  | "kind"
  | "revision"
  | "label"
  | "productId"
  | "variantId"
  | "name"
  | "sku"
  | "slug"
  | "category"
  | "imageUrl"
> & { unitPrice: number };

export function optionalOfferPrice(
  catalogPrice: number | null,
  offer: Pick<
    OptionalOfferDraft,
    "pricing_mode" | "discount_bps" | "fixed_price_agorot"
  >,
): number | null {
  if (
    catalogPrice === null ||
    !Number.isFinite(catalogPrice) ||
    catalogPrice <= 0
  )
    return null;
  const regular = Math.round(catalogPrice * 100);
  if (offer.pricing_mode === "catalog") return regular / 100;
  if (offer.pricing_mode === "fixed") {
    const fixed = offer.fixed_price_agorot;
    return fixed !== null && Number.isSafeInteger(fixed) && fixed > 0
      ? fixed / 100
      : null;
  }
  const bps = offer.discount_bps;
  if (bps === null || !Number.isInteger(bps) || bps < 1 || bps > 9500)
    return null;
  const amount = Math.round((regular * (10000 - bps)) / 10000);
  return amount > 0 ? amount / 100 : null;
}

export function optionalOfferImage(product: Product, variantId: string) {
  return (
    product.images.find((image) => image.variantId === variantId)?.url ??
    product.images.find((image) => !image.variantId)?.url ??
    product.images[0]?.url ??
    null
  );
}

/** Explicit projection also removes picker-only target descriptions before saving. */
export function optionalOfferDraft(
  offer: OptionalOfferDraft,
): OptionalOfferDraft {
  return {
    ...(offer.id ? { id: offer.id } : {}),
    target_product_id: offer.target_product_id,
    target_variant_id: offer.target_variant_id,
    kind: offer.kind,
    label_he: offer.label_he,
    label_en: offer.label_en,
    pricing_mode: offer.pricing_mode,
    discount_bps: offer.discount_bps,
    fixed_price_agorot: offer.fixed_price_agorot,
    is_active: offer.is_active,
    sort_order: offer.sort_order,
  };
}
