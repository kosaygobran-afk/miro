/**
 * Sales channel library for MIRO website
 * Single source of truth for sales channel semantics and related mappings
 */

/**
 * Sales channels constants
 */
export const SALES_CHANNELS = ["pos", "website"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

/**
 * Sales channel filter type
 */
export type SalesChannelFilter = "all" | SalesChannel;

/**
 * Normalizes a sales channel source string to a standard SalesChannel or 'legacy'
 *
 * Mapping rules:
 * - 'pos' -> 'pos'
 * - 'management' -> 'pos' (legacy management-console sale)
 * - 'website' -> 'website'
 * - 'storefront' -> 'website' (legacy)
 * - 'import' and anything else -> 'legacy'
 *
 * @param source - The source string to normalize (can be null or undefined)
 * @returns The normalized sales channel ('pos', 'website', or 'legacy')
 */
export function normalizeSalesChannel(
  source: string | null | undefined,
): SalesChannel | "legacy" {
  if (!source) {
    return "legacy";
  }

  const lowerSource = source.toLowerCase().trim();

  switch (lowerSource) {
    case "pos":
      return "pos";
    case "management":
      return "pos"; // legacy management-console sale
    case "website":
      return "website";
    case "storefront":
      return "website"; // legacy
    default:
      return "legacy"; // 'import' and anything else
  }
}

/**
 * Returns database values for a given sales channel filter
 * Used by API routes to build the p_sources array
 *
 * @param filter - The sales channel filter
 * @returns Array of database values or null for 'all' (which means no filter)
 */
export function channelDbValues(filter: SalesChannelFilter): string[] | null {
  switch (filter) {
    case "all":
      return null; // null means no filter (all channels)
    case "pos":
      return ["pos", "management"]; // includes legacy management
    case "website":
      return ["website", "storefront"]; // includes legacy storefront
    default:
      throw new Error(`Unknown sales channel filter: ${filter}`);
  }
}

/**
 * Payment methods constants
 */
export const PAYMENT_METHODS = [
  "cash",
  "credit_card",
  "bank_transfer",
  "bit",
  "check",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Bilingual labels for payment methods
 */
export const PAYMENT_METHOD_LABELS: Record<
  PaymentMethod,
  { he: string; en: string }
> = {
  cash: { he: "מזומן", en: "Cash" },
  credit_card: { he: "כרטיס אשראי", en: "Credit Card" },
  bank_transfer: { he: "העברה בנקאית", en: "Bank Transfer" },
  bit: { he: "ביט", en: "Bit" },
  check: { he: "צ'ק", en: "Check" },
  other: { he: "אחר", en: "Other" },
};

/**
 * Bilingual labels for sales channels (including legacy)
 */
export const SALES_CHANNEL_LABELS: Record<
  SalesChannel | "legacy",
  { he: string; en: string }
> = {
  pos: { he: "קופה", en: "POS" },
  website: { he: "אתר", en: "Website" },
  legacy: { he: "מדור קודם", en: "Legacy" },
};
