import "server-only";
import type { Product } from "@/features/catalog/product-data";
import type { PublicOptionalOffer } from "./product-options";
import { getProductOptionalOffers } from "./product-options-server";

export type OptionalOfferCartIdentity = {
  line_id?: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  offer_id?: string;
  parent_line_id?: string;
  offer_revision?: number;
};

export class OptionalOfferCartChanged extends Error {
  constructor() {
    super("Product option selection changed");
  }
}

/** Advisory/enquiry verification; the payment RPC independently checks under locks. */
export async function resolveCartOptionalOffers(
  lines: OptionalOfferCartIdentity[],
  products: Product[],
  locale: "he" | "en",
): Promise<Map<string, PublicOptionalOffer>> {
  const resolved = new Map<string, PublicOptionalOffer>();
  if (!lines.some((line) => line.offer_id)) return resolved;
  if (
    lines.length > 100 ||
    lines.some((line) => !line.line_id) ||
    new Set(lines.map((line) => line.line_id)).size !== lines.length
  )
    throw new OptionalOfferCartChanged();
  const byLine = new Map(lines.map((line) => [line.line_id!, line]));
  const parents = new Map<string, string>();
  for (const line of lines) {
    if (!line.offer_id) continue;
    const parent = byLine.get(line.parent_line_id ?? "");
    if (
      !parent ||
      parent.offer_id ||
      parent === line ||
      parent.quantity !== line.quantity
    )
      throw new OptionalOfferCartChanged();
    parents.set(parent.product_id, parent.product_id);
  }
  const configurations = new Map(
    await Promise.all(
      [...parents.keys()].map(
        async (productId) =>
          [
            productId,
            await getProductOptionalOffers(productId, products, locale),
          ] as const,
      ),
    ),
  );
  const selected = new Set<string>();
  const totalByVariant = new Map<string, number>();
  for (const line of lines) {
    const product = products.find((entry) => entry.id === line.product_id);
    const variant = product?.variants.find(
      (entry) => entry.id === line.variant_id,
    );
    if (!product || !variant || product.availabilityUnconfirmed)
      throw new OptionalOfferCartChanged();
    const total = (totalByVariant.get(variant.id) ?? 0) + line.quantity;
    if (total > variant.stockQty) throw new OptionalOfferCartChanged();
    totalByVariant.set(variant.id, total);
    if (!line.offer_id) continue;
    const parent = byLine.get(line.parent_line_id!)!;
    const config = configurations.get(parent.product_id)!;
    const offer = config.offers.find((entry) => entry.id === line.offer_id);
    const selectionKey = `${parent.line_id}:${line.offer_id}`;
    if (
      !offer ||
      selected.has(selectionKey) ||
      config.revision !== line.offer_revision ||
      offer.productId !== product.id ||
      offer.variantId !== variant.id ||
      offer.unitPrice === null ||
      offer.unitPrice <= 0 ||
      offer.availabilityUnconfirmed
    )
      throw new OptionalOfferCartChanged();
    selected.add(selectionKey);
    resolved.set(line.line_id!, offer);
  }
  return resolved;
}
