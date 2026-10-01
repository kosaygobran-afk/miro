/**
 * Inventory Settings & Stock Semantics
 *
 * This module defines the separate concepts for inventory management:
 * 1. Public Visibility - controls whether product is shown on storefront when out of stock
 * 2. Quantity Tracking - controls how stock is tracked (none/serial/lot)
 * 3. Sale Permission - controls whether product/variant can be sold
 * 4. Traceability - controls serial/lot tracking for individual units
 *
 * These concepts are resolved server-side before building DTOs.
 */

// ============================================================
// 1. PUBLIC VISIBILITY (out_of_stock_policy)
// ============================================================

/**
 * Policy for public visibility when stock reaches zero.
 * - "inherit": Use the global inventory_defaults.out_of_stock_policy
 * - "keep_visible_contact": Show product with "contact for availability" CTA
 * - "keep_visible_restock": Show product with expected restock date
 * - "hide_from_public": Hide product completely from storefront
 */
export type OutOfStockPolicy =
  | "inherit"
  | "keep_visible_contact"
  | "keep_visible_restock"
  | "hide_from_public";

/**
 * Resolved (non-inherit) out of stock policy for public-facing DTOs.
 */
export type ResolvedOutOfStockPolicy = Exclude<OutOfStockPolicy, "inherit">;

/**
 * Global inventory defaults stored in business_settings.inventory_defaults
 */
export interface InventoryDefaults {
  /** Threshold below which stock is considered "low" (default: 3) */
  low_stock_threshold: number;
  /** Default policy for products with out_of_stock_policy = "inherit" */
  out_of_stock_policy: ResolvedOutOfStockPolicy;
}

// ============================================================
// 2. QUANTITY TRACKING (tracking_mode)
// ============================================================

/**
 * Tracking mode determines how inventory quantity is managed.
 * - "none": Simple quantity tracking (aggregate stock_qty on variant)
 * - "serial": Per-unit serial number tracking (product_serial_units table)
 * - "lot": Batch/lot code tracking (product_serial_units with lot_code)
 */
export type TrackingMode = "none" | "serial" | "lot";

/**
 * Whether a tracking mode enables quantity enforcement on sales.
 * Only "none" allows selling without stock checks.
 */
export function trackingModeEnforcesStock(mode: TrackingMode): boolean {
  return mode !== "none";
}

/**
 * Whether a tracking mode requires traceability (serial/lot units).
 */
export function trackingModeRequiresTraceability(mode: TrackingMode): boolean {
  return mode === "serial" || mode === "lot";
}

// ============================================================
// 3. SALE PERMISSION (status + is_active)
// ============================================================

/**
 * Product status - primary gate for sale permission.
 * Only "active" products can be sold via record_sale.
 */
export type ProductStatus = "draft" | "active" | "hidden" | "archived";

/**
 * Whether a product status allows sales.
 */
export function productStatusAllowsSale(status: ProductStatus): boolean {
  return status === "active";
}

/**
 * Variant active state - secondary gate for sale permission.
 * A variant must be both is_active=true AND product.status="active" to be sellable.
 */
export interface SalePermission {
  productActive: boolean;
  variantActive: boolean;
  trackingMode: TrackingMode;
  stockQty: number;
  quantityRequested: number;
}

/**
 * Check if a sale is permitted based on all gates.
 */
export function canSell(permission: SalePermission): boolean {
  if (!permission.productActive) return false;
  if (!permission.variantActive) return false;
  if (trackingModeEnforcesStock(permission.trackingMode)) {
    return permission.stockQty >= permission.quantityRequested;
  }
  return true; // tracking_mode = "none" allows sale regardless of stock
}

// ============================================================
// 4. TRACEABILITY (serial/lot units)
// ============================================================

/**
 * Individual serial/lot unit state.
 * Used when tracking_mode is "serial" or "lot".
 */
export type SerialUnitState =
  "in_stock" | "sold" | "returned" | "damaged" | "rma" | "reserved";

/**
 * Serial/lot unit record (mirrors product_serial_units table).
 */
