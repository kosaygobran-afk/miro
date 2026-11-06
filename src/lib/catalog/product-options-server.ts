import "server-only";
import type { Product } from "@/features/catalog/product-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  optionalOfferImage,
  type PublicOptionalOffer,
} from "./product-options";
import { optionalOffersProjectionSchema } from "./product-options-schema";

/** Request-scoped only. Never persist role prices, live stock or failed reads. */
export async function getProductOptionalOffers(
  productId: string,
  catalog: Product[],
  locale: "he" | "en",
): Promise<{ revision: number; offers: PublicOptionalOffer[] }> {
  const client = await createServerSupabaseClient();
  const result = await client.rpc("get_public_product_optional_offers", {
    p_product_id: productId,
  });
  if (result.error) throw new Error("Product options unavailable");
  const parsed = optionalOffersProjectionSchema.safeParse(result.data);
  if (!parsed.success) throw new Error("Invalid product options projection");
  const products = new Map(catalog.map((product) => [product.id, product]));
  const offers: PublicOptionalOffer[] = [];
  for (const offer of parsed.data.offers) {
    if (
      offer.parent_product_id !== productId ||
      offer.catalog_price_agorot === undefined ||
      offer.effective_price_agorot === undefined
    )
      throw new Error("Incomplete product options projection");
    if (!offer.is_active) continue;
    const target = products.get(offer.target_product_id);
    const variant = target?.variants.find(
      (item) => item.id === offer.target_variant_id,
    );
    if (!target || !variant || target.id === productId) continue;
    const regularPrice =
      offer.catalog_price_agorot === null
        ? null
        : offer.catalog_price_agorot / 100;
    const unitPrice =
      offer.effective_price_agorot === null
        ? null
        : offer.effective_price_agorot / 100;
    offers.push({
      id: offer.id,
      kind: offer.kind,
      revision: parsed.data.revision,
      label:
        (locale === "he" ? offer.label_he : offer.label_en)?.trim() ||
        target.name,
      productId: target.id,
      variantId: variant.id,
      name: target.name,
      sku: variant.sku,
      slug: target.slug,
      category: target.category,
      imageUrl: optionalOfferImage(target, variant.id),
      regularPrice,
      unitPrice,
      stockQty: variant.stockQty,
      availabilityUnconfirmed: target.availabilityUnconfirmed ?? false,
      pricingMode: offer.pricing_mode,
    });
  }
  return { revision: parsed.data.revision, offers };
}
