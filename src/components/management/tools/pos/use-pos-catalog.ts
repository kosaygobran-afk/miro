"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import type { PosCatalogItem, PosCategory } from "./pos-types";
import type { Locale } from "@/lib/i18n";

interface UsePosCatalogOptions {
  initialCategory?: PosCategory | null;
  locale: Locale;
}

export function usePosCatalog({
  initialCategory = null,
  locale,
}: UsePosCatalogOptions) {
  const [products, setProducts] = useState<PosCatalogItem[]>([]);
  const [categories, setCategories] = useState<PosCategory[]>([]);
  const [selectedCategory, setSelectedCategoryState] =
    useState<PosCategory | null>(initialCategory);
  const [searchQuery, setSearchQueryState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const loadingRef = useRef(false);
  const currentFilterRef = useRef("");
  const filter = JSON.stringify([
    searchQuery.trim(),
    selectedCategory?.id ?? null,
  ]);
  // Update at commit so a preceding request cannot win during the debounce window.
  useLayoutEffect(() => {
    currentFilterRef.current = filter;
  }, [filter]);
  const invalidateFilter = useCallback(() => {
    controllerRef.current?.abort();
    ++generationRef.current;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setProducts([]);
    setPage(1);
    setTotalPages(1);
  }, []);
  const setSearchQuery = useCallback(
    (query: string) => {
      if (query === searchQuery) return;
      invalidateFilter();
      setSearchQueryState(query);
    },
    [searchQuery, invalidateFilter],
  );
  const setSelectedCategory = useCallback(
    (category: PosCategory | null) => {
      if (category?.id === selectedCategory?.id) return;
      invalidateFilter();
      setSelectedCategoryState(category);
    },
    [selectedCategory?.id, invalidateFilter],
  );

  const fetchProducts = useCallback(
    async (
      query: string,
      categoryId: string | null,
      pageNum: number,
      append = false,
    ) => {
      if (append && loadingRef.current) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const generation = ++generationRef.current;
      const requestedFilter = JSON.stringify([query.trim(), categoryId]);
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      const isCurrent = () =>
        !controller.signal.aborted &&
        generation === generationRef.current &&
        requestedFilter === currentFilterRef.current;
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          page: String(pageNum),
          limit: "30",
        });
        if (categoryId) params.set("category", categoryId);
        const response = await fetch(`/api/management/pos/catalog?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (
          !response.ok ||
          !Array.isArray(data?.products) ||
          !Array.isArray(data?.categories)
        ) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : locale === "he"
                ? "טעינת הקטלוג נכשלה"
                : "Failed to load catalog",
          );
        }
        if (!isCurrent()) return;
        setProducts((previous) =>
          append
            ? [
                ...previous,
                ...data.products.filter(
                  (product: PosCatalogItem) =>
                    !previous.some((existing) => existing.id === product.id),
                ),
              ]
            : data.products,
        );
        setCategories(data.categories);
        setPage(pageNum);
        setTotalPages(
          Number.isSafeInteger(data.totalPages)
            ? Math.max(1, data.totalPages)
            : 1,
        );
      } catch (error) {
        if (!isCurrent()) return;
        setError(
          error instanceof Error
            ? error.message
            : locale === "he"
              ? "טעינת הקטלוג נכשלה"
              : "Failed to load catalog",
        );
      } finally {
        if (generation === generationRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [locale],
  );

  useEffect(() => {
    controllerRef.current?.abort();
    ++generationRef.current;
    loadingRef.current = true;
    const handle = window.setTimeout(() => {
      setPage(1);
      setProducts([]);
      void fetchProducts(searchQuery, selectedCategory?.id ?? null, 1);
    }, 250);
    return () => {
      window.clearTimeout(handle);
      controllerRef.current?.abort();
    };
  }, [searchQuery, selectedCategory?.id, fetchProducts]);

  const loadMore = useCallback(async () => {
    if (page >= totalPages || loadingRef.current) return;
    await fetchProducts(
      searchQuery,
      selectedCategory?.id ?? null,
      page + 1,
      true,
    );
  }, [page, totalPages, searchQuery, selectedCategory?.id, fetchProducts]);
  const refresh = useCallback(async () => {
    await fetchProducts(searchQuery, selectedCategory?.id ?? null, 1);
  }, [searchQuery, selectedCategory?.id, fetchProducts]);

  return {
    products,
    categories,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    loading,
    error,
    page,
    totalPages,
    loadMore,
    hasMore: page < totalPages,
    refresh,
  };
}
