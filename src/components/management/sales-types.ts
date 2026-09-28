export type SaleOrderItem = {
  id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sku_snapshot: string;
  product_name_he: string;
  product_name_en: string;
  unit_cost: number;
  vat_rate: number;
  vat_amount: number;
  discount_amount: number;
  net_amount: number;
};

export type SaleOrder = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  user_id: string | null;
  /** resolved by the sales API GET from profiles (recorded_by → auth.users). */
  recordedBy: { id: string; displayName: string | null } | null;
  source: string;
  subtotal: number;
  vat_total: number;
  total: number;
  net_total: number;
  shipping_cost: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_items: SaleOrderItem[];
};

export type CustomerAccount = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  account_status: string;
};

export type CatalogVariant = {
  id: string;
  sku: string;
  barcode: string | null;
  color_he: string | null;
  color_en: string | null;
  color_hex: string | null;
  price_override: number | null;
  is_active: boolean;
  stock_qty: number;
  product_id: string;
};

export type CatalogProduct = {
  id: string;
  name_he: string;
  name_en: string;
  status: string;
  is_active: boolean;
  price: number | null;
  sale_price: number | null;
  tracking_mode: "none" | "serial" | "lot";
  product_variants: CatalogVariant[];
};

export type SaleLine = {
  key: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  discountPerUnit: number;
  product: CatalogProduct | null;
  variant: CatalogVariant | null;
};

/** Mirrors record_sale (20260927090000): VAT-inclusive math per line. */
export function computeLine(
  line: Pick<SaleLine, "quantity" | "unitPrice" | "discountPerUnit">,
  vatRate: number,
): {
  grossBefore: number;
  lineDiscount: number;
  gross: number;
  vat: number;
  net: number;
} {
  const grossBefore = line.quantity * line.unitPrice;
  const lineDiscount =
    Math.round(line.quantity * line.discountPerUnit * 100) / 100;
  const gross = Math.max(grossBefore - lineDiscount, 0);
  const net = Math.round((gross / (1 + vatRate / 100)) * 100) / 100;
  const vat = gross - net;
  return { grossBefore, lineDiscount, gross, vat, net };
}

export function formatIls(amount: number, locale: "he" | "en"): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateTime(iso: string, locale: "he" | "en"): string {
  return new Date(iso).toLocaleString(locale === "he" ? "he-IL" : "en-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
