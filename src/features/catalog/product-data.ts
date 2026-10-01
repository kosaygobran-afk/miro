export interface ProductVariant {
  id: string;
  sku: string;
  colorHe: string;
  colorEn: string;
  colorHex: string;
  price: number | null;
  stockQty: number;
  lowStockThreshold: number;
  isDefault?: boolean;
}

export interface ProductImage {
  id: string;
  url: string;
  altHe?: string;
  altEn?: string;
  sortOrder: number;
}

export type PromoBadge = {
  id: string;
  key: string;
  label: string;
  shape: "tag" | "burst" | "ticket" | "ribbon" | "hex";
  tone: "sale" | "best" | "new" | "hot" | "limited";
  iconName: string | null;
};

export type PublicPromotion = {
  type: "percent" | "fixed";
  value: number;
  compareAtPrice: number | null;
};

export interface Product {
  id: string;
  name: string;
  description: string;
  shortDescription?: string;
  priceIls: number | null;
  /** Undiscounted catalog price used for interactive variant resolution. */
  basePriceIls?: number | null;
  category: string;
  categorySlug: string;
  badge?: string;
  icon?: string;
  categoryLabel?: string;
  isFeatured?: boolean;
  /** Explicit placement in the managed storefront rail. */
  railSortOrder?: number | null;
  rolePrice?: number;
  variants: ProductVariant[];
  stockQty: number;
  stockState: "in_stock" | "low" | "out";
  outOfStockPolicy:
    "keep_visible_contact" | "keep_visible_restock" | "hide_from_public";
  rawOutOfStockPolicy?:
    | "inherit"
    | "keep_visible_contact"
    | "keep_visible_restock"
    | "hide_from_public";
  trackingMode: "none" | "serial" | "lot";
  expectedRestockDate: string | null;
  slug: string;
  brand?: string;
  modelNumber?: string;
  specifications?: Record<string, string>;
  warranty?: string;
  images: ProductImage[];
  seoTitle?: string;
  seoDescription?: string;
  compareAtPrice?: number | null;
  promoBadges?: PromoBadge[];
  publicPromotion?: PublicPromotion | null;
}
