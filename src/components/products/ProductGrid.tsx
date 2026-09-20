"use client";

import { ProductCard, type Product } from "@/features/catalog/product-card";

interface ProductGridProps {
  products: Product[];
}

export function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="miro-container py-16 text-center">
        <div className="miro-card p-8 max-w-md mx-auto">
          <p className="text-muted-foreground">No products found.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="miro-section">
      <div className="miro-container">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
