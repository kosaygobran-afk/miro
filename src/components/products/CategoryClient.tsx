"use client";

import { useState } from "react";
import { ProductSearch } from "@/components/products/ProductSearch";
import { ProductGrid } from "@/components/products/ProductGrid";
import type { Product } from "@/features/catalog/product-data";

type CategoryTranslations = {
  searchPlaceholder: string;
  showingResults: (args: { count: number; total: number }) => string;
};

interface CategoryClientProps {
  products: Product[];
  t: CategoryTranslations;
}

export function CategoryClient({ products, t }: CategoryClientProps) {
  const [filteredProducts, setFilteredProducts] = useState(products);

  return (
    <>
      <ProductSearch
        products={products}
        onSearch={setFilteredProducts}
        placeholder={t.searchPlaceholder}
      />
      <ProductGrid products={filteredProducts} />
    </>
  );
}
