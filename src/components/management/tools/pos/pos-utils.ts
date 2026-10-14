import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type {
  PosCatalogItem,
  PosVariant,
  PosPayment,
  PosCartLine,
  PosTotals,
  PosQuotedLine,
  PosPaymentAttemptSnapshot,
} from "./pos-types";
import { formatIls } from "../../sales-types";
import {
  assertAgorot,
  calculateSaleLine,
  sumAgorot,
  toAgorot,
} from "@/lib/commerce/money";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the effective sell price for a product/variant combination.
 * Priority: variant.price_override > product.sale_price > product.price > 0
 */
export function getEffectivePrice(
  product: PosCatalogItem,
  variant: PosVariant,
): number {
  return variant.price_override ?? product.sale_price ?? product.price ?? 0;
}

/** Missing approved pricing is distinct from an explicit zero-priced item. */
export function hasSellPrice(
  product: PosCatalogItem,
  variant: PosVariant,
): boolean {
  const price = variant.price_override ?? product.sale_price ?? product.price;
  if (price === null || price === undefined) return false;
  try {
    return toAgorot(price) >= 0;
  } catch {
    return false;
  }
}

/**
 * Formats a price in ILS for display.
 * Money/SKU should always be LTR even in RTL layouts.
 */
export function formatPrice(amount: number, locale: "he" | "en"): string {
  return formatIls(amount, locale);
}

/**
 * Checks if a variant has tracked inventory.
 */
export function isTracked(product: PosCatalogItem): boolean {
  return product.tracking_mode !== "none";
}

/**
 * Gets available stock for a variant.
 */
export function getAvailableStock(variant: PosVariant): number {
  return variant.stock_qty;
}

/**
 * Checks if a variant is in stock (for tracked products).
 */
export function isInStock(
  product: PosCatalogItem,
  variant: PosVariant,
): boolean {
  if (!isTracked(product)) return true;
  return variant.stock_qty > 0;
}

/**
 * Checks if a variant is low stock.
 */
export function isLowStock(variant: PosVariant): boolean {
  if (variant.low_stock_threshold === null) return false;
  return variant.stock_qty <= variant.low_stock_threshold;
}

/**
 * Generates a unique key for cart lines.
 */
let lineCounter = 0;
export function generateLineKey(): string {
  return `line-${++lineCounter}`;
}

/**
 * Resets the line counter (use when clearing cart).
 */
export function resetLineCounter(): void {
  lineCounter = 0;
}

/**
 * Computes line totals using VAT rate.
 * Mirrors computeLine from sales-types.ts.
 */
export function computeLineTotals(
  quantity: number,
  unitPrice: number,
  discountPerUnit: number,
  vatRate: number,
): {
  grossBefore: number;
  lineDiscount: number;
  gross: number;
  vat: number;
  net: number;
} {
  const unitAgorot = toAgorot(unitPrice);
  const line = calculateSaleLine({
    unitAgorot,
    quantity,
    discountPerUnitAgorot: toAgorot(discountPerUnit),
    vatBasisPoints: Math.round(vatRate * 100),
  });
  return {
    grossBefore: assertAgorot(unitAgorot * quantity) / 100,
    lineDiscount: line.discountAgorot / 100,
    gross: line.grossAgorot / 100,
    vat: line.vatAgorot / 100,
    net: line.netAgorot / 100,
  };
}

/** All cart/payment sums stay in minor units until display. Invalid draft values fail closed. */
export function computePosTotals(
  lines: PosCartLine[],
  payments: PosPayment[],
  vatRate: number | null,
): PosTotals {
  const selected = lines.filter((line) => Boolean(line.variantId));
  const amounts = selected.map((line) =>
    computeLineTotals(
      line.quantity,
      line.unitPrice,
      line.discountPerUnit,
      vatRate ?? 0,
    ),
  );
  const sum = (values: number[]) => sumAgorot(values.map(toAgorot)) / 100;
  const subtotal = sum(amounts.map((line) => line.grossBefore));
  const discounts = sum(amounts.map((line) => line.lineDiscount));
  const total = sum(amounts.map((line) => line.gross));
  const paid = sum(payments.map((payment) => payment.amount));
  return {
    subtotal,
    discounts,
    total,
    paid,
    vat: vatRate === null ? null : sum(amounts.map((line) => line.vat)),
    remaining: Math.max(0, sumAgorot([toAgorot(total), -toAgorot(paid)]) / 100),
    itemCount: selected.reduce((count, line) => count + line.quantity, 0),
  };
}

