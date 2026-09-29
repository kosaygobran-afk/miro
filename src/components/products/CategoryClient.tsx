"use client";

import { ProductsClient } from "@/components/products/ProductsClient";
import type { Product } from "@/features/catalog/product-data";
import type { PublicContactActions } from "@/lib/contact-config";

export function CategoryClient({
  products,
  category,
  locale,
  initialQuery = "",
  savedProductIds = [],
  contact = null,
}: {
  products: Product[];
  category: { key: string; label: string };
  locale: "he" | "en";
  initialQuery?: string;
  savedProductIds?: string[];
  contact?: PublicContactActions | null;
}) {
  return (
    <ProductsClient
      products={products}
      categories={[category]}
      fixedCategory={category.key}
      locale={locale}
      initialQuery={initialQuery}
      savedProductIds={savedProductIds}
      contact={contact}
    />
  );
}
