export type Locale = "he" | "en";

export type ProductStatus = "draft" | "active" | "hidden" | "archived";

export type OutOfStockPolicy =
  | "inherit"
  | "keep_visible_contact"
  | "keep_visible_restock"
  | "hide_from_public";

export type Category = {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  sort_order: number;
  is_active: boolean;
};

export type Supplier = {
  id: string;
  company_name: string;
  is_active?: boolean;
};

export type RolePrice = {
  product_id?: string;
  role: string;
  price: number;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  color_he: string | null;
  color_en: string | null;
  color_hex: string | null;
  price_override: number | null;
  cost_override: number | null;
  supplier_id: string | null;
  supplier_sku: string | null;
  is_default: boolean;
  is_active: boolean;
  low_stock_threshold: number;
  stock_qty: number;
  created_at?: string;
  updated_at?: string;
  suppliers?: { id: string; company_name: string } | null;
};

export type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  alt_he: string | null;
  alt_en: string | null;
  sort_order: number;
};

export type Product = {
  id: string;
  slug: string;
  category_id: string | null;
  name_he: string;
  name_en: string;
  short_description_he: string | null;
  short_description_en: string | null;
  description_he: string | null;
  description_en: string | null;
  price: number | null;
  compare_at_price: number | null;
  sale_price: number | null;
  purchase_cost: number | null;
  is_featured: boolean;
  brand: string | null;
  model_number: string | null;
  tags: string[];
  warranty_he: string | null;
  warranty_en: string | null;
  seo_title_he: string | null;
  seo_title_en: string | null;
  seo_description_he: string | null;
  seo_description_en: string | null;
  sort_order: number;
  out_of_stock_policy: OutOfStockPolicy;
  status: ProductStatus;
  categories: Category | null;
  product_prices: RolePrice[];
  product_variants: ProductVariant[];
  product_images?: ProductImage[];
};

export const STATUS_OPTIONS: ProductStatus[] = [
  "draft",
  "active",
  "hidden",
  "archived",
];

export const OUT_OF_STOCK_POLICIES: OutOfStockPolicy[] = [
  "inherit",
  "keep_visible_contact",
  "keep_visible_restock",
  "hide_from_public",
];

export const PRICE_ROLES = ["customer", "worker", "admin", "ceo"] as const;
export type PriceRole = (typeof PRICE_ROLES)[number];
