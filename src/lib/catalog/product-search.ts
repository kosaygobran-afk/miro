export const PRODUCT_SEARCH_LIMIT = 5;
export const PRODUCT_SEARCH_QUERY_MAX_LENGTH = 120;

export type ProductSearchItem = {
  id: string;
  href: string;
  name: string;
  brand: string | null;
  model: string | null;
  sku: string | null;
  barcode: string | null;
  imageUrl: string | null;
};

export type ProductSearchPage = {
  results: ProductSearchItem[];
  hasMore: boolean;
  nextCursor: string | null;
};
