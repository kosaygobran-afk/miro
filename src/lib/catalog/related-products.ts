import type { Product } from "@/features/catalog/product-data";
import { shouldHideFromPublic } from "./pricing";

/** Request-scoped catalog only: never invent compatibility or share role prices. */
export function getRelatedProducts(
  current: Product,
  products: Product[],
  limit = 12,
): Product[] {
  const seen = new Set([current.id]);
  return products
    .filter((candidate) => {
      if (
        seen.has(candidate.id) ||
        candidate.category !== current.category ||
        shouldHideFromPublic(candidate.outOfStockPolicy, candidate.stockQty)
      )
        return false;
      seen.add(candidate.id);
      return true;
    })
    .sort((a, b) => {
      const sameChild = (item: Product) =>
        Boolean(
          current.subcategoryId && item.subcategoryId === current.subcategoryId,
        );
      return Number(sameChild(b)) - Number(sameChild(a));
    })
    .slice(0, Math.max(0, limit));
}
