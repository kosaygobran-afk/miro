"use client";

import { ProductCard, type Product } from "@/features/catalog/product-card";

export function ProductGrid({
  products,
  actionLabel,
  emptyLabel = "No store items found.",
  locale = "en",
}: {
  products: Product[];
  actionLabel?: string;
  emptyLabel?: string;
  locale?: "he" | "en";
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
        />
      ))}
    </div>
  );
}
