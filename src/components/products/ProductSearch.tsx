"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/features/catalog/product-data";

interface ProductSearchProps {
  products: Product[];
  onSearch: (results: Product[]) => void;
  placeholder: string;
}

export function ProductSearch({
  products,
  onSearch,
  placeholder,
}: ProductSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Keep filtering responsive without recomputing on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  // Filter products based on debounced query
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      onSearch(products);
      return;
    }

    const lowerQuery = debouncedQuery.toLowerCase();
    const filtered = products.filter(
      (product) =>
        product.name.toLowerCase().includes(lowerQuery) ||
        product.description.toLowerCase().includes(lowerQuery) ||
        product.category.toLowerCase().includes(lowerQuery),
    );
    onSearch(filtered);
  }, [debouncedQuery, products, onSearch]);

  const handleClear = useCallback(() => {
    setQuery("");
    onSearch(products);
  }, [products, onSearch]);

  return (
    <div className="mb-8">
      <div className="relative max-w-xl mx-auto">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "miro-search-input w-full border border-border-control bg-surface px-12 py-3.5 text-base text-foreground",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
          )}
          aria-label={placeholder}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="miro-icon-action absolute right-4 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
