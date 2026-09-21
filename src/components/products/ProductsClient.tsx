"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ProductGrid } from "@/components/products/ProductGrid";
import { storeCopy } from "@/features/catalog/store-copy";
import type { Product } from "@/features/catalog/product-data";

type CatalogCategory = { key: string; label: string };

export function ProductsClient({
  products,
  categories,
  locale,
  initialQuery = "",
  fixedCategory,
}: {
  products: Product[];
  categories: CatalogCategory[];
  locale: "he" | "en";
  initialQuery?: string;
  fixedCategory?: string;
}) {
  const copy = storeCopy[locale];
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(fixedCategory ?? "all");
  const [sort, setSort] = useState("featured");
  const [limit, setLimit] = useState(12);
  const normalized = query.toLocaleLowerCase(locale).trim();
  const filtered = useMemo(
    () =>
      products
        .filter((product) => {
          const matchCategory =
            category === "all" || product.category === category;
          const haystack =
            `${product.name} ${product.description} ${product.category} ${product.categoryLabel ?? ""}`.toLocaleLowerCase(
              locale,
            );
          return (
            matchCategory &&
            normalized.split(/\s+/).every((word) => haystack.includes(word))
          );
        })
        .sort((a, b) =>
          sort === "low"
            ? a.priceIls - b.priceIls
            : sort === "high"
              ? b.priceIls - a.priceIls
              : sort === "name"
                ? a.name.localeCompare(b.name, locale)
                : Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured)),
        ),
    [products, category, normalized, sort, locale],
  );

  function resetFilters() {
    setQuery("");
    setCategory(fixedCategory ?? "all");
    setSort("featured");
    setLimit(12);
  }
  const isFiltered = Boolean(
    query || category !== (fixedCategory ?? "all") || sort !== "featured",
  );

  return (
    <div className="sf-catalog" data-testid="store-catalog">
      <div className="sf-catalog-toolbar">
        <div className="sf-search">
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            aria-label={copy.search}
            placeholder={copy.search}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(12);
            }}
          />
          {query && (
            <button
              type="button"
              aria-label={copy.clear}
              onClick={() => {
                setQuery("");
                setLimit(12);
              }}
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
        <label className="sf-sort">
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span className="sr-only">{copy.sort}</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setLimit(12);
            }}
          >
            <option value="featured">{copy.featured}</option>
            <option value="low">{copy.low}</option>
            <option value="high">{copy.high}</option>
            <option value="name">{copy.name}</option>
          </select>
        </label>
      </div>
      {!fixedCategory && (
        <div
          className="sf-category-filters"
          role="group"
          aria-label={copy.category}
        >
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => {
              setCategory("all");
              setLimit(12);
            }}
          >
            {copy.all}
            <span>{products.length}</span>
          </button>
          {categories.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={category === item.key}
              onClick={() => {
                setCategory(item.key);
                setLimit(12);
              }}
            >
              {item.label}
              <span>
                {
                  products.filter((product) => product.category === item.key)
                    .length
                }
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="sf-catalog-summary">
        <p role="status" aria-live="polite" aria-atomic="true">
          <strong>{filtered.length}</strong> {copy.results}
        </p>
        {isFiltered && (
          <button type="button" onClick={resetFilters}>
            <X size={14} aria-hidden="true" />
            {copy.reset}
          </button>
        )}
      </div>
      {filtered.length ? (
        <ProductGrid products={filtered.slice(0, limit)} locale={locale} />
      ) : (
        <div className="sf-empty">
          <Search size={30} aria-hidden="true" />
          <h3>{copy.noResults}</h3>
          <p>{copy.noResultsText}</p>
          <button
            type="button"
            className="miro-button miro-button-secondary"
            onClick={resetFilters}
          >
            {copy.reset}
          </button>
        </div>
      )}
      {filtered.length > limit && (
        <div className="sf-load-more">
          <button
            type="button"
            className="miro-button miro-button-secondary"
            onClick={() => setLimit((value) => value + 12)}
          >
            {locale === "he" ? "הצגת מוצרים נוספים" : "Load more products"}
            <span>({filtered.length - limit})</span>
          </button>
        </div>
      )}
    </div>
  );
}
