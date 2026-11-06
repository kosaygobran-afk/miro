import type { CartOptionalOffer } from "@/lib/catalog/product-options";

export const MAX_CHECKOUT_LINES = 100;

export type CartItem = {
  lineId?: string;
  productId: string;
  variantId: string | null;
  slug: string;
  category: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  optionalOffers?: CartOptionalOffer[];
};

export function cartConfigurationKey(
  item: Pick<CartItem, "productId" | "variantId" | "optionalOffers">,
) {
  const offers = (item.optionalOffers ?? [])
    .map((offer) => `${offer.id}@${offer.revision}`)
    .sort()
    .join(",");
  return `${item.productId}:${item.variantId ?? "default"}${offers ? `:${offers}` : ""}`;
}

export function cartLineId(item: CartItem) {
  return item.lineId ?? `${item.productId}:${item.variantId ?? "default"}`;
}

export function cartUnitTotal(item: CartItem) {
  return (
    (Math.round(item.unitPrice * 100) +
      (item.optionalOffers ?? []).reduce(
        (total, offer) => total + Math.round(offer.unitPrice * 100),
        0,
      )) /
    100
  );
}

export function formatCartPrice(
  price: number | null,
  locale: "he" | "en",
  unpublished: string,
) {
  if (price === null || !Number.isFinite(price)) return unpublished;
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export type CheckoutCartLine = {
  line_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  offer_id?: string;
  parent_line_id?: string;
  offer_revision?: number;
};

/** Identity/context only. A server always resolves prices and stock afresh. */
export function checkoutCartLines(items: CartItem[]): CheckoutCartLine[] {
  return items.flatMap((item) => {
    const lineId = cartLineId(item);
    return [
      {
        line_id: lineId,
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity,
      },
      ...(item.optionalOffers ?? []).map((offer) => ({
        line_id: `${lineId}:${offer.id}`,
        product_id: offer.productId,
        variant_id: offer.variantId,
        quantity: item.quantity,
        offer_id: offer.id,
        parent_line_id: lineId,
        offer_revision: offer.revision,
      })),
    ];
  });
}
