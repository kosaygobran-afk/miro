"use client";

import { useState } from "react";
import { ProductSearch } from "@/components/products/ProductSearch";
import { ProductGrid } from "@/components/products/ProductGrid";
import { mockProducts } from "@/features/catalog/product-data";

type ProductsTranslations = {
  searchPlaceholder: string;
};

interface ProductsClientProps {
  t: ProductsTranslations;
}

export function ProductsClient({ t }: ProductsClientProps) {
  const [filteredProducts, setFilteredProducts] = useState(mockProducts);

  return (
    <>
      <ProductSearch
        products={mockProducts}
        onSearch={setFilteredProducts}
        placeholder={t.searchPlaceholder}
      />
      <ProductGrid products={filteredProducts} />
    </>
  );
}