export interface SerialUnit {
  id: string;
  variantId: string;
  serialNumber: string;
  lotCode: string | null;
  state: SerialUnitState;
  receivedAt: string | null;
  soldAt: string | null;
  supplierId: string | null;
  purchaseReference: string | null;
  orderId: string | null;
  warrantyUntil: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 5. RESOLVED INVENTORY DTO (for public API responses)
// ============================================================

/**
 * Fully resolved inventory state for a product variant,
 * with all inheritance resolved server-side.
 */
export interface ResolvedVariantInventory {
  variantId: string;
  sku: string;
  barcode: string | null;
  stockQty: number;
  lowStockThreshold: number;
  reorderPoint: number | null;
  reorderQty: number | null;
  isActive: boolean;
  isDefault: boolean;

  // Resolved settings (no "inherit" values)
  trackingMode: TrackingMode;
  outOfStockPolicy: ResolvedOutOfStockPolicy;
  expectedRestockDate: string | null;

  // Computed states
  stockState: "in_stock" | "low" | "out";
  canSell: boolean;
  isTracked: boolean;
  requiresTraceability: boolean;
  hideFromPublicWhenOut: boolean;
  showRestockDate: boolean;
  showContactCta: boolean;
}

/**
 * Fully resolved inventory state for a product (aggregated across variants).
 */
export interface ResolvedProductInventory {
  productId: string;
  status: ProductStatus;
  trackingMode: TrackingMode;
  outOfStockPolicy: ResolvedOutOfStockPolicy;
  expectedRestockDate: string | null;

  // Aggregated across all active variants
  totalStockQty: number;
  aggregateStockState: "in_stock" | "low" | "out";
  hasActiveVariants: boolean;
  anyVariantTracked: boolean;

