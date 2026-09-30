import type { ProductVariant } from "@/features/catalog/product-data";

export type PricingInputs = {
  /** Base product price (from product.price) */
  basePrice: number | null;
  /** Product variants */
  variants: ProductVariant[];
  /** Currently selected variant ID (optional) */
  selectedVariantId: string | null;
  /** Default variant ID (if known, otherwise computed) */
  defaultVariantId: string | null;
  /** Role-based price override (e.g., from product_prices table) */
  roleOverride: number | null;
  /** Explicit variant override for testing/simulation */
  variantOverride: number | null;
  /** Public promotion (percent or fixed discount) - optional */
  publicPromotion?: PublicPromotion | null;
};

export type PublicPromotion = {
  type: "percent" | "fixed";
  value: number;
  compareAtPrice: number | null;
};

export type PricingResult = {
  /** The effective price to display */
  effectivePrice: number | null;
  /** The variant that determines the effective price (or null if base) */
  pricingVariant: ProductVariant | null;
  /** Whether a role override was applied */
  hasRoleOverride: boolean;
  /** Whether a variant override was applied */
  hasVariantOverride: boolean;
  /** Whether the effective price comes from a variant (vs base product) */
  isVariantPrice: boolean;
  /** Public promotion applied (if any) */
  publicPromotion: PublicPromotion | null;
  /** The compare-at price for display (strikethrough) */
  compareAtPrice: number | null;
};

/**
 * Normalize a price value to a valid number or null.
 * Accepts number, string, null, undefined.
 * Returns null for non-positive or non-finite values.
 */
