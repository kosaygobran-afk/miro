/** Exact ILS minor-unit arithmetic. API/domain values are integer agorot. */
export const MAX_AGOROT = 999_999_999_999;

export function assertAgorot(value: number, allowNegative = false): number {
  if (
    !Number.isSafeInteger(value) ||
    Math.abs(value) > MAX_AGOROT ||
    (!allowNegative && value < 0)
  ) {
    throw new RangeError("Invalid money amount");
  }
  return value;
}

/** Parse database decimal strings without a binary-float multiplication. */
export function toAgorot(value: string | number): number {
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError("Money requires at most two decimal places");
  const result =
    BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (result > BigInt(MAX_AGOROT)) throw new RangeError("Money exceeds limit");
  return assertAgorot(Number(result));
}

export function fromAgorot(value: number): string {
  assertAgorot(value, true);
  const absolute = Math.abs(value);
  return `${value < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/** Half-up rounding of positive rational amounts, using integer intermediates. */
export function roundRatio(numerator: bigint, denominator: bigint): number {
  if (numerator < BigInt(0) || denominator <= BigInt(0)) {
    throw new RangeError("Invalid monetary ratio");
  }
  const result =
    (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  if (result > BigInt(MAX_AGOROT)) throw new RangeError("Money exceeds limit");
  return assertAgorot(Number(result));
}

export function percentageAmount(
  amountAgorot: number,
  basisPoints: number,
): number {
  assertAgorot(amountAgorot);
  if (
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10_000
  ) {
    throw new RangeError("Invalid percentage");
  }
  return roundRatio(BigInt(amountAgorot) * BigInt(basisPoints), BigInt(10_000));
}

export function grossVatBreakdown(grossAgorot: number, vatBasisPoints: number) {
  assertAgorot(grossAgorot);
  if (
    !Number.isInteger(vatBasisPoints) ||
    vatBasisPoints < 0 ||
    vatBasisPoints > 10_000
  ) {
    throw new RangeError("Invalid tax rate");
  }
  const netAgorot = roundRatio(
    BigInt(grossAgorot) * BigInt(10_000),
    BigInt(10_000 + vatBasisPoints),
  );
  return { netAgorot, vatAgorot: grossAgorot - netAgorot, grossAgorot };
}

export function calculateSaleLine(input: {
  unitAgorot: number;
  quantity: number;
  discountPerUnitAgorot?: number;
  vatBasisPoints: number;
}) {
  const {
    unitAgorot,
    quantity,
    discountPerUnitAgorot = 0,
    vatBasisPoints,
  } = input;
  assertAgorot(unitAgorot);
  assertAgorot(discountPerUnitAgorot);
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10_000 ||
    discountPerUnitAgorot > unitAgorot
  ) {
    throw new RangeError("Invalid sale line");
  }
  const grossAgorot = assertAgorot(
    (unitAgorot - discountPerUnitAgorot) * quantity,
  );
  return {
    ...grossVatBreakdown(grossAgorot, vatBasisPoints),
    discountAgorot: assertAgorot(discountPerUnitAgorot * quantity),
  };
}

export function sumAgorot(values: readonly number[]): number {
  let total = BigInt(0);
  for (const value of values) total += BigInt(assertAgorot(value, true));
  return assertAgorot(Number(total), true);
}

export function formatAgorot(
  value: number,
  locale: "he" | "en" = "he",
): string {
  assertAgorot(value, true);
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(fromAgorot(value)));
}
