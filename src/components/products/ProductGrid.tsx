"use client";

import { ProductCard, type Product } from "@/features/catalog/product-card";
import type { PublicContactActions } from "@/lib/contact-config";

export function ProductGrid({
  products,
  actionLabel,
  emptyLabel = "No store items found.",
  locale = "en",
  savedProductIds = [],
  contact = null,
}: {
  products: Product[];
  actionLabel?: string;
  emptyLabel?: string;
  locale?: "he" | "en";
  savedProductIds?: string[];
  contact?: PublicContactActions | null;
}) {
  if (!products.length) return <p className="sf-empty">{emptyLabel}</p>;
  return (
    <div className="sf-product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          actionLabel={actionLabel}
          locale={locale}
          isSaved={savedProductIds.includes(product.id)}
          contact={contact}
        />
      ))}
    </div>
  );
}