/**
 * Validates that payment total matches sale total (in agorot to avoid float issues).
 */
export function validatePaymentTotal(
  payments: PosPayment[],
  total: number,
): boolean {
  try {
    return (
      payments.length > 0 &&
      payments.every((payment) => toAgorot(payment.amount) > 0) &&
      sumAgorot(payments.map((payment) => toAgorot(payment.amount))) ===
        toAgorot(total)
    );
  } catch {
    return false;
  }
}

/** Check each quoted line: an unchanged grand total can still hide changed prices. */
export function comparePosQuote(
  lines: PosCartLine[],
  quoted: PosQuotedLine[] | undefined,
  displayedVatRate: number | null,
) {
  let itemsMatch = Array.isArray(quoted) && quoted.length === lines.length;
  try {
    if (itemsMatch)
      itemsMatch = lines.every((line) => {
        const item = quoted?.find(
          (candidate) => candidate.variant_id === line.variantId,
        );
        return (
          item?.quantity === line.quantity &&
          item.unit_price_agorot === toAgorot(line.unitPrice) &&
          item.discount_per_unit_agorot === toAgorot(line.discountPerUnit)
        );
      });
  } catch {
    itemsMatch = false;
  }
  const rates = Array.isArray(quoted)
    ? Array.from(new Set(quoted.map((item) => item.vat_rate)))
    : [];
  const vatRate =
    rates.length === 1 &&
    Number.isFinite(rates[0]) &&
    rates[0] >= 0 &&
    rates[0] <= 100
      ? rates[0]
      : null;
  return { itemsMatch, vatRate, taxNeedsReview: vatRate !== displayedVatRate };
}

/** Only a verified terminal provider failure may create a new collection attempt. */
export function getPosPaymentRecovery(
  payment: PosPayment,
  attempts: PosPaymentAttemptSnapshot[],
): "new" | "captured" | "resume" | "retry" | "blocked" | "conflict" {
  const attempt = attempts.find((item) => item.idempotency_key === payment.id);
  if (!attempt) return "new";
  if (
    attempt.method !== payment.method ||
    attempt.amount_agorot !== toAgorot(payment.amount) ||
    attempt.collection_kind !== payment.collectionKind
  )
    return "conflict";
  if (attempt.state === "captured") return "captured";
  if (
    attempt.collection_kind === "provider_collected" &&
    attempt.state === "pending"
  )
    return "resume";
  if (
    attempt.collection_kind === "provider_collected" &&
    ["declined", "voided"].includes(attempt.state)
  )
    return "retry";
  return "blocked";
}

/** Overdue manual-only partial sales may resume only through the server's narrow confirmed path. */
export function canResumeManualPosIntent(
  status: string,
  expiresAt: string | undefined,
  attempts: PosPaymentAttemptSnapshot[],
  payments: PosPayment[],
  now: number = Date.now(),
): boolean {
  const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
  return (
    ["partially_paid", "exception"].includes(status) &&
    Number.isFinite(expiry) &&
    expiry <= now &&
    attempts.length > 0 &&
    attempts.every(
      (attempt) =>
        attempt.state === "captured" &&
        attempt.collection_kind === "manual_recorded",
    ) &&
    payments.length > 0 &&
    payments.every((payment) => payment.collectionKind === "manual_recorded")
  );
}

/**
 * Generates an idempotency key for POS sales.
 */
export function generateIdempotencyKey(): string {
  return `pos-${crypto.randomUUID()}`;
}

/**
 * Debounce helper for search inputs.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}