  // Computed states
  productCanSell: boolean;
  hideFromPublicWhenOut: boolean;
  showRestockDate: boolean;
  showContactCta: boolean;
}

// ============================================================
// 6. STOCK MOVEMENT TYPES (for ledger)
// ============================================================

/**
 * Stock movement types with their sign enforcement.
 * Positive delta: inbound | Negative delta: outbound | Either: corrections
 */
export type StockMovementType =
  // Positive only (inbound)
  | "purchase_receipt"
  | "customer_return"
  | "transfer_in"
  | "reservation_release"
  // Negative only (outbound)
  | "sale"
  | "supplier_return"
  | "damage"
  | "loss"
  | "transfer_out"
  | "reservation"
  // Either sign (corrections)
  | "manual_adjustment"
  | "stocktake_correction";

/**
 * Whether a movement type requires positive delta.
 */
export function movementTypeRequiresPositive(type: StockMovementType): boolean {
  return [
    "purchase_receipt",
    "customer_return",
    "transfer_in",
    "reservation_release",
  ].includes(type);
}

/**
 * Whether a movement type requires negative delta.
 */
export function movementTypeRequiresNegative(type: StockMovementType): boolean {
  return [
    "sale",
    "supplier_return",
    "damage",
    "loss",
    "transfer_out",
    "reservation",
  ].includes(type);
}

/**
 * Whether a movement type allows either sign.
 */
export function movementTypeAllowsEither(type: StockMovementType): boolean {
  return ["manual_adjustment", "stocktake_correction"].includes(type);
}

// ============================================================
// 7. VALIDATION HELPERS
// ============================================================

/**
 * Validate inventory defaults from business_settings.
 */
export function validateInventoryDefaults(value: unknown): InventoryDefaults {
  if (!value || typeof value !== "object") {
    throw new Error("Inventory defaults must be an object");
  }
  const obj = value as Record<string, unknown>;

  const lowStockThreshold =
    typeof obj.low_stock_threshold === "number"
      ? Math.max(0, Math.floor(obj.low_stock_threshold))
      : 3;

  const outOfStockPolicy =
    typeof obj.out_of_stock_policy === "string" &&
    [
      "keep_visible_contact",
      "keep_visible_restock",
      "hide_from_public",
    ].includes(obj.out_of_stock_policy)
      ? (obj.out_of_stock_policy as ResolvedOutOfStockPolicy)
      : "keep_visible_contact";

  return {
    low_stock_threshold: lowStockThreshold,
    out_of_stock_policy: outOfStockPolicy,
  };
}

/**
 * Resolve a product's out_of_stock_policy using global defaults.
 */
export function resolveOutOfStockPolicy(
  productPolicy: OutOfStockPolicy,
  globalDefaults: InventoryDefaults,
): ResolvedOutOfStockPolicy {
  if (productPolicy === "inherit") {
    return globalDefaults.out_of_stock_policy;
  }
  return productPolicy as ResolvedOutOfStockPolicy;
}

/**
 * Compute stock state from quantity and threshold.
 */
export function computeStockState(
  stockQty: number,
  lowStockThreshold: number,
): "in_stock" | "low" | "out" {
  if (stockQty <= 0) return "out";
  if (lowStockThreshold > 0 && stockQty <= lowStockThreshold) return "low";
  return "in_stock";
}

/**
 * Build resolved variant inventory DTO from raw DB data + global defaults.
 */
export function buildResolvedVariantInventory(
  variant: {
    id: string;
    sku: string;
    barcode: string | null;
    stock_qty: number;
    low_stock_threshold: number;
    reorder_point: number | null;
    reorder_qty: number | null;
    is_active: boolean;
    is_default: boolean;
  },
  product: {
    tracking_mode: TrackingMode;
    out_of_stock_policy: OutOfStockPolicy;
    expected_restock_date: string | null;
    status: ProductStatus;
  },
  globalDefaults: InventoryDefaults,
): ResolvedVariantInventory {
  const resolvedPolicy = resolveOutOfStockPolicy(
    product.out_of_stock_policy,
    globalDefaults,
  );
  const stockState = computeStockState(
    variant.stock_qty,
    variant.low_stock_threshold,
  );
  const isTracked = trackingModeEnforcesStock(product.tracking_mode);
  const requiresTraceability = trackingModeRequiresTraceability(
    product.tracking_mode,
  );
  const canSell = productStatusAllowsSale(product.status) && variant.is_active;

  return {
    variantId: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    stockQty: variant.stock_qty,
    lowStockThreshold: variant.low_stock_threshold,
    reorderPoint: variant.reorder_point,
    reorderQty: variant.reorder_qty,
    isActive: variant.is_active,
    isDefault: variant.is_default,
    trackingMode: product.tracking_mode,
    outOfStockPolicy: resolvedPolicy,
    expectedRestockDate: product.expected_restock_date,
    stockState,
    canSell,
    isTracked,
    requiresTraceability,
    hideFromPublicWhenOut: resolvedPolicy === "hide_from_public",
    showRestockDate: resolvedPolicy === "keep_visible_restock",
    showContactCta: resolvedPolicy === "keep_visible_contact",
  };
}

/**
 * Build resolved product inventory DTO from raw DB data + global defaults.
 */
export function buildResolvedProductInventory(
  product: {
    id: string;
    status: ProductStatus;
    tracking_mode: TrackingMode;
    out_of_stock_policy: OutOfStockPolicy;
    expected_restock_date: string | null;
  },
  variants: Array<{
    is_active: boolean;
    stock_qty: number;
    low_stock_threshold: number;
  }>,
  globalDefaults: InventoryDefaults,
): ResolvedProductInventory {
  const resolvedPolicy = resolveOutOfStockPolicy(
    product.out_of_stock_policy,
    globalDefaults,
  );
  const activeVariants = variants.filter((v) => v.is_active);
  const totalStockQty = activeVariants.reduce((sum, v) => sum + v.stock_qty, 0);
  const maxThreshold = Math.max(
    0,
    ...activeVariants.map((v) => v.low_stock_threshold ?? 0),
  );
  const aggregateStockState = computeStockState(totalStockQty, maxThreshold);
  const hasActiveVariants = activeVariants.length > 0;
  const anyVariantTracked = trackingModeEnforcesStock(product.tracking_mode);
  const productCanSell =
    productStatusAllowsSale(product.status) && hasActiveVariants;

  return {
    productId: product.id,
    status: product.status,
    trackingMode: product.tracking_mode,
    outOfStockPolicy: resolvedPolicy,
    expectedRestockDate: product.expected_restock_date,
    totalStockQty,
    aggregateStockState,
    hasActiveVariants,
    anyVariantTracked,
    productCanSell,
    hideFromPublicWhenOut: resolvedPolicy === "hide_from_public",
    showRestockDate: resolvedPolicy === "keep_visible_restock",
    showContactCta: resolvedPolicy === "keep_visible_contact",
  };
}
