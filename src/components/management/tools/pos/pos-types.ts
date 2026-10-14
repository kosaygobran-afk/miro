export interface PosCatalogItem {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  image_url: string | null;
  category: {
    id: string;
    slug: string;
    name_he: string;
    name_en: string;
  } | null;
  price: number | null;
  sale_price: number | null;
  tracking_mode: "none" | "serial" | "lot";
  variants: PosVariant[];
}

export interface PosVariant {
  id: string;
  sku: string;
  barcode: string | null;
  color_he: string | null;
  color_en: string | null;
  color_hex: string | null;
  price_override: number | null;
  is_default: boolean;
  stock_qty: number;
  low_stock_threshold: number | null;
}

export interface PosCategory {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  sort_order: number;
  is_active: boolean;
}

export interface PosCartLine {
  key: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  discountPerUnit: number;
  product: PosCatalogItem | null;
  variant: PosVariant | null;
  isManual?: boolean;
  isService?: boolean;
  manualName?: string;
}

export interface PosPayment {
  id: string;
  method: "cash" | "credit_card" | "bit" | "bank_transfer" | "check" | "other";
  collectionKind: "manual_recorded" | "provider_collected";
  amount: number;
  installments: number;
  reference: string;
  cashReceived?: number;
}

export interface PosGatewayCapabilities {
  hostedCard: boolean;
  bit: boolean;
}

export interface PosQuotedLine {
  variant_id: string;
  quantity: number;
  unit_price_agorot: number;
  discount_per_unit_agorot: number;
  vat_rate: number;
}

export interface PosPaymentAttemptSnapshot {
  idempotency_key: string;
  state: string;
  method: string;
  amount_agorot: number;
  collection_kind: string;
}

export interface PosTotals {
  subtotal: number;
  discounts: number;
  vat: number | null;
  total: number;
  paid: number;
  remaining: number;
  itemCount: number;
}

export interface PosCustomer {
  id?: string;
  name: string;
  email: string;
  phone: string;
  accountId?: string;
}

export type PosTab = "products" | "categories" | "services" | "manual";

export interface PosDraft {
  idempotencyKey: string;
  customer?: PosCustomer;
  lines: PosCartLine[];
  payments: PosPayment[];
  selectedCategory?: PosCategory | null;
}
