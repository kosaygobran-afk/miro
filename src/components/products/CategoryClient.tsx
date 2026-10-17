"use client";

import {
  ProductsClient,
  type SubcategoryNavigation,
} from "@/components/products/ProductsClient";
import type { Product } from "@/features/catalog/product-data";

export function CategoryClient({
  products,
  category,
  locale,
  initialQuery = "",
  savedProductIds = [],
  subcategoryNavigation,
}: {
  products: Product[];
  category: { key: string; label: string };
  locale: "he" | "en";
  initialQuery?: string;
  savedProductIds?: string[];
  subcategoryNavigation?: SubcategoryNavigation;
}) {
  return (
    <ProductsClient
      products={products}
      categories={[category]}
      fixedCategory={category.key}
      locale={locale}
      initialQuery={initialQuery}
      savedProductIds={savedProductIds}
      subcategoryNavigation={subcategoryNavigation}
    />
  );
}