export function normalizePrice(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * Return a display-safe whole-number discount percentage.
 * Invalid, non-discount, and implausibly large discounts are not surfaced.
 */
export function getDiscountPercent(
  compareAtPrice: number | null,
  effectivePrice: number | null,
): number | null {
  if (
    compareAtPrice === null ||
    effectivePrice === null ||
    compareAtPrice <= 0 ||
    effectivePrice < 0 ||
    compareAtPrice <= effectivePrice
  ) {
    return null;
  }

  const percent = Math.round(
    ((compareAtPrice - effectivePrice) / compareAtPrice) * 100,
  );
  return percent > 0 && percent <= 95 ? percent : null;
}

/**
 * Find the default variant from a list of variants.
 * Priority: explicit defaultVariantId > isDefault flag > first variant with price > first variant
 */
export function getDefaultVariant(
  variants: ProductVariant[],
  defaultVariantId: string | null,
): ProductVariant | null {
  if (defaultVariantId) {
    const explicit = variants.find((v) => v.id === defaultVariantId);
    if (explicit) return explicit;
  }
  return (
    variants.find((v) => v.isDefault) ??
    variants.find((v) => v.price !== null) ??
    variants[0] ??
    null
  );
}

/**
 * Centralized pricing resolver.
 * Computes the effective display price based on explicit inputs.
 *
 * Priority order (highest to lowest):
 * 1. variantOverride (explicit test/simulation override)
 * 2. roleOverride (role-based pricing from product_prices table)
 * 3. Selected variant's priceOverride (if selected)
 * 4. Default variant's priceOverride (if exists)
 * 5. Base product price
 *
 * After the base effective price is determined, public promotions are applied:
 * - percent: effectivePrice = basePrice * (1 - value/100)
 * - fixed: effectivePrice = basePrice - value
 *
 * @param inputs - Explicit pricing inputs
 * @returns PricingResult with effective price and metadata
 */
export function resolvePrice(inputs: PricingInputs): PricingResult {
  const {
    basePrice,
    variants,
    selectedVariantId,
    defaultVariantId,
    roleOverride,
    variantOverride,
    publicPromotion,
  } = inputs;

  // 1. Explicit variant override (for testing/simulation)
  if (variantOverride !== null) {
    const baseResult = {
      effectivePrice: variantOverride,
      pricingVariant: null,
      hasRoleOverride: false,
      hasVariantOverride: true,
      isVariantPrice: true,
      publicPromotion: null,
      compareAtPrice: null,
    };
    return applyPublicPromotion(baseResult, publicPromotion);
  }

  // 2. Role-based price override
  if (roleOverride !== null) {
    const baseResult = {
      effectivePrice: roleOverride,
      pricingVariant: null,
      hasRoleOverride: true,
      hasVariantOverride: false,
      isVariantPrice: false,
      publicPromotion: null,
      compareAtPrice: null,
    };
    return applyPublicPromotion(baseResult, publicPromotion);
  }

  // 3. Selected variant price
  if (selectedVariantId) {
    const selectedVariant = variants.find((v) => v.id === selectedVariantId);
    if (selectedVariant && selectedVariant.price !== null) {
      const baseResult = {
        effectivePrice: selectedVariant.price,
        pricingVariant: selectedVariant,
        hasRoleOverride: false,
        hasVariantOverride: false,
        isVariantPrice: true,
        publicPromotion: null,
        compareAtPrice: null,
      };
      return applyPublicPromotion(baseResult, publicPromotion);
    }
  }

  // 4. Default variant price
  const defaultVariant = getDefaultVariant(variants, defaultVariantId);
  if (defaultVariant && defaultVariant.price !== null) {
    const baseResult = {
      effectivePrice: defaultVariant.price,
      pricingVariant: defaultVariant,
      hasRoleOverride: false,
      hasVariantOverride: false,
      isVariantPrice: true,
      publicPromotion: null,
      compareAtPrice: null,
    };
    return applyPublicPromotion(baseResult, publicPromotion);
  }

  // 5. Base product price
  const baseResult = {
    effectivePrice: basePrice,
    pricingVariant: null,
    hasRoleOverride: false,
    hasVariantOverride: false,
    isVariantPrice: false,
    publicPromotion: null,
    compareAtPrice: null,
  };
  return applyPublicPromotion(baseResult, publicPromotion);
}

function applyPublicPromotion(
  baseResult: PricingResult,
  promotion: PublicPromotion | null | undefined,
): PricingResult {
  // Normalize undefined to null
  const promo = promotion ?? null;
  if (!promo || baseResult.effectivePrice === null) {
    return {
      ...baseResult,
      publicPromotion: promo,
      compareAtPrice: promo?.compareAtPrice ?? null,
    };
  }

  const basePrice = baseResult.effectivePrice;
  const discountedPrice =
    promo.type === "percent"
      ? basePrice * (1 - promo.value / 100)
      : basePrice - promo.value;
  const compareAtPrice = promo.compareAtPrice ?? basePrice;

  // Ensure price doesn't go negative
  const finalPrice = Math.max(0, discountedPrice);

  // If discounted price equals base price, don't show as promotion
  if (finalPrice >= basePrice) {
    return {
      ...baseResult,
      publicPromotion: null,
      compareAtPrice: null,
    };
  }

  return {
    ...baseResult,
    effectivePrice: Math.round(finalPrice * 100) / 100, // Round to 2 decimal places
    publicPromotion: promo,
    compareAtPrice,
  };
}

/**
 * Stock state computation.
 * Determines if a product is in_stock, low, or out based on total stock and thresholds.
 */
export type StockInputs = {
  totalStockQty: number;
  variants: ProductVariant[];
};

export type StockState = "in_stock" | "low" | "out";

export function computeStockState(inputs: StockInputs): StockState {
  const { totalStockQty, variants } = inputs;

  if (totalStockQty <= 0) return "out";

  const maxThreshold = Math.max(
    0,
    ...variants.map((v) => v.lowStockThreshold ?? 0),
  );
  if (maxThreshold > 0 && totalStockQty <= maxThreshold) return "low";

  return "in_stock";
}

/**
 * Determine if a product should be hidden from public view.
 */
export function shouldHideFromPublic(
  policy:
    | "inherit"
    | "keep_visible_contact"
    | "keep_visible_restock"
    | "hide_from_public",
  totalStockQty: number,
): boolean {
  return policy === "hide_from_public" && totalStockQty <= 0;
}

/**
 * Format price for display using ILS currency.
 */
export function formatPrice(
  price: number | null,
  locale: "he" | "en",
  priceUnpublishedLabel: string,
): string {
  if (price === null || price === undefined) return priceUnpublishedLabel;
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Get stock badge configuration for display.
 */
export type StockBadgeConfig = {
  type: "in_stock" | "low" | "out" | "restock" | "contact";
  label: string;
  restockDate?: string | null;
};

export function getStockBadgeConfig(
  stockState: StockState,
  policy:
    | "inherit"
    | "keep_visible_contact"
    | "keep_visible_restock"
    | "hide_from_public",
  expectedRestockDate: string | null,
  locale: "he" | "en",
  copy: {
    lowStock: string;
    outOfStockContact: string;
    outOfStockRestock: string;
    expectedRestock: string;
  },
): StockBadgeConfig | null {
  if (stockState === "out") {
    if (policy === "keep_visible_restock" && expectedRestockDate) {
      return {
        type: "restock",
        label: `${copy.outOfStockRestock} ${copy.expectedRestock}: ${expectedRestockDate}`,
        restockDate: expectedRestockDate,
      };
    }
    if (policy === "keep_visible_contact") {
      return {
        type: "contact",
        label: copy.outOfStockContact,
      };
    }
    return {
      type: "out",
      label: locale === "he" ? "אזל מהמלאי" : "Out of stock",
    };
  }
  if (stockState === "low") {
    return {
      type: "low",
      label: copy.lowStock,
    };
  }
  return null;
}
