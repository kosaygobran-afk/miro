"use client";

import { ProductsClient } from "@/components/products/ProductsClient";
import type { Product } from "@/features/catalog/product-data";

export function CategoryClient({
  products,
  category,
  locale,
  initialQuery = "",
}: {
  products: Product[];
  category: { key: string; label: string };
  locale: "he" | "en";
  initialQuery?: string;
}) {
  return (
    <ProductsClient
      products={products}
      categories={[category]}
      fixedCategory={category.key}
      locale={locale}
      initialQuery={initialQuery}
    />
  );
}
